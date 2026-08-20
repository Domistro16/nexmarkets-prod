// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";

interface INexPassEditionAdvantageView is IERC721 {
    function termsVersionHashOf(uint256 tokenId) external view returns (bytes32);
}

/// @title NexAdvantageRegistry
/// @notice Canonical remaining utility state for each exact Edition/token ID.
/// @dev Ownership remains authoritative in the Edition ERC-721. This registry
///      stores only the utility attached to that exact serial: transfer never
///      rewrites it, and a listing authority can conservatively lock usage.
contract NexAdvantageRegistry is Ownable, ReentrancyGuard {
    uint8 public constant MAX_ADVANTAGES_PER_PASS = 8;

    enum AdvantageKind {
        TimeBased,
        QuantityBased,
        Connected,
        Redemption
    }

    struct AdvantageConfig {
        bytes32 advantageId;
        AdvantageKind kind;
        uint64 startsAt;
        uint64 endsAt;
        uint256 totalUnits;
        bytes32 definitionHash;
    }

    struct PassRecord {
        bytes32 termsVersionHash;
        bytes32 advantagesHash;
        uint8 advantageCount;
        bool listed;
        bool initialized;
    }

    struct Advantage {
        bytes32 advantageId;
        AdvantageKind kind;
        uint64 startsAt;
        uint64 endsAt;
        uint256 totalUnits;
        uint256 remainingUnits;
        bytes32 definitionHash;
    }

    NexLaunchRegistry public immutable launchRegistry;
    address public initializer;
    address public listingAuthority;

    mapping(address => mapping(uint256 => PassRecord)) private _passRecords;
    mapping(address => mapping(uint256 => mapping(bytes32 => Advantage))) private _advantages;
    mapping(address => mapping(uint256 => bytes32[])) private _advantageIds;
    mapping(bytes32 => bytes32) private _useContexts;

    error AddressRequired();
    error AdvantagesHashMismatch();
    error AdvantageAlreadyExists();
    error AdvantageNotFound();
    error AdvantageUnavailable();
    error AuthorityAlreadySet();
    error AuthorityMustBeContract();
    error InvalidAdvantageKind();
    error InvalidAdvantageWindow();
    error InvalidAdvantageUnits();
    error InvalidPass();
    error ListedPass();
    error NotInitializer();
    error NotListingAuthority();
    error NotPassOwner();
    error PassAlreadyInitialized();
    error PassNotInitialized();
    error RedemptionOnly();
    error TermsVersionMismatch();
    error TooManyAdvantages();
    error UseIdCollision();
    error UseIdRequired();

    event AdvantageAuthoritySet(address indexed initializer, address indexed listingAuthority);
    event PassAdvantagesInitialized(
        address indexed edition,
        uint256 indexed tokenId,
        bytes32 indexed termsVersionHash,
        bytes32 advantagesHash,
        uint256 advantageCount
    );
    event PassListingStateSet(address indexed edition, uint256 indexed tokenId, bool listed);
    event AdvantageConsumed(
        address indexed edition,
        uint256 indexed tokenId,
        bytes32 indexed advantageId,
        address owner,
        bytes32 useId,
        uint256 amount,
        uint256 remainingUnits
    );

    modifier onlyInitializer() {
        if (msg.sender != initializer) revert NotInitializer();
        _;
    }

    modifier onlyListingAuthority() {
        if (msg.sender != listingAuthority) revert NotListingAuthority();
        _;
    }

    constructor(address initialOwner, NexLaunchRegistry launchRegistry_) Ownable(initialOwner) {
        if (initialOwner == address(0) || address(launchRegistry_) == address(0)) revert AddressRequired();
        if (address(launchRegistry_).code.length == 0 || launchRegistry_.owner() != initialOwner) {
            revert AddressRequired();
        }
        launchRegistry = launchRegistry_;
    }

    /// @notice Bind the future mint/utility initializer exactly once.
    /// @dev The initializer is expected to be a contract such as the gated
    ///      mint/controller integration, never an EOA.
    function setInitializer(address initializer_) external onlyOwner {
        if (initializer != address(0)) revert AuthorityAlreadySet();
        if (initializer_ == address(0)) revert AddressRequired();
        if (initializer_.code.length == 0) revert AuthorityMustBeContract();
        initializer = initializer_;
        emit AdvantageAuthoritySet(initializer, listingAuthority);
    }

    /// @notice Bind the future listing registry exactly once.
    function setListingAuthority(address listingAuthority_) external onlyOwner {
        if (listingAuthority != address(0)) revert AuthorityAlreadySet();
        if (listingAuthority_ == address(0)) revert AddressRequired();
        if (listingAuthority_.code.length == 0) revert AuthorityMustBeContract();
        listingAuthority = listingAuthority_;
        emit AdvantageAuthoritySet(initializer, listingAuthority);
    }

    /// @notice Attach immutable Advantage definitions to one exact minted Pass.
    /// @dev The Edition's stored Terms hash and the Registry's Advantages hash
    ///      are checked before any utility state is written.
    function initializePass(
        address edition,
        uint256 tokenId,
        bytes32 termsVersionHash,
        bytes32 advantagesHash,
        AdvantageConfig[] calldata configs
    ) external onlyInitializer nonReentrant {
        if (edition == address(0) || edition.code.length == 0 || tokenId == 0) {
            revert InvalidPass();
        }
        if (termsVersionHash == bytes32(0) || advantagesHash == bytes32(0)) revert TermsVersionMismatch();
        if (configs.length == 0) revert AdvantageNotFound();
        if (configs.length > MAX_ADVANTAGES_PER_PASS) revert TooManyAdvantages();

        PassRecord storage record = _passRecords[edition][tokenId];
        if (record.initialized) revert PassAlreadyInitialized();

        address passOwner;
        bytes32 editionTermsHash;
        try INexPassEditionAdvantageView(edition).ownerOf(tokenId) returns (address owner_) {
            passOwner = owner_;
        } catch {
            revert InvalidPass();
        }
        try INexPassEditionAdvantageView(edition).termsVersionHashOf(tokenId) returns (bytes32 termsHash_) {
            editionTermsHash = termsHash_;
        } catch {
            revert InvalidPass();
        }
        if (passOwner == address(0) || editionTermsHash != termsVersionHash) revert TermsVersionMismatch();

        NexLaunchRegistry.Terms memory terms;
        try launchRegistry.termsOf(edition, termsVersionHash) returns (NexLaunchRegistry.Terms memory terms_) {
            terms = terms_;
        } catch {
            revert TermsVersionMismatch();
        }
        if (terms.advantagesHash != advantagesHash) revert AdvantagesHashMismatch();

        record.termsVersionHash = termsVersionHash;
        record.advantagesHash = advantagesHash;
        record.advantageCount = uint8(configs.length);
        record.initialized = true;

        for (uint256 i; i < configs.length; ++i) {
            AdvantageConfig calldata config = configs[i];
            _validateConfig(config);
            if (_advantages[edition][tokenId][config.advantageId].advantageId != bytes32(0)) {
                revert AdvantageAlreadyExists();
            }

            _advantages[edition][tokenId][config.advantageId] = Advantage({
                advantageId: config.advantageId,
                kind: config.kind,
                startsAt: config.startsAt,
                endsAt: config.endsAt,
                totalUnits: config.totalUnits,
                remainingUnits: config.totalUnits,
                definitionHash: config.definitionHash
            });
            _advantageIds[edition][tokenId].push(config.advantageId);
        }

        emit PassAdvantagesInitialized(edition, tokenId, termsVersionHash, advantagesHash, configs.length);
    }

    /// @notice Lock or unlock utility use while the exact Pass is listed.
    /// @dev Listing state is independent of ERC-721 ownership and therefore
    ///      survives direct transfers until the listing authority clears it.
    function setListed(address edition, uint256 tokenId, bool listed) external onlyListingAuthority {
        PassRecord storage record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        if (record.listed == listed) return;
        record.listed = listed;
        emit PassListingStateSet(edition, tokenId, listed);
    }

    /// @notice Redeem one unit with a globally idempotent redemption ID.
    /// @return applied False when this exact redemption ID was already applied.
    function redeem(address edition, uint256 tokenId, bytes32 advantageId, bytes32 redemptionId)
        external
        nonReentrant
        returns (bool applied)
    {
        if (redemptionId == bytes32(0)) revert UseIdRequired();
        Advantage storage advantage = _getAdvantage(edition, tokenId, advantageId);
        if (advantage.kind != AdvantageKind.Redemption) revert RedemptionOnly();
        return _consume(edition, tokenId, advantage, redemptionId, 1);
    }

    /// @notice Consume quantity-based utility with an idempotent use ID.
    /// @dev Quantity-based utility is distinct from Redemption so product
    ///      integrations can expose uses without creating redemption claims.
    function consumeQuantity(address edition, uint256 tokenId, bytes32 advantageId, uint256 amount, bytes32 useId)
        external
        nonReentrant
        returns (bool applied)
    {
        if (amount == 0 || useId == bytes32(0)) revert UseIdRequired();
        Advantage storage advantage = _getAdvantage(edition, tokenId, advantageId);
        if (advantage.kind != AdvantageKind.QuantityBased) revert AdvantageUnavailable();
        return _consume(edition, tokenId, advantage, useId, amount);
    }

    function passInfo(address edition, uint256 tokenId) external view returns (PassRecord memory) {
        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        return record;
    }

    function advantageIds(address edition, uint256 tokenId) external view returns (bytes32[] memory) {
        if (!_passRecords[edition][tokenId].initialized) revert PassNotInitialized();
        return _advantageIds[edition][tokenId];
    }

    function advantageInfo(address edition, uint256 tokenId, bytes32 advantageId)
        external
        view
        returns (Advantage memory)
    {
        return _getAdvantageView(edition, tokenId, advantageId);
    }

    function isListed(address edition, uint256 tokenId) external view returns (bool) {
        return _passRecords[edition][tokenId].listed;
    }

    /// @notice Return remaining time, units, or one active connected entitlement.
    function remaining(address edition, uint256 tokenId, bytes32 advantageId) external view returns (uint256) {
        Advantage memory advantage = _getAdvantageView(edition, tokenId, advantageId);
        if (!_isActive(advantage)) return 0;
        if (advantage.kind == AdvantageKind.TimeBased) return advantage.endsAt - block.timestamp;
        if (advantage.kind == AdvantageKind.Connected) return 1;
        return advantage.remainingUnits;
    }

    function isUsable(address edition, uint256 tokenId, bytes32 advantageId) external view returns (bool) {
        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized || record.listed) return false;
        Advantage memory advantage = _advantages[edition][tokenId][advantageId];
        if (advantage.advantageId == bytes32(0) || !_isActive(advantage)) return false;
        if (advantage.kind == AdvantageKind.QuantityBased || advantage.kind == AdvantageKind.Redemption) {
            return advantage.remainingUnits != 0;
        }
        return true;
    }

    function redemptionContext(bytes32 useId) external view returns (bytes32) {
        return _useContexts[useId];
    }

    function _consume(address edition, uint256 tokenId, Advantage storage advantage, bytes32 useId, uint256 amount)
        internal
        returns (bool applied)
    {
        bytes32 context = keccak256(abi.encode(edition, tokenId, advantage.advantageId));
        bytes32 priorContext = _useContexts[useId];
        if (priorContext == context) return false;
        if (priorContext != bytes32(0)) revert UseIdCollision();

        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        if (record.listed) revert ListedPass();
        if (!_isActive(advantage) || advantage.remainingUnits < amount) revert AdvantageUnavailable();
        _requirePassOwner(edition, tokenId);

        _useContexts[useId] = context;
        advantage.remainingUnits -= amount;
        emit AdvantageConsumed(
            edition, tokenId, advantage.advantageId, msg.sender, useId, amount, advantage.remainingUnits
        );
        return true;
    }

    function _validateConfig(AdvantageConfig calldata config) internal pure {
        if (config.advantageId == bytes32(0) || config.definitionHash == bytes32(0)) {
            revert AdvantageNotFound();
        }
        if (config.startsAt >= config.endsAt) revert InvalidAdvantageWindow();
        if (config.kind > AdvantageKind.Redemption) revert InvalidAdvantageKind();
        if (config.kind == AdvantageKind.TimeBased || config.kind == AdvantageKind.Connected) {
            if (config.totalUnits != 0) revert InvalidAdvantageUnits();
        } else if (config.totalUnits == 0) {
            revert InvalidAdvantageUnits();
        }
    }

    function _getAdvantage(address edition, uint256 tokenId, bytes32 advantageId)
        internal
        view
        returns (Advantage storage advantage)
    {
        if (!_passRecords[edition][tokenId].initialized) revert PassNotInitialized();
        advantage = _advantages[edition][tokenId][advantageId];
        if (advantage.advantageId == bytes32(0)) revert AdvantageNotFound();
    }

    function _getAdvantageView(address edition, uint256 tokenId, bytes32 advantageId)
        internal
        view
        returns (Advantage memory advantage)
    {
        if (!_passRecords[edition][tokenId].initialized) revert PassNotInitialized();
        advantage = _advantages[edition][tokenId][advantageId];
        if (advantage.advantageId == bytes32(0)) revert AdvantageNotFound();
    }

    function _requirePassOwner(address edition, uint256 tokenId) internal view {
        address currentOwner;
        try INexPassEditionAdvantageView(edition).ownerOf(tokenId) returns (address owner_) {
            currentOwner = owner_;
        } catch {
            revert InvalidPass();
        }
        if (currentOwner != msg.sender) revert NotPassOwner();
    }

    function _isActive(Advantage memory advantage) internal view returns (bool) {
        return block.timestamp >= advantage.startsAt && block.timestamp < advantage.endsAt;
    }
}
