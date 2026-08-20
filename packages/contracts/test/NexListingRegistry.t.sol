// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {INexAdvantageListingController, NexListingRegistry} from "../src/NexListingRegistry.sol";
import {NexMarketsZone} from "../src/NexMarketsZone.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";
import {
    INexSeaportZone,
    SeaportItemType,
    SeaportReceivedItem,
    SeaportSchema,
    SeaportSpentItem,
    SeaportZoneParameters
} from "../src/SeaportTypes.sol";

contract ListingMockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ListingSeaportMock {}

contract ListingAdvantageInitializerMock {
    NexAdvantageRegistry public immutable advantageRegistry;
    NexLaunchRegistry public immutable launchRegistry;
    address public immutable owner;

    constructor(NexAdvantageRegistry advantageRegistry_, NexLaunchRegistry launchRegistry_, address owner_) {
        advantageRegistry = advantageRegistry_;
        launchRegistry = launchRegistry_;
        owner = owner_;
    }

    function initializePass(
        address edition,
        uint256 tokenId,
        bytes32 termsVersionHash,
        bytes32 advantagesHash,
        NexAdvantageRegistry.AdvantageConfig[] calldata configs
    ) external {
        advantageRegistry.initializePass(edition, tokenId, termsVersionHash, advantagesHash, configs);
    }
}

contract MiswiredListingZone {
    function listingRegistry() external pure returns (address) {
        return address(0x1111);
    }

    function seaport() external pure returns (address) {
        return address(0x2222);
    }

    function owner() external pure returns (address) {
        return address(0x3333);
    }
}

