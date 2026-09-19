// SPDX-License-Identifier: MIT
pragma solidity >=0.4.16 >=0.6.2 ^0.8.20 ^0.8.24;

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

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/utils/StorageSlot.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC721/IERC721.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC721/IERC721.sol)

/**
 * @dev Required interface of an ERC-721 compliant contract.
 */
interface IERC721 is IERC165 {
    /**
     * @dev Emitted when `tokenId` token is transferred from `from` to `to`.
     */
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables `approved` to manage the `tokenId` token.
     */
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets.
     */
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /**
     * @dev Returns the number of tokens in ``owner``'s account.
     */
    function balanceOf(address owner) external view returns (uint256 balance);

    /**
     * @dev Returns the owner of the `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function ownerOf(uint256 tokenId) external view returns (address owner);

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon
     *   a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
     * are aware of the ERC-721 protocol to prevent tokens from being forever locked.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must have been allowed to move this token by either {approve} or
     *   {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon
     *   a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Transfers `tokenId` token from `from` to `to`.
     *
     * WARNING: Note that the caller is responsible to confirm that the recipient is capable of receiving ERC-721
     * or else they may be permanently lost. Usage of {safeTransferFrom} prevents loss, though the caller must
     * understand this adds an external call which potentially creates a reentrancy vulnerability.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Gives permission to `to` to transfer `tokenId` token to another account.
     * The approval is cleared when the token is transferred.
     *
     * Only a single account can be approved at a time, so approving the zero address clears previous approvals.
     *
     * Requirements:
     *
     * - The caller must own the token or be an approved operator.
     * - `tokenId` must exist.
     *
     * Emits an {Approval} event.
     */
    function approve(address to, uint256 tokenId) external;

    /**
     * @dev Approve or remove `operator` as an operator for the caller.
     * Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.
     *
     * Requirements:
     *
     * - The `operator` cannot be the address zero.
     *
     * Emits an {ApprovalForAll} event.
     */
    function setApprovalForAll(address operator, bool approved) external;

    /**
     * @dev Returns the account approved for `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function getApproved(uint256 tokenId) external view returns (address operator);

    /**
     * @dev Returns if the `operator` is allowed to manage all of the assets of `owner`.
     *
     * See {setApprovalForAll}
     */
    function isApprovedForAll(address owner, address operator) external view returns (bool);
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

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
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

// src/NexAdvantageRegistry.sol

interface INexPassEditionAdvantageView is IERC721 {
    function termsVersionHashOf(uint256 tokenId) external view returns (bytes32);
}

interface INexAdvantageInitializerWiring {
    function advantageRegistry() external view returns (address);
    function launchRegistry() external view returns (address);
    function owner() external view returns (address);
}

interface INexAdvantageListingWiring {
    function advantageRegistry() external view returns (address);
    function owner() external view returns (address);
}

/// @title NexAdvantageRegistry
/// @notice Canonical remaining utility state for each exact Edition/token ID.
/// @dev Ownership remains authoritative in the Edition ERC-721. This registry
///      stores only the utility attached to that exact serial: transfer never
///      rewrites it, and a listing authority can conservatively lock usage.
contract NexAdvantageRegistry is Ownable, ReentrancyGuard {
    uint8 public constant MAX_ADVANTAGES_PER_PASS = 8;
    bytes32 public constant ADVANTAGES_DOMAIN = keccak256("NEXMARKETS_ADVANTAGES_V1");

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
        uint64 listedAt;
    }

    struct Advantage {
        bytes32 advantageId;
        AdvantageKind kind;
        uint64 startsAt;
        uint64 endsAt;
        uint256 totalUnits;
        uint256 remainingUnits;
        bytes32 definitionHash;
        /// @dev Listing pause accumulated only for this TimeBased Advantage.
        uint64 frozenSeconds;
    }

    NexLaunchRegistry public immutable launchRegistry;
    address public initializer;
    address public listingAuthority;

    mapping(address => mapping(uint256 => PassRecord)) private _passRecords;
    mapping(address => mapping(uint256 => mapping(bytes32 => Advantage))) private _advantages;
    mapping(address => mapping(uint256 => bytes32[])) private _advantageIds;
    mapping(address => mapping(uint256 => mapping(bytes32 => mapping(bytes32 => uint256)))) private _useAmounts;

