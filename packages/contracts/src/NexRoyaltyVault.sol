// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INexRoyaltyListingWiring {
    function owner() external view returns (address);
    function royaltyVault() external view returns (address);
}

/// @title NexRoyaltyVault
/// @notice Holds each secondary Builder Royalty for exactly 30 days.
/// @dev USDG reaches this vault through Seaport before NexMarketsZone invokes
///      its post-transfer validation. The permanently bound ListingRegistry
///      then records the exact order-backed claim. If recording fails, the
///      containing Seaport fulfillment reverts atomically.
contract NexRoyaltyVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant HOLD_PERIOD = 30 days;

    struct RoyaltyClaim {
        address edition;
        uint256 tokenId;
        address builder;
        uint256 amount;
        uint64 releaseAt;
        bool withdrawn;
    }

    IERC20 public immutable settlementToken;
    address public listingRegistry;
    uint256 public totalOutstanding;

    mapping(bytes32 => RoyaltyClaim) private _claims;

    error AddressRequired();
    error InsufficientBacking();
    error InvalidRoyaltyClaim();
    error ListingRegistryAlreadySet();
    error ListingRegistryWiringMismatch();
    error NotBuilder();
    error NotListingRegistry();
    error RoyaltyAlreadyRecorded();
    error RoyaltyAlreadyWithdrawn();
    error RoyaltyNotFound();
    error RoyaltyStillLocked();
    error TimestampOverflow();

    event ListingRegistrySet(address indexed listingRegistry);
    event RoyaltyRecorded(
        bytes32 indexed orderHash,
        address indexed edition,
        uint256 indexed tokenId,
        address builder,
        uint256 amount,
        uint64 releaseAt
    );
    event RoyaltyWithdrawn(bytes32 indexed orderHash, address indexed builder, uint256 amount);

    modifier onlyListingRegistry() {
        if (msg.sender != listingRegistry) revert NotListingRegistry();
        _;
    }

    constructor(address initialOwner, IERC20 settlementToken_) Ownable(initialOwner) {
        if (initialOwner == address(0) || address(settlementToken_) == address(0)) revert AddressRequired();
        if (address(settlementToken_).code.length == 0) revert AddressRequired();
        settlementToken = settlementToken_;
    }

    /// @notice Permanently bind the canonical ListingRegistry.
    function setListingRegistry(address listingRegistry_) external onlyOwner {
        if (listingRegistry != address(0)) revert ListingRegistryAlreadySet();
        if (listingRegistry_ == address(0) || listingRegistry_.code.length == 0) revert AddressRequired();

        try INexRoyaltyListingWiring(listingRegistry_).owner() returns (address registryOwner) {
            if (registryOwner != owner()) revert ListingRegistryWiringMismatch();
        } catch {
            revert ListingRegistryWiringMismatch();
        }
        try INexRoyaltyListingWiring(listingRegistry_).royaltyVault() returns (address vault_) {
            if (vault_ != address(this)) revert ListingRegistryWiringMismatch();
        } catch {
            revert ListingRegistryWiringMismatch();
        }

        listingRegistry = listingRegistry_;
        emit ListingRegistrySet(listingRegistry_);
    }

    /// @notice Record one royalty that Seaport has already transferred here.
    function recordRoyalty(bytes32 orderHash, address edition, uint256 tokenId, address builder, uint256 amount)
        external
        onlyListingRegistry
        nonReentrant
    {
        if (
            orderHash == bytes32(0) || edition == address(0) || edition.code.length == 0 || tokenId == 0
                || builder == address(0) || amount == 0
        ) revert InvalidRoyaltyClaim();
        if (_claims[orderHash].amount != 0) revert RoyaltyAlreadyRecorded();
        if (block.timestamp > type(uint64).max - HOLD_PERIOD) revert TimestampOverflow();

        uint256 newOutstanding = totalOutstanding + amount;
        if (settlementToken.balanceOf(address(this)) < newOutstanding) revert InsufficientBacking();

        uint64 releaseAt = uint64(block.timestamp) + HOLD_PERIOD;
        _claims[orderHash] = RoyaltyClaim({
            edition: edition, tokenId: tokenId, builder: builder, amount: amount, releaseAt: releaseAt, withdrawn: false
        });
        totalOutstanding = newOutstanding;

        emit RoyaltyRecorded(orderHash, edition, tokenId, builder, amount, releaseAt);
    }

    /// @notice Withdraw one matured claim to its immutable Builder recipient.
    function withdraw(bytes32 orderHash) external nonReentrant {
        RoyaltyClaim storage claim = _claims[orderHash];
        if (claim.amount == 0) revert RoyaltyNotFound();
        if (msg.sender != claim.builder) revert NotBuilder();
        if (claim.withdrawn) revert RoyaltyAlreadyWithdrawn();
        if (block.timestamp < claim.releaseAt) revert RoyaltyStillLocked();

        claim.withdrawn = true;
        totalOutstanding -= claim.amount;
        settlementToken.safeTransfer(claim.builder, claim.amount);

        emit RoyaltyWithdrawn(orderHash, claim.builder, claim.amount);
    }

    function claimInfo(bytes32 orderHash) external view returns (RoyaltyClaim memory) {
        return _claims[orderHash];
    }

    function isWithdrawable(bytes32 orderHash) external view returns (bool) {
        RoyaltyClaim memory claim = _claims[orderHash];
        return claim.amount != 0 && !claim.withdrawn && block.timestamp >= claim.releaseAt;
    }
}
