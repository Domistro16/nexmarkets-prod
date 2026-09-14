// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";
import {NexPassEdition} from "./NexPassEdition.sol";
import {NexAdvantageRegistry} from "./NexAdvantageRegistry.sol";

interface INexAdvantageMintInitializer {
    function advantageRegistry() external view returns (address);
    function launchRegistry() external view returns (address);
    function mintController() external view returns (address);
    function owner() external view returns (address);

    function initializeMint(
        address edition,
        uint256 firstTokenId,
        uint256 quantity,
        bytes32 termsVersionHash,
        NexAdvantageRegistry.AdvantageConfig[] calldata configs
    ) external;
}

/// @title NexMintController
/// @notice Validates active launch Terms, settles exact USDG, and mints serials.
/// @dev The controller is deliberately non-upgradeable. A payer-scoped intent
///      key makes wallet retries idempotent without allowing one payer to grief another.
contract NexMintController is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant PROTOCOL_FEE_BPS = 500;

    NexLaunchRegistry public immutable launchRegistry;
    IERC20 public immutable usdg;
    address public immutable protocolFeeRecipient;
    address public advantageInitializer;

    mapping(address => mapping(bytes32 => bool)) private _consumedIntent;
    mapping(address => mapping(bytes32 => uint256)) public allowlistMinted;
    /// @notice edition => termsVersionHash => wallet => Early Access units minted.
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public allowlistWalletMinted;

    struct MintRequest {
        address edition;
        bytes32 termsVersionHash;
        address recipient;
        uint256 quantity;
        bytes32 intentId;
        /// @notice Optional user-supplied hint only; it is not canonical attribution.
        address referralHint;
        /// @notice Exact Advantage definitions committed by the active Terms.
        ///         Must be empty when the Terms have no Advantages.
        NexAdvantageRegistry.AdvantageConfig[] advantageConfigs;
    }

    error AddressRequired();
    error AdvantageInitializerAlreadySet();
    error AdvantageInitializerRequired();
    error AdvantageInitializerWiringMismatch();
    error UnexpectedAdvantages();
    error IntentAlreadyConsumed();
    error IntentRequired();
    error InvalidEditionController();
    error MintClosed();
    error AllowlistSupplyExceeded();
    error NotAllowlisted();
    error WalletAllowanceExceeded();
    error WalletAllowanceRequired();
    error QuantityRequired();
    error TermsChangedDuringMint();
    error TermsNotActive();

    event PrimaryMintSettled(
        address indexed payer,
        address indexed recipient,
        address indexed edition,
        bytes32 termsVersionHash,
        bytes32 intentId,
        uint256 firstTokenId,
        uint256 quantity,
        uint256 totalPaid,
        uint256 protocolFee
    );
    /// @notice Noncanonical user hint; the backend Builder-Settled referral ledger must qualify it.
    event ReferralHintSubmitted(
        bytes32 indexed intentId, address indexed payer, address indexed edition, address referralHint
    );
    event AdvantageInitializerSet(address indexed advantageInitializer);

    constructor(address initialOwner, NexLaunchRegistry launchRegistry_, IERC20 usdg_, address protocolFeeRecipient_)
        Ownable(initialOwner)
    {
        if (
            address(launchRegistry_) == address(0) || address(usdg_) == address(0)
                || protocolFeeRecipient_ == address(0)
        ) {
            revert AddressRequired();
        }
        if (address(launchRegistry_).code.length == 0 || address(usdg_).code.length == 0) revert AddressRequired();
        if (launchRegistry_.settlementToken() != address(usdg_)) revert AddressRequired();
        if (launchRegistry_.owner() != initialOwner) revert AddressRequired();
        launchRegistry = launchRegistry_;
        usdg = usdg_;
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    /// @notice Permanently bind the contract that initializes committed utility.
    /// @dev Optional until an Edition publishes Terms with Advantages; once set,
    ///      the authority cannot be replaced.
    function setAdvantageInitializer(address advantageInitializer_) external onlyOwner {
        if (advantageInitializer != address(0)) revert AdvantageInitializerAlreadySet();
        if (advantageInitializer_ == address(0) || advantageInitializer_.code.length == 0) revert AddressRequired();

        try INexAdvantageMintInitializer(advantageInitializer_).launchRegistry() returns (address registry_) {
            if (registry_ != address(launchRegistry)) revert AdvantageInitializerWiringMismatch();
        } catch {
            revert AdvantageInitializerWiringMismatch();
        }
        try INexAdvantageMintInitializer(advantageInitializer_).mintController() returns (address controller_) {
            if (controller_ != address(this)) revert AdvantageInitializerWiringMismatch();
        } catch {
            revert AdvantageInitializerWiringMismatch();
        }
        try INexAdvantageMintInitializer(advantageInitializer_).owner() returns (address initializerOwner) {
            if (initializerOwner != owner()) revert AdvantageInitializerWiringMismatch();
        } catch {
            revert AdvantageInitializerWiringMismatch();
        }
        try INexAdvantageMintInitializer(advantageInitializer_).advantageRegistry() returns (address registry_) {
            if (registry_ == address(0) || registry_.code.length == 0) revert AdvantageInitializerWiringMismatch();
        } catch {
            revert AdvantageInitializerWiringMismatch();
        }

        advantageInitializer = advantageInitializer_;
        emit AdvantageInitializerSet(advantageInitializer_);
    }

    function mint(MintRequest calldata request) external whenNotPaused nonReentrant returns (uint256 firstTokenId) {
        if (!launchRegistry.isPublicMintOpen(request.edition, request.termsVersionHash)) revert MintClosed();
        return _mint(request);
    }

    /// @notice Mint during the private phase using a proof for the transaction payer.
    /// @param allowance The exact per-wallet Early Access allowance committed by
    ///        the allowlist leaf. It is proven, not asserted, so a wallet cannot
    ///        inflate its own cap.
    function mintAllowlisted(MintRequest calldata request, uint256 allowance, bytes32[] calldata proof)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 firstTokenId)
    {
        if (!launchRegistry.isAllowlistMintOpen(request.edition, request.termsVersionHash)) {
            revert MintClosed();
        }
        if (allowance == 0) revert WalletAllowanceRequired();
        (, NexLaunchRegistry.Terms memory terms) = launchRegistry.activeTerms(request.edition);
        bytes32 leaf = allowlistLeaf(request.edition, msg.sender, allowance);
        if (!MerkleProof.verifyCalldata(proof, terms.allowlistRoot, leaf)) revert NotAllowlisted();

        uint256 phaseMinted = allowlistMinted[request.edition][request.termsVersionHash];
        if (
            terms.allowlistSupply != 0
                && (phaseMinted >= terms.allowlistSupply || request.quantity > terms.allowlistSupply - phaseMinted)
        ) revert AllowlistSupplyExceeded();

        // The proven leaf allowance and any Edition-wide cap both bind.
        uint256 cap = allowance;
        if (terms.walletAllowance != 0 && terms.walletAllowance < cap) cap = terms.walletAllowance;
        uint256 walletMinted = allowlistWalletMinted[request.edition][request.termsVersionHash][msg.sender];
        if (walletMinted >= cap || request.quantity > cap - walletMinted) revert WalletAllowanceExceeded();

        firstTokenId = _mint(request);
        allowlistMinted[request.edition][request.termsVersionHash] = phaseMinted + request.quantity;
        allowlistWalletMinted[request.edition][request.termsVersionHash][msg.sender] = walletMinted + request.quantity;
    }

    /// @notice Canonical Early Access leaf. Binding the chain and the exact
    ///         Edition prevents a proof from being replayed against another
    ///         Edition or another deployment that reuses the same root.
    function allowlistLeaf(address edition, address account, uint256 allowance) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), edition, account, allowance))));
    }

    /// @notice Remaining Early Access units for a wallet under the active Terms.
    function allowlistRemaining(address edition, bytes32 termsVersionHash, address account, uint256 allowance)
        external
        view
        returns (uint256)
    {
        (, NexLaunchRegistry.Terms memory terms) = launchRegistry.activeTerms(edition);
        uint256 cap = allowance;
        if (terms.walletAllowance != 0 && terms.walletAllowance < cap) cap = terms.walletAllowance;
        uint256 minted = allowlistWalletMinted[edition][termsVersionHash][account];
        return minted >= cap ? 0 : cap - minted;
    }

    function _mint(MintRequest calldata request) internal returns (uint256 firstTokenId) {
        if (request.edition == address(0) || request.recipient == address(0)) revert AddressRequired();
        if (request.termsVersionHash == bytes32(0)) revert TermsNotActive();
        if (request.quantity == 0) revert QuantityRequired();
        if (request.intentId == bytes32(0)) revert IntentRequired();
        if (_consumedIntent[msg.sender][request.intentId]) revert IntentAlreadyConsumed();
        if (!launchRegistry.isMintOpen(request.edition, request.termsVersionHash)) revert MintClosed();

        (bytes32 activeTermsHash, NexLaunchRegistry.Terms memory terms) = launchRegistry.activeTerms(request.edition);
        if (activeTermsHash != request.termsVersionHash) revert TermsNotActive();
        if (NexPassEdition(request.edition).mintController() != address(this)) revert InvalidEditionController();
        if (request.quantity > terms.activeSupply - NexPassEdition(request.edition).totalMinted()) revert MintClosed();

        uint256 totalPaid = terms.pricePerPass * request.quantity;
        uint256 protocolFee = (totalPaid * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 primaryAmount = totalPaid - protocolFee;
        _consumedIntent[msg.sender][request.intentId] = true;

        if (protocolFee != 0) usdg.safeTransferFrom(msg.sender, protocolFeeRecipient, protocolFee);
        usdg.safeTransferFrom(msg.sender, terms.primaryRecipient, primaryAmount);
        firstTokenId = NexPassEdition(request.edition)
            .mint(
                request.recipient,
                request.quantity,
                request.termsVersionHash,
                terms.activeSupply,
                terms.royaltyReceiver,
                terms.royaltyBps
            );
        if (terms.advantagesHash == bytes32(0)) {
            if (request.advantageConfigs.length != 0) revert UnexpectedAdvantages();
        } else {
            if (advantageInitializer == address(0)) revert AdvantageInitializerRequired();
            INexAdvantageMintInitializer(advantageInitializer)
                .initializeMint(
                    request.edition, firstTokenId, request.quantity, request.termsVersionHash, request.advantageConfigs
                );
        }
        (bytes32 activeTermsHashAfter,) = launchRegistry.activeTerms(request.edition);
        if (activeTermsHashAfter != request.termsVersionHash) revert TermsChangedDuringMint();

        emit PrimaryMintSettled(
            msg.sender,
            request.recipient,
            request.edition,
            request.termsVersionHash,
            request.intentId,
            firstTokenId,
            request.quantity,
            totalPaid,
            protocolFee
        );
        if (request.referralHint != address(0)) {
            emit ReferralHintSubmitted(request.intentId, msg.sender, request.edition, request.referralHint);
        }
    }

    function isIntentConsumed(address payer, bytes32 intentId) external view returns (bool) {
        return _consumedIntent[payer][intentId];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