    error AddressRequired();
    error AdvantagesHashMismatch();
    error AdvantageAlreadyExists();
    error AdvantageNotFound();
    error AdvantageUnavailable();
    error AuthorityAlreadySet();
    error AuthorityMustBeContract();
    error InitializerWiringMismatch();
    error InvalidAdvantageKind();
    error InvalidAdvantageWindow();
    error InvalidAdvantageUnits();
    error InvalidPass();
    error ListingAuthorityWiringMismatch();
    error ListingDurationOverflow();
    error ListedPass();
    error NotInitializer();
    error NotListingAuthority();
    error NotPassOwner();
    error PassAlreadyInitialized();
    error PassNotInitialized();
    error RedemptionOnly();
    error TermsVersionMismatch();
    error TooManyAdvantages();
    error UseIdAmountMismatch();
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

    /// @notice Bind the permanent mint/utility initializer exactly once.
    /// @dev The initializer is expected to be a contract such as the gated
    ///      mint/controller integration, never an EOA.
    function setInitializer(address initializer_) external onlyOwner {
        if (initializer != address(0)) revert AuthorityAlreadySet();
        if (initializer_ == address(0)) revert AddressRequired();
        if (initializer_.code.length == 0) revert AuthorityMustBeContract();
        _validateInitializerWiring(initializer_);
        initializer = initializer_;
        emit AdvantageAuthoritySet(initializer, listingAuthority);
    }

    /// @notice Bind the permanent listing registry exactly once.
    function setListingAuthority(address listingAuthority_) external onlyOwner {
        if (listingAuthority != address(0)) revert AuthorityAlreadySet();
        if (listingAuthority_ == address(0)) revert AddressRequired();
        if (listingAuthority_.code.length == 0) revert AuthorityMustBeContract();
        _validateListingAuthorityWiring(listingAuthority_);
        listingAuthority = listingAuthority_;
        emit AdvantageAuthoritySet(initializer, listingAuthority);
    }