contract NexListingRegistryTest is Test {
    ListingMockUSDG internal usdg;
    ListingSeaportMock internal seaport;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    NexAdvantageRegistry internal advantageRegistry;
    NexListingRegistry internal listingRegistry;
    NexMarketsZone internal zone;
    ListingAdvantageInitializerMock internal initializer;

    address internal constant OWNER = address(0xA11CE);
    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA1);
    address internal constant BOB = address(0xB2);
    bytes32 internal constant EDITION_ID = keccak256("nexlisting:edition");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("nexlisting:artwork");
    bytes32 internal constant SALT = keccak256("nexlisting:salt");
    bytes32 internal constant REFERRALS_HASH = keccak256("nexlisting:referrals:v1");
    bytes32 internal constant ADVANTAGE_ID = keccak256("nexlisting:redemption");
    uint256 internal constant PRICE = 1_000_000;

    bytes32 internal advantagesHash;
    bytes32 internal termsHash;
    uint64 internal advantageStartsAt;
    uint64 internal advantageEndsAt;

    function setUp() public {
        usdg = new ListingMockUSDG();
        seaport = new ListingSeaportMock();
        launchRegistry = new NexLaunchRegistry(OWNER, address(usdg));
        mintController = new NexMintController(OWNER, launchRegistry, usdg, FEE_RECIPIENT);
        factory = new NexPassFactory(OWNER, OWNER, launchRegistry, mintController);

        vm.prank(OWNER);
        launchRegistry.setFactory(address(factory));

        NexPassEdition.EditionConfig memory editionConfig = NexPassEdition.EditionConfig({
            name: "NexListing Pass",
            symbol: "NEXLIST",
            initialOwner: OWNER,
            editionId: EDITION_ID,
            absoluteSupplyCap: 5,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://nexlisting/"
        });
        vm.prank(OWNER);
        edition = NexPassEdition(factory.createEdition(editionConfig, PUBLISHER, SALT));

        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        advantageStartsAt = mintStartsAt;
        advantageEndsAt = mintStartsAt + 30 days;
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _advantageConfigs();
        advantagesHash = keccak256(abi.encode(keccak256("NEXMARKETS_ADVANTAGES_V1"), configs));

        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: 3,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 2 days,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 500,
            advantagesHash: advantagesHash,
            referralTermsHash: REFERRALS_HASH
        });
        vm.prank(PUBLISHER);
        termsHash = launchRegistry.publishTerms(address(edition), terms);

        vm.warp(mintStartsAt);
        usdg.mint(ALICE, 10 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(mintController), type(uint256).max);
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 2,
            intentId: keccak256("nexlisting:mint"),
            referralHint: address(0)
        });
        vm.prank(ALICE);
        mintController.mint(request);

        advantageRegistry = new NexAdvantageRegistry(OWNER, launchRegistry);
        listingRegistry = new NexListingRegistry(
            OWNER, launchRegistry, INexAdvantageListingController(address(advantageRegistry)), address(seaport)
        );
        zone = new NexMarketsZone(OWNER, listingRegistry, address(seaport));
        vm.prank(OWNER);
        listingRegistry.setZone(address(zone));

        initializer = new ListingAdvantageInitializerMock(advantageRegistry, launchRegistry, OWNER);
        vm.prank(OWNER);
        advantageRegistry.setInitializer(address(initializer));
        vm.prank(OWNER);
        advantageRegistry.setListingAuthority(address(listingRegistry));
        initializer.initializePass(address(edition), 1, termsHash, advantagesHash, configs);
    }

    function _advantageConfigs() internal view returns (NexAdvantageRegistry.AdvantageConfig[] memory configs) {
        configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = NexAdvantageRegistry.AdvantageConfig({
            advantageId: ADVANTAGE_ID,
            kind: NexAdvantageRegistry.AdvantageKind.Redemption,
            startsAt: advantageStartsAt,
            endsAt: advantageEndsAt,
            totalUnits: 1,
            definitionHash: keccak256("nexlisting:redemption:definition")
        });
    }

    function _request(bytes32 orderHash) internal view returns (NexListingRegistry.ListingRequest memory request) {
        request = NexListingRegistry.ListingRequest({
            orderHash: orderHash,
            edition: address(edition),
            tokenId: 1,
            termsVersionHash: termsHash,
            usdGPrice: 2 * PRICE,
            startTime: uint64(block.timestamp),
            expiry: uint64(block.timestamp + 7 days)
        });
    }

    function _zoneParameters(bytes32 orderHash) internal view returns (SeaportZoneParameters memory parameters) {
        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        uint256 royaltyAmount = listing.usdGPrice * listing.royaltyBps / 10_000;
        parameters.orderHash = orderHash;
        parameters.fulfiller = BOB;
        parameters.offerer = listing.seller;
        parameters.offer = new SeaportSpentItem[](1);
        parameters.offer[0] = SeaportSpentItem({
            itemType: SeaportItemType.ERC721, token: listing.edition, identifier: listing.tokenId, amount: 1
        });
        parameters.consideration = new SeaportReceivedItem[](2);
        parameters.consideration[0] = SeaportReceivedItem({
            itemType: SeaportItemType.ERC20,
            token: address(usdg),
            identifier: 0,
            amount: listing.usdGPrice - royaltyAmount,
            recipient: payable(listing.seller)
        });
        parameters.consideration[1] = SeaportReceivedItem({
            itemType: SeaportItemType.ERC20,
            token: address(usdg),
            identifier: 0,
            amount: royaltyAmount,
            recipient: payable(listing.royaltyReceiver)
        });
        parameters.orderHashes = new bytes32[](1);
        parameters.orderHashes[0] = orderHash;
        parameters.startTime = listing.startTime;
        parameters.endTime = listing.expiry;
        parameters.zoneHash = listing.zoneHash;
    }

    function _create() internal returns (bytes32 orderHash) {
        orderHash = keccak256(abi.encode("nexlisting:order", block.timestamp, edition.totalMinted()));
        vm.prank(ALICE);
        listingRegistry.createListing(_request(orderHash));
    }

    function testCreateBindsExactPassTermsPriceRoyaltyAndZoneHash() public {
        bytes32 orderHash = _create();
        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);

        assertEq(listing.edition, address(edition));
        assertEq(listing.tokenId, 1);
        assertEq(listing.seller, ALICE);
        assertEq(listing.termsVersionHash, termsHash);
        assertEq(listing.usdGPrice, 2 * PRICE);
        assertEq(listing.royaltyReceiver, BUILDER);
        assertEq(listing.royaltyBps, 500);
        assertEq(
            listing.zoneHash,
            listingRegistry.zoneHashFor(
                address(edition), 1, ALICE, termsHash, 2 * PRICE, BUILDER, 500, listing.startTime, listing.expiry
            )
        );
        assertTrue(listingRegistry.isListingActive(orderHash));
        assertEq(listingRegistry.activeListingFor(address(edition), 1), orderHash);
        assertTrue(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneAuthorizesExactOrderAndMarksFilledAfterOwnershipChanges() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);

        vm.prank(address(seaport));
        assertEq(zone.authorizeOrder(parameters), zone.authorizeOrder.selector);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        vm.prank(address(seaport));
        assertEq(zone.validateOrder(parameters), zone.validateOrder.selector);

        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(NexListingRegistry.ListingStatus.Filled));
        assertEq(listingRegistry.activeListingFor(address(edition), 1), bytes32(0));
        assertFalse(listingRegistry.isListingActive(orderHash));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneRejectsWrongPassPriceAndZoneHash() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);
        parameters.zoneHash = keccak256("wrong-zone-hash");
        vm.prank(address(seaport));
        vm.expectRevert(NexListingRegistry.OfferMismatch.selector);
        zone.authorizeOrder(parameters);

        parameters = _zoneParameters(orderHash);
        parameters.consideration[0].amount += 1;
        vm.prank(address(seaport));
        vm.expectRevert(NexListingRegistry.ConsiderationMismatch.selector);
        zone.authorizeOrder(parameters);
    }

    function testZoneExposesCanonicalSeaportInterface() public view {
        assertTrue(zone.supportsInterface(type(INexSeaportZone).interfaceId));
        assertTrue(zone.supportsInterface(0x01ffc9a7));
        assertFalse(zone.supportsInterface(0xffffffff));
        (string memory name, SeaportSchema[] memory schemas) = zone.getSeaportMetadata();
        assertEq(name, "NexMarketsZone");
        assertEq(schemas.length, 0);
    }

    function testCancellationReleasesAdvantageLock() public {
        bytes32 orderHash = _create();
        vm.prank(ALICE);
        listingRegistry.cancelListing(orderHash);

        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(NexListingRegistry.ListingStatus.Cancelled));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testDirectTransferBecomesStaleAndPermissionlessSyncReleasesLock() public {
        bytes32 orderHash = _create();
        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);

        assertFalse(listingRegistry.isListingActive(orderHash));
        listingRegistry.syncListing(orderHash);
        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(NexListingRegistry.ListingStatus.Stale));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testExpiryBecomesInactiveAndSyncReleasesLock() public {
        bytes32 orderHash = _create();
        NexListingRegistry.Listing memory created = listingRegistry.listingInfo(orderHash);
        vm.warp(created.expiry);
        assertFalse(listingRegistry.isListingActive(orderHash));

        listingRegistry.syncListing(orderHash);
        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(NexListingRegistry.ListingStatus.Expired));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneRejectsExpiredOrTransferredOrderBeforeSync() public {
        bytes32 expiryOrder = _create();
        SeaportZoneParameters memory expiryParameters = _zoneParameters(expiryOrder);
        NexListingRegistry.Listing memory expiryListing = listingRegistry.listingInfo(expiryOrder);
        vm.warp(expiryListing.expiry);

        vm.prank(address(seaport));
        vm.expectRevert(NexListingRegistry.ListingNotActive.selector);
        zone.authorizeOrder(expiryParameters);
        assertEq(
            uint256(listingRegistry.listingInfo(expiryOrder).status), uint256(NexListingRegistry.ListingStatus.Active)
        );
        assertTrue(advantageRegistry.isListed(address(edition), 1));
        listingRegistry.syncListing(expiryOrder);
        assertFalse(advantageRegistry.isListed(address(edition), 1));

        vm.warp(expiryListing.startTime + 1);
        bytes32 transferOrder = _create();
        SeaportZoneParameters memory transferParameters = _zoneParameters(transferOrder);
        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        vm.prank(address(seaport));
        vm.expectRevert(NexListingRegistry.ListingNotActive.selector);
        zone.authorizeOrder(transferParameters);
        assertEq(
            uint256(listingRegistry.listingInfo(transferOrder).status), uint256(NexListingRegistry.ListingStatus.Active)
        );
        listingRegistry.syncListing(transferOrder);
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneCallerAndOneTimeWiringAreFailClosed() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);
        vm.expectRevert(NexMarketsZone.NotSeaport.selector);
        zone.authorizeOrder(parameters);

        NexListingRegistry fresh = new NexListingRegistry(
            OWNER, launchRegistry, INexAdvantageListingController(address(advantageRegistry)), address(seaport)
        );
        MiswiredListingZone wrongZone = new MiswiredListingZone();
        vm.prank(OWNER);
        vm.expectRevert(NexListingRegistry.ZoneWiringMismatch.selector);
        fresh.setZone(address(wrongZone));
        assertEq(fresh.zone(), address(0));
    }
}
