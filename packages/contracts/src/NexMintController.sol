// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";
import {NexPassEdition} from "./NexPassEdition.sol";

/// @title NexMintController
/// @notice Validates active launch Terms, settles exact USDG, and mints serials.
/// @dev The controller is deliberately non-upgradeable. A payer-scoped intent
///      key makes wallet retries idempotent without allowing one payer to grief another.
contract NexMintController is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 500;

    NexLaunchRegistry public immutable launchRegistry;
    IERC20 public immutable usdg;
    address public immutable protocolFeeRecipient;
    uint16 public immutable protocolFeeBps;

    mapping(address => mapping(bytes32 => bool)) private _consumedIntent;

    struct MintRequest {
        address edition;
        bytes32 termsVersionHash;
        address recipient;
        uint256 quantity;
        bytes32 intentId;
        address referrer;
    }

    error AddressRequired();
    error IntentAlreadyConsumed();
    error IntentRequired();
    error InvalidEditionController();
    error InvalidFee();
    error MintClosed();
    error QuantityRequired();
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
        uint256 protocolFee,
        address primaryRecipient,
        address referrer
    );

    constructor(
        address initialOwner,
        NexLaunchRegistry launchRegistry_,
        IERC20 usdg_,
        address protocolFeeRecipient_,
        uint16 protocolFeeBps_
    ) Ownable(initialOwner) {
        if (address(launchRegistry_) == address(0) || address(usdg_) == address(0) || protocolFeeRecipient_ == address(0)) {
            revert AddressRequired();
        }
        if (address(launchRegistry_).code.length == 0 || address(usdg_).code.length == 0) revert AddressRequired();
        if (launchRegistry_.settlementToken() != address(usdg_)) revert AddressRequired();
        if (launchRegistry_.owner() != initialOwner) revert AddressRequired();
        if (protocolFeeBps_ > MAX_PROTOCOL_FEE_BPS) revert InvalidFee();
        launchRegistry = launchRegistry_;
        usdg = usdg_;
        protocolFeeRecipient = protocolFeeRecipient_;
        protocolFeeBps = protocolFeeBps_;
    }

    function mint(MintRequest calldata request) external whenNotPaused nonReentrant returns (uint256 firstTokenId) {
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
        uint256 protocolFee = (totalPaid * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 primaryAmount = totalPaid - protocolFee;
        _consumedIntent[msg.sender][request.intentId] = true;

        if (protocolFee != 0) usdg.safeTransferFrom(msg.sender, protocolFeeRecipient, protocolFee);
        usdg.safeTransferFrom(msg.sender, terms.primaryRecipient, primaryAmount);
        firstTokenId = NexPassEdition(request.edition).mint(
            request.recipient,
            request.quantity,
            request.termsVersionHash,
            terms.activeSupply,
            terms.royaltyReceiver,
            terms.royaltyBps
        );

        emit PrimaryMintSettled(
            msg.sender,
            request.recipient,
            request.edition,
            request.termsVersionHash,
            request.intentId,
            firstTokenId,
            request.quantity,
            totalPaid,
            protocolFee,
            terms.primaryRecipient,
            request.referrer
        );
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
