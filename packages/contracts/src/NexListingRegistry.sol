// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";
import {NexRoyaltyVault} from "./NexRoyaltyVault.sol";
import {SeaportItemType, SeaportReceivedItem, SeaportSpentItem, SeaportZoneParameters} from "./SeaportTypes.sol";

interface INexAdvantageListingController {
    function owner() external view returns (address);
    function setListed(address edition, uint256 tokenId, bool listed) external;
}

interface INexPassEditionListingView {
    function ownerOf(uint256 tokenId) external view returns (address);
    function termsVersionHashOf(uint256 tokenId) external view returns (bytes32);
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}

interface INexMarketsZoneWiring {
    function listingRegistry() external view returns (address);
    function seaport() external view returns (address);
    function owner() external view returns (address);
}

/// @title NexListingRegistry
/// @notice Canonical listing state for an exact Edition/token ID.
/// @dev Seaport remains the settlement and ownership-transfer authority. This
///      registry binds the signed order's zoneHash to the Pass, seller, USDG
///      price, historical Terms version, ERC-2981 royalty, and expiry. The
///      registry is also the one-time listing authority of NexAdvantageRegistry.
contract NexListingRegistry is Ownable, ReentrancyGuard {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant SECONDARY_PROTOCOL_FEE_BPS = 100;
    bytes32 public constant LISTING_ZONE_DOMAIN = keccak256("NEXMARKETS_LISTING_ZONE_V1");

    enum ListingStatus {
        None,
        Active,
        Cancelled,
        Filled,
        Expired,
        Stale
    }

    struct ListingRequest {
        bytes32 orderHash;
        address edition;
        uint256 tokenId;
        bytes32 termsVersionHash;
        uint256 usdGPrice;
        uint64 startTime;
        uint64 expiry;
    }

    struct Listing {
        address edition;
        uint256 tokenId;
        address seller;
        bytes32 termsVersionHash;
        uint256 usdGPrice;
        address royaltyReceiver;
        uint96 royaltyBps;
        uint64 startTime;
        uint64 expiry;
        bytes32 zoneHash;
        ListingStatus status;
    }

    NexLaunchRegistry public immutable launchRegistry;
    INexAdvantageListingController public immutable advantageRegistry;
    NexRoyaltyVault public immutable royaltyVault;
    address public immutable protocolFeeRecipient;
    address public immutable seaport;
    address public zone;

    mapping(bytes32 => Listing) private _listings;
    mapping(address => mapping(uint256 => bytes32)) private _activeListing;

    error AddressRequired();
    error AuthorityAlreadySet();
    error CallerNotListingParty();
    error ConsiderationMismatch();
    error EditionTermsMismatch();
    error FillNotSettled();
    error InvalidSecondaryFee();
    error InvalidListingWindow();
    error ListingAlreadyExists();
    error ListingNotActive();
    error ListingNotFound();
    error ListingNotStale();
    error ListingNotStarted();
    error NotZone();
    error OfferMismatch();
    error PassAlreadyListed();
    error PassNotOwned();
    error RoyaltyMismatch();
    error TermsVersionNotFound();
    error VaultWiringMismatch();
    error ZoneRequired();
    error ZoneWiringMismatch();

    event ZoneSet(address indexed zone);
    event ListingCreated(
        bytes32 indexed orderHash,
        address indexed edition,
        uint256 indexed tokenId,
        address seller,
        bytes32 termsVersionHash,
        uint256 usdGPrice,
        address royaltyReceiver,
        uint96 royaltyBps,
        uint64 startTime,
        uint64 expiry,
        bytes32 zoneHash
    );
    event ListingCancelled(bytes32 indexed orderHash, address indexed caller);
    event ListingFilled(bytes32 indexed orderHash, address indexed buyer);
    event SecondarySaleSettled(
        bytes32 indexed orderHash,
        address indexed buyer,
        uint256 salePrice,
        uint256 protocolFee,
        uint256 builderRoyalty,
        uint256 sellerProceeds
    );
    event ListingExpired(bytes32 indexed orderHash);
    event ListingStale(bytes32 indexed orderHash, address indexed currentOwner);

    modifier onlyZone() {
        if (msg.sender != zone) revert NotZone();
        _;
    }

    constructor(
        address initialOwner,
        NexLaunchRegistry launchRegistry_,
        INexAdvantageListingController advantageRegistry_,
        NexRoyaltyVault royaltyVault_,
        address protocolFeeRecipient_,
        address seaport_
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) || address(launchRegistry_) == address(0)
                || address(advantageRegistry_) == address(0) || address(royaltyVault_) == address(0)
                || protocolFeeRecipient_ == address(0) || seaport_ == address(0)
        ) revert AddressRequired();
        if (
            address(launchRegistry_).code.length == 0 || address(advantageRegistry_).code.length == 0
                || address(royaltyVault_).code.length == 0 || seaport_.code.length == 0
        ) revert AddressRequired();
        if (launchRegistry_.owner() != initialOwner || advantageRegistry_.owner() != initialOwner) {
            revert AddressRequired();
        }
        if (
            royaltyVault_.owner() != initialOwner
                || address(royaltyVault_.settlementToken()) != launchRegistry_.settlementToken()
                || royaltyVault_.listingRegistry() != address(0)
        ) revert VaultWiringMismatch();
        if (protocolFeeRecipient_ == address(royaltyVault_)) revert VaultWiringMismatch();
        launchRegistry = launchRegistry_;
        advantageRegistry = advantageRegistry_;
        royaltyVault = royaltyVault_;
        protocolFeeRecipient = protocolFeeRecipient_;
        seaport = seaport_;
    }

    /// @notice Bind the thin zone exactly once after both contracts exist.
    function setZone(address zone_) external onlyOwner {
        if (zone != address(0)) revert AuthorityAlreadySet();
        if (zone_ == address(0)) revert ZoneRequired();
        if (zone_.code.length == 0) revert ZoneRequired();

        try INexMarketsZoneWiring(zone_).listingRegistry() returns (address registry_) {
            if (registry_ != address(this)) revert ZoneWiringMismatch();
        } catch {
            revert ZoneWiringMismatch();
        }
        try INexMarketsZoneWiring(zone_).seaport() returns (address seaport_) {
            if (seaport_ != seaport) revert ZoneWiringMismatch();
        } catch {
            revert ZoneWiringMismatch();
        }
        try INexMarketsZoneWiring(zone_).owner() returns (address zoneOwner) {
            if (zoneOwner != owner()) revert ZoneWiringMismatch();
        } catch {
            revert ZoneWiringMismatch();
        }

        zone = zone_;
        emit ZoneSet(zone_);
    }

    /// @notice Compute the zoneHash that must be embedded in the Seaport order.
    function zoneHashFor(
        address edition,
        uint256 tokenId,
        address seller,
        bytes32 termsVersionHash,
        uint256 usdGPrice,
        address royaltyReceiver,
        uint96 royaltyBps,
        uint64 startTime,
        uint64 expiry
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LISTING_ZONE_DOMAIN,
                edition,
                tokenId,
                seller,
                termsVersionHash,
                usdGPrice,
                royaltyReceiver,
                royaltyBps,
                startTime,
                expiry
            )
        );
    }

    /// @notice Register and lock one exact Pass for one signed Seaport order.
    function createListing(ListingRequest calldata request) external nonReentrant returns (bytes32 zoneHash) {
        if (
            request.orderHash == bytes32(0) || request.edition == address(0) || request.edition.code.length == 0
                || request.tokenId == 0 || request.termsVersionHash == bytes32(0) || request.usdGPrice == 0
        ) revert ListingNotFound();
        if (request.startTime > request.expiry || request.expiry <= block.timestamp) revert InvalidListingWindow();
        if (_listings[request.orderHash].status != ListingStatus.None) revert ListingAlreadyExists();
        if (Math.mulDiv(request.usdGPrice, SECONDARY_PROTOCOL_FEE_BPS, BPS_DENOMINATOR) == 0) {
            revert InvalidSecondaryFee();
        }

        address currentOwner = _ownerOfOrZero(request.edition, request.tokenId);
        if (currentOwner != msg.sender) revert PassNotOwned();

        bytes32 previousOrderHash = _activeListing[request.edition][request.tokenId];
        if (previousOrderHash != bytes32(0)) {
            Listing storage previous = _listings[previousOrderHash];
            if (previous.status == ListingStatus.Active) {
                if (_isExpired(previous)) {
                    _deactivate(previousOrderHash, ListingStatus.Expired);
                } else if (_ownerOfOrZero(previous.edition, previous.tokenId) != previous.seller) {
                    _deactivate(previousOrderHash, ListingStatus.Stale);
                } else {
                    revert PassAlreadyListed();
                }
            }
        }

        (address royaltyReceiver, uint96 royaltyBps) = _validatedRoyalty(request);

        zoneHash = _zoneHashForRequest(request, royaltyReceiver, royaltyBps);

        Listing storage listing = _listings[request.orderHash];
        listing.edition = request.edition;
        listing.tokenId = request.tokenId;
        listing.seller = msg.sender;
        listing.termsVersionHash = request.termsVersionHash;
        listing.usdGPrice = request.usdGPrice;
        listing.royaltyReceiver = royaltyReceiver;
        listing.royaltyBps = royaltyBps;
        listing.startTime = request.startTime;
        listing.expiry = request.expiry;
        listing.zoneHash = zoneHash;
        listing.status = ListingStatus.Active;
        _activeListing[request.edition][request.tokenId] = request.orderHash;

        // NexAdvantageRegistry has already fail-closed this registry as its
        // one-time listing authority; this call locks utility before signing.
        advantageRegistry.setListed(request.edition, request.tokenId, true);

        _emitListingCreated(request.orderHash);
    }

    function _validatedRoyalty(ListingRequest calldata request)
        internal
        view
        returns (address royaltyReceiver, uint96 royaltyBps)
    {
        NexLaunchRegistry.Terms memory terms;
        try launchRegistry.termsOf(request.edition, request.termsVersionHash) returns (
            NexLaunchRegistry.Terms memory terms_
        ) {
            terms = terms_;
        } catch {
            revert TermsVersionNotFound();
        }

        try INexPassEditionListingView(request.edition).termsVersionHashOf(request.tokenId) returns (
            bytes32 termsHash_
        ) {
            if (termsHash_ != request.termsVersionHash) revert EditionTermsMismatch();
        } catch {
            revert EditionTermsMismatch();
        }

        (address editionRoyaltyReceiver, uint256 editionRoyaltyAmount) =
            INexPassEditionListingView(request.edition).royaltyInfo(request.tokenId, BPS_DENOMINATOR);
        if (editionRoyaltyReceiver != terms.royaltyReceiver || editionRoyaltyAmount != terms.royaltyBps) {
            revert RoyaltyMismatch();
        }
        return (terms.royaltyReceiver, terms.royaltyBps);
    }

    function _zoneHashForRequest(ListingRequest calldata request, address royaltyReceiver, uint96 royaltyBps)
        internal
        view
        returns (bytes32)
    {
        return zoneHashFor(
            request.edition,
            request.tokenId,
            msg.sender,
            request.termsVersionHash,
            request.usdGPrice,
            royaltyReceiver,
            royaltyBps,
            request.startTime,
            request.expiry
        );
    }

    /// @notice Cancel an active order and release its Advantage lock.
    function cancelListing(bytes32 orderHash) external nonReentrant {
        Listing storage listing = _active(orderHash);
        address currentOwner = _ownerOfOrZero(listing.edition, listing.tokenId);
        if (msg.sender != owner() && msg.sender != listing.seller && msg.sender != currentOwner) {
            revert CallerNotListingParty();
        }
        if (_isExpired(listing)) {
            _deactivate(orderHash, ListingStatus.Expired);
            emit ListingExpired(orderHash);
            return;
        }
        _deactivate(orderHash, ListingStatus.Cancelled);
        emit ListingCancelled(orderHash, msg.sender);
    }

    /// @notice Permissionlessly clear a listing made stale by expiry or transfer.
    function syncListing(bytes32 orderHash) external nonReentrant {
        Listing storage listing = _active(orderHash);
        address currentOwner = _ownerOfOrZero(listing.edition, listing.tokenId);
        if (_isExpired(listing)) {
            _deactivate(orderHash, ListingStatus.Expired);
            emit ListingExpired(orderHash);
            return;
        }
        if (currentOwner != listing.seller) {
            _deactivate(orderHash, ListingStatus.Stale);
            emit ListingStale(orderHash, currentOwner);
            return;
        }
        revert ListingNotStale();
    }

    /// @dev Called by NexMarketsZone before Seaport transfers the Pass.
    function authorizeOrder(SeaportZoneParameters calldata zoneParameters) external view onlyZone {
        Listing storage listing = _active(zoneParameters.orderHash);
        _requireWindowOpen(listing);
        if (_ownerOfOrZero(listing.edition, listing.tokenId) != listing.seller) {
            // A failed Seaport callback reverts all state changes. The
            // permissionless syncListing path records Stale and releases the
            // Advantage lock in a separate transaction.
            revert ListingNotActive();
        }
        _validateOrderShape(listing, zoneParameters);
    }

    /// @dev Called by NexMarketsZone after Seaport transfers the Pass.
    function validateOrder(SeaportZoneParameters calldata zoneParameters) external onlyZone {
        Listing storage listing = _active(zoneParameters.orderHash);
        _requireWindowOpen(listing);
        _validateOrderShape(listing, zoneParameters);
        address currentOwner = _ownerOfOrZero(listing.edition, listing.tokenId);
        if (currentOwner == address(0) || currentOwner == listing.seller) revert FillNotSettled();

        (uint256 protocolFee, uint256 royaltyAmount, uint256 sellerAmount) = _settlementAmounts(listing);
        if (royaltyAmount != 0) {
            royaltyVault.recordRoyalty(
                zoneParameters.orderHash, listing.edition, listing.tokenId, listing.royaltyReceiver, royaltyAmount
            );
        }
        _deactivate(zoneParameters.orderHash, ListingStatus.Filled);
        emit ListingFilled(zoneParameters.orderHash, currentOwner);
        emit SecondarySaleSettled(
            zoneParameters.orderHash, currentOwner, listing.usdGPrice, protocolFee, royaltyAmount, sellerAmount
        );
    }

    function listingInfo(bytes32 orderHash) external view returns (Listing memory) {
        Listing memory listing = _listings[orderHash];
        if (listing.status == ListingStatus.None) revert ListingNotFound();
        return listing;
    }

    function activeListingFor(address edition, uint256 tokenId) external view returns (bytes32) {
        return _activeListing[edition][tokenId];
    }

    function isListingActive(bytes32 orderHash) external view returns (bool) {
        Listing memory listing = _listings[orderHash];
        if (listing.status != ListingStatus.Active || block.timestamp < listing.startTime || _isExpiredMemory(listing))
        {
            return false;
        }
        return _ownerOfOrZero(listing.edition, listing.tokenId) == listing.seller;
    }

    function _active(bytes32 orderHash) internal view returns (Listing storage listing) {
        listing = _listings[orderHash];
        if (listing.status != ListingStatus.Active) revert ListingNotActive();
    }

    function _requireWindowOpen(Listing storage listing) internal view {
        if (block.timestamp < listing.startTime) revert ListingNotStarted();
        if (_isExpired(listing)) revert ListingNotActive();
    }

    function _isExpired(Listing storage listing) internal view returns (bool) {
        return block.timestamp >= listing.expiry;
    }

    function _isExpiredMemory(Listing memory listing) internal view returns (bool) {
        return block.timestamp >= listing.expiry;
    }

    function _deactivate(bytes32 orderHash, ListingStatus status) internal {
        Listing storage listing = _listings[orderHash];
        listing.status = status;
        if (_activeListing[listing.edition][listing.tokenId] == orderHash) {
            delete _activeListing[listing.edition][listing.tokenId];
        }
        advantageRegistry.setListed(listing.edition, listing.tokenId, false);
    }

    function _emitListingCreated(bytes32 orderHash) internal {
        Listing storage listing = _listings[orderHash];
        emit ListingCreated(
            orderHash,
            listing.edition,
            listing.tokenId,
            listing.seller,
            listing.termsVersionHash,
            listing.usdGPrice,
            listing.royaltyReceiver,
            listing.royaltyBps,
            listing.startTime,
            listing.expiry,
            listing.zoneHash
        );
    }

    function _validateOrderShape(Listing storage listing, SeaportZoneParameters calldata zoneParameters) internal view {
        if (
            zoneParameters.offerer != listing.seller || zoneParameters.startTime != listing.startTime
                || zoneParameters.endTime != listing.expiry || zoneParameters.zoneHash != listing.zoneHash
        ) revert OfferMismatch();
        if (zoneParameters.offer.length != 1) revert OfferMismatch();

        SeaportSpentItem calldata offer = zoneParameters.offer[0];
        if (
            offer.itemType != SeaportItemType.ERC721 || offer.token != listing.edition
                || offer.identifier != listing.tokenId || offer.amount != 1
        ) revert OfferMismatch();

        (uint256 protocolFee, uint256 royaltyAmount, uint256 sellerAmount) = _settlementAmounts(listing);
        uint256 expectedLength = royaltyAmount == 0 ? 2 : 3;
        if (zoneParameters.consideration.length != expectedLength) revert ConsiderationMismatch();

        // Canonical consideration order makes equal dynamic recipients
        // unambiguous while still keeping every economic component separate.
        _requireReceived(zoneParameters.consideration[0], protocolFeeRecipient, protocolFee);
        if (royaltyAmount == 0) {
            _requireReceived(zoneParameters.consideration[1], listing.seller, sellerAmount);
            return;
        }
        _requireReceived(zoneParameters.consideration[1], address(royaltyVault), royaltyAmount);
        _requireReceived(zoneParameters.consideration[2], listing.seller, sellerAmount);
    }

    function _settlementAmounts(Listing storage listing)
        internal
        view
        returns (uint256 protocolFee, uint256 royaltyAmount, uint256 sellerAmount)
    {
        protocolFee = Math.mulDiv(listing.usdGPrice, SECONDARY_PROTOCOL_FEE_BPS, BPS_DENOMINATOR);
        royaltyAmount = Math.mulDiv(listing.usdGPrice, listing.royaltyBps, BPS_DENOMINATOR);
        sellerAmount = listing.usdGPrice - protocolFee - royaltyAmount;
    }

    function _requireReceived(SeaportReceivedItem calldata item, address expectedRecipient, uint256 expectedAmount)
        internal
        view
    {
        if (
            item.itemType != SeaportItemType.ERC20 || item.token != launchRegistry.settlementToken()
                || item.identifier != 0 || item.amount != expectedAmount || item.recipient != expectedRecipient
        ) revert ConsiderationMismatch();
    }

    function _ownerOfOrZero(address edition, uint256 tokenId) internal view returns (address currentOwner) {
        try INexPassEditionListingView(edition).ownerOf(tokenId) returns (address owner_) {
            currentOwner = owner_;
        } catch {
            currentOwner = address(0);
        }
    }
}
