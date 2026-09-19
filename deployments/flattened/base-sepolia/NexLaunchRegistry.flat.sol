// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20 ^0.8.24;

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// lib/openzeppelin-contracts/contracts/utils/Pausable.sol

// OpenZeppelin Contracts (last updated v5.3.0) (utils/Pausable.sol)

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    bool private _paused;

    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    /**
     * @dev The operation failed because the contract is paused.
     */
    error EnforcedPause();

    /**
     * @dev The operation failed because the contract is not paused.
     */
    error ExpectedPause();

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        if (paused()) {
            revert EnforcedPause();
        }
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        if (!paused()) {
            revert ExpectedPause();
        }
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// src/NexLaunchRegistry.sol

interface INexPassEditionLaunchView {
    function owner() external view returns (address);
    function editionId() external view returns (bytes32);
    function absoluteSupplyCap() external view returns (uint32);
    function totalMinted() external view returns (uint256);
}

interface INexPassFactoryWiring {
    function launchRegistry() external view returns (address);
    function mintController() external view returns (address);
    function protocolAdmin() external view returns (address);
}

interface INexMintControllerWiring {
    function launchRegistry() external view returns (address);
    function owner() external view returns (address);
}

/// @title NexLaunchRegistry
/// @notice Canonical versioned Terms and Preview authority for NexPass Editions.
/// @dev Every material launch change gets a new hash and a fresh Preview window.
///      The Registry never mints and never moves USDG.
contract NexLaunchRegistry is Ownable, Pausable {
    uint96 public constant MAX_ROYALTY_BPS = 500;
    uint64 public constant MIN_PREVIEW_DURATION = 1 days;
    bytes32 public constant TERMS_DOMAIN = keccak256("NEXMARKETS_LAUNCH_TERMS_V1");

    struct Terms {
        uint256 activeSupply;
        uint256 pricePerPass;
        uint64 previewStartsAt;
        uint64 mintStartsAt;
        uint64 mintEndsAt;
        bytes32 allowlistRoot;
        uint64 allowlistEndsAt;
        uint256 allowlistSupply;
        /// @notice Edition-wide Early Access cap per wallet. Zero means the
        ///         per-wallet cap is carried solely by the allowlist leaf.
        uint256 walletAllowance;
        address primaryRecipient;
        address royaltyReceiver;
        uint96 royaltyBps;
        bytes32 advantagesHash;
        bytes32 referralTermsHash;
    }

    struct EditionRecord {
        bytes32 editionId;
        uint32 absoluteSupplyCap;
        address publisher;
        bytes32 activeTermsVersionHash;
        uint64 nextTermsVersion;
        bool registered;
        bool disabled;
    }

    mapping(address => EditionRecord) private _editions;
    mapping(address => mapping(bytes32 => Terms)) private _termsByHash;
    address public factory;
    address public immutable settlementToken;

    error ActiveSupplyBelowMinted();
    error AddressRequired();
    error EditionAlreadyRegistered();
    error EditionDisabled();
    error EditionNotRegistered();
    error FactoryAlreadySet();
    error FactoryRequired();
    error FactoryWiringMismatch();
    error InvalidMintWindow();
    error InvalidAllowlistPhase();
    error InvalidPreviewWindow();
    error InvalidRoyalty();
    error InvalidSupply();
    error InvalidTermsVersion();
    error NotEditionPublisher();
    error NotFactory();
    error PreviewMustRestart();
    error TermsPriceRequired();
    error TermsVersionNotFound();

    event FactorySet(address indexed factory);
    event EditionRegistered(
        address indexed edition, bytes32 indexed editionId, address indexed publisher, uint32 absoluteSupplyCap
    );
    /// @notice Carries the complete immutable Terms snapshot so an indexer can
    ///         reconstruct history from event data alone.
    event TermsPublished(
        address indexed edition,
        bytes32 indexed termsVersionHash,
        uint64 indexed version,
        uint256 activeSupply,
        uint256 pricePerPass,
        uint64 previewStartsAt,
        uint64 mintStartsAt,
        uint64 mintEndsAt,
        address primaryRecipient,
        address royaltyReceiver,
        uint96 royaltyBps,
        bytes32 advantagesHash,
        bytes32 referralTermsHash
    );
    event MintAccessPublished(
        address indexed edition,
        bytes32 indexed termsVersionHash,
        bytes32 allowlistRoot,
        uint64 allowlistEndsAt,
        uint256 allowlistSupply,
        uint256 walletAllowance
    );

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyEditionPublisher(address edition) {
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        if (record.disabled) revert EditionDisabled();
        if (msg.sender != record.publisher) revert NotEditionPublisher();
        _;
    }

    constructor(address initialOwner, address settlementToken_) Ownable(initialOwner) {
        if (settlementToken_ == address(0)) revert AddressRequired();
        if (settlementToken_.code.length == 0) revert AddressRequired();
        settlementToken = settlementToken_;
    }

    /// @notice Bind the one Factory that may register permanent Editions.
    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0) || factory_.code.length == 0) revert FactoryRequired();
        _validateFactoryWiring(factory_);
        factory = factory_;
        emit FactorySet(factory_);
    }

    function registerEdition(address edition, address publisher) external onlyFactory {
        if (edition == address(0) || publisher == address(0)) revert AddressRequired();
        if (edition.code.length == 0) revert AddressRequired();
        EditionRecord storage record = _editions[edition];
        if (record.registered) revert EditionAlreadyRegistered();

        INexPassEditionLaunchView deployedEdition = INexPassEditionLaunchView(edition);
        bytes32 editionId = deployedEdition.editionId();
        uint32 absoluteSupplyCap = deployedEdition.absoluteSupplyCap();
        if (editionId == bytes32(0) || absoluteSupplyCap == 0 || deployedEdition.owner() != publisher) {
            revert InvalidSupply();
        }

        record.editionId = editionId;
        record.absoluteSupplyCap = absoluteSupplyCap;
        record.publisher = publisher;
        record.registered = true;
        emit EditionRegistered(edition, editionId, publisher, absoluteSupplyCap);
    }

    /// @notice Publish a new immutable Terms version and restart Preview.
    function publishTerms(address edition, Terms calldata terms)
        external
        whenNotPaused
        onlyEditionPublisher(edition)
        returns (bytes32 termsVersionHash)
    {
        EditionRecord storage record = _editions[edition];
        _validateTerms(edition, record, terms);

        uint64 version = record.nextTermsVersion + 1;
        if (version == 0) revert InvalidTermsVersion();
        termsVersionHash = hashTerms(edition, record.editionId, version, terms);
        if (_termsByHash[edition][termsVersionHash].activeSupply != 0) revert InvalidTermsVersion();

        _termsByHash[edition][termsVersionHash] = terms;
        record.nextTermsVersion = version;
        record.activeTermsVersionHash = termsVersionHash;

        _emitTermsPublished(edition, termsVersionHash, version, terms);
        emit MintAccessPublished(
            edition,
            termsVersionHash,
            terms.allowlistRoot,
            terms.allowlistEndsAt,
            terms.allowlistSupply,
            terms.walletAllowance
        );
    }

    /// @dev Keep the complete Terms event in a separate frame so the
    ///      non-viaIR production compiler does not run out of stack slots.
    function _emitTermsPublished(address edition, bytes32 termsVersionHash, uint64 version, Terms calldata terms)
        internal
    {
        emit TermsPublished(
            edition,
            termsVersionHash,
            version,
            terms.activeSupply,
            terms.pricePerPass,
            terms.previewStartsAt,
            terms.mintStartsAt,
            terms.mintEndsAt,
            terms.primaryRecipient,
            terms.royaltyReceiver,
            terms.royaltyBps,
            terms.advantagesHash,
            terms.referralTermsHash
        );
    }

    function hashTerms(address edition, bytes32 editionId, uint64 version, Terms calldata terms)
        public
        pure
        returns (bytes32)
    {
        bytes32 encodedTermsHash = keccak256(abi.encode(terms));
        return keccak256(abi.encode(TERMS_DOMAIN, edition, editionId, version, encodedTermsHash));
    }

    function editionInfo(address edition) external view returns (EditionRecord memory) {
        return _editions[edition];
    }

    function isRegisteredEdition(address edition) external view returns (bool) {
        return _editions[edition].registered;
    }

    function activeTerms(address edition) external view returns (bytes32 termsVersionHash, Terms memory terms) {
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        termsVersionHash = record.activeTermsVersionHash;
        if (termsVersionHash == bytes32(0)) return (termsVersionHash, terms);
        terms = _termsByHash[edition][termsVersionHash];
    }

    function termsOf(address edition, bytes32 termsVersionHash) external view returns (Terms memory) {
        if (!_editions[edition].registered) revert EditionNotRegistered();
        Terms memory terms = _termsByHash[edition][termsVersionHash];
        if (terms.activeSupply == 0) revert TermsVersionNotFound();
        return terms;
    }

    function isPreviewOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (paused()) return false;
        EditionRecord storage record = _editions[edition];
        if (!record.registered || record.disabled || record.activeTermsVersionHash != termsVersionHash) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        return
            terms.activeSupply != 0 && block.timestamp >= terms.previewStartsAt && block.timestamp < terms.mintStartsAt;
    }

    function isMintOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (paused()) return false;
        EditionRecord storage record = _editions[edition];
        if (!record.registered || record.disabled || record.activeTermsVersionHash != termsVersionHash) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        if (terms.activeSupply == 0 || block.timestamp < terms.mintStartsAt || block.timestamp >= terms.mintEndsAt) {
            return false;
        }
        return INexPassEditionLaunchView(edition).totalMinted() < terms.activeSupply;
    }

    /// @notice Whether a whitelisted payer may mint during the private phase.
    function isAllowlistMintOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (!_isActiveMintWindow(edition, termsVersionHash)) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        return terms.allowlistRoot != bytes32(0) && block.timestamp < terms.allowlistEndsAt;
    }

    /// @notice Whether anyone may mint. Public mint follows the allowlist phase automatically.
    function isPublicMintOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (!_isActiveMintWindow(edition, termsVersionHash)) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        return terms.allowlistRoot == bytes32(0) || block.timestamp >= terms.allowlistEndsAt;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateTerms(address edition, EditionRecord storage record, Terms calldata terms) internal view {
        if (terms.activeSupply == 0 || terms.activeSupply > record.absoluteSupplyCap) revert InvalidSupply();
        if (terms.pricePerPass == 0) revert TermsPriceRequired();
        if (terms.primaryRecipient == address(0)) revert AddressRequired();
        if (terms.royaltyReceiver == address(0) || terms.royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty();
        if (terms.previewStartsAt < block.timestamp) revert PreviewMustRestart();
        if (
            terms.mintStartsAt < terms.previewStartsAt
                || terms.mintStartsAt - terms.previewStartsAt < MIN_PREVIEW_DURATION
        ) {
            revert InvalidPreviewWindow();
        }
        if (terms.mintEndsAt <= terms.mintStartsAt) revert InvalidMintWindow();
        if (terms.allowlistRoot == bytes32(0)) {
            if (terms.allowlistEndsAt != 0 || terms.allowlistSupply != 0 || terms.walletAllowance != 0) {
                revert InvalidAllowlistPhase();
            }
        } else {
            if (
                terms.allowlistEndsAt <= terms.mintStartsAt || terms.allowlistEndsAt > terms.mintEndsAt
                    || terms.allowlistSupply > terms.activeSupply || terms.walletAllowance > terms.activeSupply
            ) revert InvalidAllowlistPhase();
        }
        if (terms.activeSupply < INexPassEditionLaunchView(edition).totalMinted()) {
            revert ActiveSupplyBelowMinted();
        }
    }

    function _isActiveMintWindow(address edition, bytes32 termsVersionHash) internal view returns (bool) {
        if (paused()) return false;
        EditionRecord storage record = _editions[edition];
        if (!record.registered || record.disabled || record.activeTermsVersionHash != termsVersionHash) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        return terms.activeSupply != 0 && block.timestamp >= terms.mintStartsAt && block.timestamp < terms.mintEndsAt
            && INexPassEditionLaunchView(edition).totalMinted() < terms.activeSupply;
    }

    function _validateFactoryWiring(address factory_) internal view {
        address controller;

        try INexPassFactoryWiring(factory_).launchRegistry() returns (address registry_) {
            if (registry_ != address(this)) revert FactoryWiringMismatch();
        } catch {
            revert FactoryWiringMismatch();
        }

        try INexPassFactoryWiring(factory_).protocolAdmin() returns (address protocolAdmin_) {
            if (protocolAdmin_ != owner()) revert FactoryWiringMismatch();
        } catch {
            revert FactoryWiringMismatch();
        }

        try INexPassFactoryWiring(factory_).mintController() returns (address controller_) {
            controller = controller_;
        } catch {
            revert FactoryWiringMismatch();
        }
        if (controller == address(0) || controller.code.length == 0) revert FactoryWiringMismatch();

        try INexMintControllerWiring(controller).launchRegistry() returns (address registry_) {
            if (registry_ != address(this)) revert FactoryWiringMismatch();
        } catch {
            revert FactoryWiringMismatch();
        }

        try INexMintControllerWiring(controller).owner() returns (address controllerOwner_) {
            if (controllerOwner_ != owner()) revert FactoryWiringMismatch();
        } catch {
            revert FactoryWiringMismatch();
        }
    }
}