    /// @notice Return the canonical commitment for a complete Advantage definition set.
    /// @dev The published Terms hash commits to every field, including each
    ///      offchain definition hash and the array length/order.
    function hashAdvantages(AdvantageConfig[] calldata configs) public pure returns (bytes32) {
        return keccak256(abi.encode(ADVANTAGES_DOMAIN, configs));
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
        if (terms.advantagesHash != advantagesHash || hashAdvantages(configs) != advantagesHash) {
            revert AdvantagesHashMismatch();
        }

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
                definitionHash: config.definitionHash,
                frozenSeconds: 0
            });
            _advantageIds[edition][tokenId].push(config.advantageId);
        }

        emit PassAdvantagesInitialized(edition, tokenId, termsVersionHash, advantagesHash, configs.length);
    }

    /// @notice Lock or unlock utility use while the exact Pass is listed.
    /// @dev Listing state is independent of ERC-721 ownership and therefore
    ///      survives direct transfers until the listing authority clears it.
    ///      On unlock, each TimeBased Advantage accounts for its own overlap.
    function setListed(address edition, uint256 tokenId, bool listed) external onlyListingAuthority {
        PassRecord storage record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        if (record.listed == listed) return;

        if (listed) {
            if (block.timestamp > type(uint64).max) revert ListingDurationOverflow();
            record.listedAt = uint64(block.timestamp);
        } else {
            bytes32[] storage ids = _advantageIds[edition][tokenId];
            for (uint256 i; i < ids.length; ++i) {
                Advantage storage advantage = _advantages[edition][tokenId][ids[i]];
                if (advantage.kind == AdvantageKind.TimeBased) {
                    _applyListingFreeze(record, advantage);
                }
            }
            record.listedAt = 0;
        }
        record.listed = listed;
        emit PassListingStateSet(edition, tokenId, listed);
    }

    /// @notice Redeem one unit with an idempotent ID scoped to this utility.
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

    /// @notice Redeem an exact number of units, including all remaining units.
    /// @dev The legacy one-unit redeem entrypoint remains available for integrations.
    function redeemAmount(address edition, uint256 tokenId, bytes32 advantageId, uint256 amount, bytes32 redemptionId)
        external
        nonReentrant
        returns (bool applied)
    {
        if (amount == 0 || redemptionId == bytes32(0)) revert UseIdRequired();
        Advantage storage advantage = _getAdvantage(edition, tokenId, advantageId);
        if (advantage.kind != AdvantageKind.Redemption) revert RedemptionOnly();
        return _consume(edition, tokenId, advantage, redemptionId, amount);
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
        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        Advantage memory advantage = _getAdvantageView(edition, tokenId, advantageId);
        if (!_isActive(advantage, _effectiveTimestamp(record, advantage))) return 0;
        if (advantage.kind == AdvantageKind.TimeBased) {
            return advantage.endsAt - _effectiveTimestamp(record, advantage);
        }
        if (advantage.kind == AdvantageKind.Connected) return 1;
        return advantage.remainingUnits;
    }

    function isUsable(address edition, uint256 tokenId, bytes32 advantageId) external view returns (bool) {
        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized || record.listed) return false;
        Advantage memory advantage = _advantages[edition][tokenId][advantageId];
        if (advantage.advantageId == bytes32(0) || !_isActive(advantage, _effectiveTimestamp(record, advantage))) {
            return false;
        }
        if (advantage.kind == AdvantageKind.QuantityBased || advantage.kind == AdvantageKind.Redemption) {
            return advantage.remainingUnits != 0;
        }
        return true;
    }

    /// @notice Return the amount previously applied for this exact utility/use ID.
    /// @dev Zero means that the use ID has not been applied in this context.
    function useAmount(address edition, uint256 tokenId, bytes32 advantageId, bytes32 useId)
        external
        view
        returns (uint256)
    {
        return _useAmounts[edition][tokenId][advantageId][useId];
    }

    function _consume(address edition, uint256 tokenId, Advantage storage advantage, bytes32 useId, uint256 amount)
        internal
        returns (bool applied)
    {
        PassRecord memory record = _passRecords[edition][tokenId];
        if (!record.initialized) revert PassNotInitialized();
        uint256 priorAmount = _useAmounts[edition][tokenId][advantage.advantageId][useId];
        if (priorAmount != 0) {
            if (priorAmount == amount) return false;
            revert UseIdAmountMismatch();
        }
        if (record.listed) revert ListedPass();
        if (!_isActive(advantage, _effectiveTimestamp(record, advantage)) || advantage.remainingUnits < amount) {
            revert AdvantageUnavailable();
        }
        _requirePassOwner(edition, tokenId);

        _useAmounts[edition][tokenId][advantage.advantageId][useId] = amount;
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

    function _effectiveTimestamp(PassRecord memory record, Advantage memory advantage) internal view returns (uint256) {
        uint256 currentTimestamp = block.timestamp - advantage.frozenSeconds;
        if (advantage.kind != AdvantageKind.TimeBased || !record.listed) return currentTimestamp;

        uint256 listedTimestamp = uint256(record.listedAt) - advantage.frozenSeconds;
        if (listedTimestamp >= advantage.endsAt) return currentTimestamp;

        uint256 freezeAt = listedTimestamp < advantage.startsAt ? advantage.startsAt : listedTimestamp;
        return currentTimestamp < freezeAt ? currentTimestamp : freezeAt;
    }

    function _isActive(Advantage memory advantage, uint256 timestamp) internal pure returns (bool) {
        return timestamp >= advantage.startsAt && timestamp < advantage.endsAt;
    }

    function _applyListingFreeze(PassRecord storage record, Advantage storage advantage) internal {
        uint256 listedTimestamp = uint256(record.listedAt) - advantage.frozenSeconds;
        if (listedTimestamp >= advantage.endsAt) return;

        uint256 freezeAt = listedTimestamp < advantage.startsAt ? advantage.startsAt : listedTimestamp;
        uint256 currentTimestamp = block.timestamp - advantage.frozenSeconds;
        if (currentTimestamp <= freezeAt) return;

        uint256 freezeDuration = currentTimestamp - freezeAt;
        if (freezeDuration > type(uint64).max - advantage.frozenSeconds) revert ListingDurationOverflow();
        // forge-lint: disable-next-line(unsafe-typecast)
        advantage.frozenSeconds += uint64(freezeDuration);
    }

    function _validateInitializerWiring(address initializer_) internal view {
        try INexAdvantageInitializerWiring(initializer_).advantageRegistry() returns (address registry_) {
            if (registry_ != address(this)) revert InitializerWiringMismatch();
        } catch {
            revert InitializerWiringMismatch();
        }

        try INexAdvantageInitializerWiring(initializer_).launchRegistry() returns (address registry_) {
            if (registry_ != address(launchRegistry)) revert InitializerWiringMismatch();
        } catch {
            revert InitializerWiringMismatch();
        }

        try INexAdvantageInitializerWiring(initializer_).owner() returns (address initializerOwner) {
            if (initializerOwner != owner()) revert InitializerWiringMismatch();
        } catch {
            revert InitializerWiringMismatch();
        }
    }

    function _validateListingAuthorityWiring(address listingAuthority_) internal view {
        try INexAdvantageListingWiring(listingAuthority_).advantageRegistry() returns (address registry_) {
            if (registry_ != address(this)) revert ListingAuthorityWiringMismatch();
        } catch {
            revert ListingAuthorityWiringMismatch();
        }

        try INexAdvantageListingWiring(listingAuthority_).owner() returns (address authorityOwner) {
            if (authorityOwner != owner()) revert ListingAuthorityWiringMismatch();
        } catch {
            revert ListingAuthorityWiringMismatch();
        }
    }
}
