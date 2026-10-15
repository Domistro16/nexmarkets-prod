// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Test} from "forge-std/Test.sol";

import {OFLDAdvantageRegistry} from "../src/OFLDAdvantageRegistry.sol";
import {OFLDAdvantageInitializer} from "../src/OFLDAdvantageInitializer.sol";
import {OFLDLaunchRegistry} from "../src/OFLDLaunchRegistry.sol";
import {IOFLDAdvantageListingController, OFLDListingRegistry} from "../src/OFLDListingRegistry.sol";
import {OuterfieldZone} from "../src/OuterfieldZone.sol";
import {OFLDMintController} from "../src/OFLDMintController.sol";
import {OFLDPassEdition} from "../src/OFLDPassEdition.sol";
import {OFLDPassFactory} from "../src/OFLDPassFactory.sol";
import {OFLDRoyaltyVault} from "../src/OFLDRoyaltyVault.sol";
import {
    IOuterfieldSeaportZone,
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

contract ListingSeaportMock {
    function fulfill(
        OuterfieldZone zone,
        SeaportZoneParameters calldata parameters,
        address buyer,
        bool omitRoyaltyTransfer
    ) external {
        zone.authorizeOrder(parameters);
        IERC721(parameters.offer[0].token).transferFrom(parameters.offerer, buyer, parameters.offer[0].identifier);

        for (uint256 i; i < parameters.consideration.length; ++i) {
            if (omitRoyaltyTransfer && parameters.consideration.length == 3 && i == 1) continue;
            SeaportReceivedItem calldata item = parameters.consideration[i];
            require(IERC20(item.token).transferFrom(buyer, item.recipient, item.amount), "USDG transfer failed");
        }
        zone.validateOrder(parameters);
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

contract OFLDListingRegistryTest is Test {
    ListingMockUSDG internal usdg;
    ListingSeaportMock internal seaport;
    OFLDLaunchRegistry internal launchRegistry;
    OFLDMintController internal mintController;
    OFLDPassFactory internal factory;
    OFLDPassEdition internal edition;
    OFLDAdvantageRegistry internal advantageRegistry;
    OFLDRoyaltyVault internal royaltyVault;
    OFLDListingRegistry internal listingRegistry;
    OuterfieldZone internal zone;
    OFLDAdvantageInitializer internal initializer;

    address internal constant OWNER = address(0xA11CE);
    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant SECONDARY_FEE_RECIPIENT = address(0x5EC);
    address internal constant ALICE = address(0xA1);
    address internal constant BOB = address(0xB2);
    bytes32 internal constant EDITION_ID = keccak256("ofldlisting:edition");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("ofldlisting:artwork");
    bytes32 internal constant SALT = keccak256("ofldlisting:salt");
    bytes32 internal constant REFERRALS_HASH = keccak256("ofldlisting:referrals:v1");
    bytes32 internal constant ADVANTAGE_ID = keccak256("ofldlisting:redemption");
    uint256 internal constant PRICE = 1_000_000;

    bytes32 internal advantagesHash;
    bytes32 internal termsHash;
    bytes32 internal zeroRoyaltyTermsHash;
    bytes32 internal sellerRoyaltyTermsHash;
    uint64 internal advantageStartsAt;
    uint64 internal advantageEndsAt;
    uint256 internal listingNonce;

    function setUp() public {
        usdg = new ListingMockUSDG();
        seaport = new ListingSeaportMock();
        launchRegistry = new OFLDLaunchRegistry(OWNER, address(usdg));
        mintController = new OFLDMintController(OWNER, launchRegistry, usdg, FEE_RECIPIENT);
        factory = new OFLDPassFactory(OWNER, OWNER, launchRegistry, mintController);

        vm.prank(OWNER);
        launchRegistry.setFactory(address(factory));

        OFLDPassEdition.EditionConfig memory editionConfig = OFLDPassEdition.EditionConfig({
            name: "OFLDListing Pass",
            symbol: "OFLDLIST",
            initialOwner: PUBLISHER,
            editionId: EDITION_ID,
            absoluteSupplyCap: 5,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://ofldlisting/"
        });
        vm.prank(PUBLISHER);
        edition = OFLDPassEdition(factory.createEdition(editionConfig, SALT));

        advantageRegistry = new OFLDAdvantageRegistry(OWNER, launchRegistry);
        initializer = new OFLDAdvantageInitializer(OWNER, launchRegistry, advantageRegistry, address(mintController));
        vm.prank(OWNER);
        advantageRegistry.setInitializer(address(initializer));
        vm.prank(OWNER);
        mintController.setAdvantageInitializer(address(initializer));

        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        advantageStartsAt = mintStartsAt;
        advantageEndsAt = mintStartsAt + 30 days;
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _advantageConfigs();
        advantagesHash = keccak256(abi.encode(keccak256("OUTERFIELD_ADVANTAGES_V1"), configs));

        OFLDLaunchRegistry.Terms memory terms = OFLDLaunchRegistry.Terms({
            activeSupply: 3,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 2 days,
            allowlistRoot: bytes32(0),
            allowlistEndsAt: 0,
            allowlistSupply: 0,
            walletAllowance: 0,
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
        OFLDMintController.MintRequest memory request = OFLDMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 2,
            intentId: keccak256("ofldlisting:mint"),
            referralHint: address(0),
            advantageConfigs: configs
        });
        vm.prank(ALICE);
        mintController.mint(request);

        vm.warp(block.timestamp + 1);
        uint64 zeroRoyaltyPreview = uint64(block.timestamp);
        uint64 zeroRoyaltyMintStart = zeroRoyaltyPreview + 1 days;
        terms.activeSupply = 3;
        terms.previewStartsAt = zeroRoyaltyPreview;
        terms.mintStartsAt = zeroRoyaltyMintStart;
        terms.mintEndsAt = zeroRoyaltyMintStart + 2 days;
        terms.royaltyBps = 0;
        vm.prank(PUBLISHER);
        zeroRoyaltyTermsHash = launchRegistry.publishTerms(address(edition), terms);
        vm.warp(zeroRoyaltyMintStart);
        _mintOne(zeroRoyaltyTermsHash, keccak256("ofldlisting:mint:zero-royalty"));

        vm.warp(block.timestamp + 1);
        uint64 sellerRoyaltyPreview = uint64(block.timestamp);
        uint64 sellerRoyaltyMintStart = sellerRoyaltyPreview + 1 days;
        terms.activeSupply = 4;
        terms.previewStartsAt = sellerRoyaltyPreview;
        terms.mintStartsAt = sellerRoyaltyMintStart;
        terms.mintEndsAt = sellerRoyaltyMintStart + 2 days;
        terms.royaltyReceiver = ALICE;
        terms.royaltyBps = 500;
        vm.prank(PUBLISHER);
        sellerRoyaltyTermsHash = launchRegistry.publishTerms(address(edition), terms);
        vm.warp(sellerRoyaltyMintStart);
        _mintOne(sellerRoyaltyTermsHash, keccak256("ofldlisting:mint:seller-royalty"));

        royaltyVault = new OFLDRoyaltyVault(OWNER, usdg);
        listingRegistry = new OFLDListingRegistry(
            OWNER,
            launchRegistry,
            IOFLDAdvantageListingController(address(advantageRegistry)),
            royaltyVault,
            SECONDARY_FEE_RECIPIENT,
            address(seaport)
        );
        zone = new OuterfieldZone(OWNER, listingRegistry, address(seaport));
        vm.prank(OWNER);
        royaltyVault.setListingRegistry(address(listingRegistry));
        vm.prank(OWNER);
        listingRegistry.setZone(address(zone));

        vm.prank(OWNER);
        advantageRegistry.setListingAuthority(address(listingRegistry));

        usdg.mint(BOB, 20 * PRICE);
        vm.prank(ALICE);
        edition.setApprovalForAll(address(seaport), true);
        vm.prank(BOB);
        usdg.approve(address(seaport), type(uint256).max);
    }

    function _mintOne(bytes32 mintTermsHash, bytes32 intentId) internal {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _advantageConfigs();
        OFLDMintController.MintRequest memory request = OFLDMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: mintTermsHash,
            recipient: ALICE,
            quantity: 1,
            intentId: intentId,
            referralHint: address(0),
            advantageConfigs: configs
        });
        vm.prank(ALICE);
        mintController.mint(request);
    }

    function _advantageConfigs() internal view returns (OFLDAdvantageRegistry.AdvantageConfig[] memory configs) {
        configs = new OFLDAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = OFLDAdvantageRegistry.AdvantageConfig({
            advantageId: ADVANTAGE_ID,
            kind: OFLDAdvantageRegistry.AdvantageKind.Redemption,
            startsAt: advantageStartsAt,
            endsAt: advantageEndsAt,
            totalUnits: 1,
            definitionHash: keccak256("ofldlisting:redemption:definition")
        });
    }

    function _request(bytes32 orderHash) internal view returns (OFLDListingRegistry.ListingRequest memory request) {
        return _requestFor(orderHash, 1, termsHash);
    }

    function _requestFor(bytes32 orderHash, uint256 tokenId, bytes32 tokenTermsHash)
        internal
        view
        returns (OFLDListingRegistry.ListingRequest memory request)
    {
        request = OFLDListingRegistry.ListingRequest({
            orderHash: orderHash,
            edition: address(edition),
            tokenId: tokenId,
            termsVersionHash: tokenTermsHash,
            usdGPrice: 2 * PRICE,
            startTime: uint64(block.timestamp),
            expiry: uint64(block.timestamp + 7 days)
        });
    }

    function _zoneParameters(bytes32 orderHash) internal view returns (SeaportZoneParameters memory parameters) {
        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        uint256 protocolFee = listing.usdGPrice / 100;
        uint256 royaltyAmount = listing.usdGPrice * listing.royaltyBps / 10_000;
        uint256 sellerAmount = listing.usdGPrice - protocolFee - royaltyAmount;
        parameters.orderHash = orderHash;
        parameters.fulfiller = BOB;
        parameters.offerer = listing.seller;
        parameters.offer = new SeaportSpentItem[](1);
        parameters.offer[0] = SeaportSpentItem({
            itemType: SeaportItemType.ERC721, token: listing.edition, identifier: listing.tokenId, amount: 1
        });
        parameters.consideration = new SeaportReceivedItem[](royaltyAmount == 0 ? 2 : 3);
        parameters.consideration[0] = SeaportReceivedItem({
            itemType: SeaportItemType.ERC20,
            token: address(usdg),
            identifier: 0,
            amount: protocolFee,
            recipient: payable(SECONDARY_FEE_RECIPIENT)
        });
        if (royaltyAmount == 0) {
            parameters.consideration[1] = SeaportReceivedItem({
                itemType: SeaportItemType.ERC20,
                token: address(usdg),
                identifier: 0,
                amount: sellerAmount,
                recipient: payable(listing.seller)
            });
        } else {
            parameters.consideration[1] = SeaportReceivedItem({
                itemType: SeaportItemType.ERC20,
                token: address(usdg),
                identifier: 0,
                amount: royaltyAmount,
                recipient: payable(address(royaltyVault))
            });
            parameters.consideration[2] = SeaportReceivedItem({
                itemType: SeaportItemType.ERC20,
                token: address(usdg),
                identifier: 0,
                amount: sellerAmount,
                recipient: payable(listing.seller)
            });
        }
        parameters.orderHashes = new bytes32[](1);
        parameters.orderHashes[0] = orderHash;
        parameters.startTime = listing.startTime;
        parameters.endTime = listing.expiry;
        parameters.zoneHash = listing.zoneHash;
    }

    function _create() internal returns (bytes32 orderHash) {
        return _createFor(1, termsHash);
    }

    function _createFor(uint256 tokenId, bytes32 tokenTermsHash) internal returns (bytes32 orderHash) {
        orderHash = keccak256(abi.encode("ofldlisting:order", tokenId, ++listingNonce));
        vm.prank(ALICE);
        listingRegistry.createListing(_requestFor(orderHash, tokenId, tokenTermsHash));
    }

    function _fulfill(bytes32 orderHash, bool omitRoyaltyTransfer) internal {
        seaport.fulfill(zone, _zoneParameters(orderHash), BOB, omitRoyaltyTransfer);
    }

    function testCreateBindsExactPassTermsPriceRoyaltyAndZoneHash() public {
        bytes32 orderHash = _create();
        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);

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
        assertEq(listingRegistry.SECONDARY_PROTOCOL_FEE_BPS(), 100);
        assertEq(listingRegistry.protocolFeeRecipient(), SECONDARY_FEE_RECIPIENT);
        assertEq(address(listingRegistry.royaltyVault()), address(royaltyVault));
        assertEq(royaltyVault.listingRegistry(), address(listingRegistry));
    }

    function testSecondaryFeeCannotRoundToZero() public {
        bytes32 orderHash = keccak256("ofldlisting:tiny-price");
        OFLDListingRegistry.ListingRequest memory request = _request(orderHash);
        request.usdGPrice = 99;
        vm.prank(ALICE);
        vm.expectRevert(OFLDListingRegistry.InvalidSecondaryFee.selector);
        listingRegistry.createListing(request);
    }

    function testZoneAuthorizesExactOrderAndMarksFilledAfterOwnershipChanges() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);

        vm.prank(address(seaport));
        assertEq(zone.authorizeOrder(parameters), zone.authorizeOrder.selector);

        _fulfill(orderHash, false);

        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(OFLDListingRegistry.ListingStatus.Filled));
        assertEq(listingRegistry.activeListingFor(address(edition), 1), bytes32(0));
        assertFalse(listingRegistry.isListingActive(orderHash));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testSecondarySettlementChargesExactOnePercentAndVaultsFivePercent() public {
        bytes32 orderHash = _create();
        uint256 buyerBefore = usdg.balanceOf(BOB);
        uint256 sellerBefore = usdg.balanceOf(ALICE);
        uint256 protocolBefore = usdg.balanceOf(SECONDARY_FEE_RECIPIENT);
        uint256 vaultBefore = usdg.balanceOf(address(royaltyVault));
        uint256 settledAt = block.timestamp;

        _fulfill(orderHash, false);

        uint256 salePrice = 2 * PRICE;
        uint256 protocolFee = salePrice / 100;
        uint256 royaltyAmount = salePrice * 5 / 100;
        assertEq(buyerBefore - usdg.balanceOf(BOB), salePrice);
        assertEq(usdg.balanceOf(SECONDARY_FEE_RECIPIENT) - protocolBefore, protocolFee);
        assertEq(usdg.balanceOf(address(royaltyVault)) - vaultBefore, royaltyAmount);
        assertEq(usdg.balanceOf(ALICE) - sellerBefore, salePrice - protocolFee - royaltyAmount);
        assertEq(edition.ownerOf(1), BOB);

        OFLDRoyaltyVault.RoyaltyClaim memory claim = royaltyVault.claimInfo(orderHash);
        assertEq(claim.edition, address(edition));
        assertEq(claim.tokenId, 1);
        assertEq(claim.builder, BUILDER);
        assertEq(claim.amount, royaltyAmount);
        assertEq(claim.releaseAt, settledAt + 30 days);
        assertFalse(claim.withdrawn);
    }

    function testZeroRoyaltyStillChargesOnePercentWithoutVaultClaim() public {
        bytes32 orderHash = _createFor(3, zeroRoyaltyTermsHash);
        uint256 buyerBefore = usdg.balanceOf(BOB);
        uint256 sellerBefore = usdg.balanceOf(ALICE);
        uint256 protocolBefore = usdg.balanceOf(SECONDARY_FEE_RECIPIENT);
        uint256 vaultBefore = usdg.balanceOf(address(royaltyVault));

        _fulfill(orderHash, false);

        uint256 salePrice = 2 * PRICE;
        uint256 protocolFee = salePrice / 100;
        assertEq(buyerBefore - usdg.balanceOf(BOB), salePrice);
        assertEq(usdg.balanceOf(SECONDARY_FEE_RECIPIENT) - protocolBefore, protocolFee);
        assertEq(usdg.balanceOf(ALICE) - sellerBefore, salePrice - protocolFee);
        assertEq(usdg.balanceOf(address(royaltyVault)), vaultBefore);
        assertEq(royaltyVault.claimInfo(orderHash).amount, 0);
    }

    function testBuilderEqualSellerStillRoutesRoyaltyThroughVault() public {
        bytes32 orderHash = _createFor(4, sellerRoyaltyTermsHash);
        uint256 sellerBefore = usdg.balanceOf(ALICE);
        uint256 vaultBefore = usdg.balanceOf(address(royaltyVault));

        _fulfill(orderHash, false);

        uint256 salePrice = 2 * PRICE;
        uint256 protocolFee = salePrice / 100;
        uint256 royaltyAmount = salePrice * 5 / 100;
        assertEq(usdg.balanceOf(ALICE) - sellerBefore, salePrice - protocolFee - royaltyAmount);
        assertEq(usdg.balanceOf(address(royaltyVault)) - vaultBefore, royaltyAmount);
        OFLDRoyaltyVault.RoyaltyClaim memory claim = royaltyVault.claimInfo(orderHash);
        assertEq(claim.builder, ALICE);
        assertEq(claim.amount, royaltyAmount);
        assertFalse(claim.withdrawn);
    }

    function testRoyaltyRecordingFailureRollsBackWholeSettlement() public {
        bytes32 orderHash = _create();
        uint256 buyerBefore = usdg.balanceOf(BOB);
        uint256 sellerBefore = usdg.balanceOf(ALICE);
        uint256 protocolBefore = usdg.balanceOf(SECONDARY_FEE_RECIPIENT);
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);

        vm.expectRevert(OFLDRoyaltyVault.InsufficientBacking.selector);
        seaport.fulfill(zone, parameters, BOB, true);

        assertEq(edition.ownerOf(1), ALICE);
        assertEq(usdg.balanceOf(BOB), buyerBefore);
        assertEq(usdg.balanceOf(ALICE), sellerBefore);
        assertEq(usdg.balanceOf(SECONDARY_FEE_RECIPIENT), protocolBefore);
        assertEq(usdg.balanceOf(address(royaltyVault)), 0);
        assertEq(royaltyVault.claimInfo(orderHash).amount, 0);
        assertTrue(listingRegistry.isListingActive(orderHash));
        assertTrue(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneRejectsWrongPassPriceAndZoneHash() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);
        parameters.zoneHash = keccak256("wrong-zone-hash");
        vm.prank(address(seaport));
        vm.expectRevert(OFLDListingRegistry.OfferMismatch.selector);
        zone.authorizeOrder(parameters);

        parameters = _zoneParameters(orderHash);
        parameters.consideration[0].amount += 1;
        vm.prank(address(seaport));
        vm.expectRevert(OFLDListingRegistry.ConsiderationMismatch.selector);
        zone.authorizeOrder(parameters);
    }

    function testZoneExposesCanonicalSeaportInterface() public view {
        assertTrue(zone.supportsInterface(type(IOuterfieldSeaportZone).interfaceId));
        assertTrue(zone.supportsInterface(0x01ffc9a7));
        assertFalse(zone.supportsInterface(0xffffffff));
        (string memory name, SeaportSchema[] memory schemas) = zone.getSeaportMetadata();
        assertEq(name, "OuterfieldZone");
        assertEq(schemas.length, 0);
    }

    function testCancellationReleasesAdvantageLock() public {
        bytes32 orderHash = _create();
        vm.prank(ALICE);
        listingRegistry.cancelListing(orderHash);

        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(OFLDListingRegistry.ListingStatus.Cancelled));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
        assertEq(royaltyVault.claimInfo(orderHash).amount, 0);
    }

    function testDirectTransferBecomesStaleAndPermissionlessSyncReleasesLock() public {
        bytes32 orderHash = _create();
        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);

        assertFalse(listingRegistry.isListingActive(orderHash));
        listingRegistry.syncListing(orderHash);
        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(OFLDListingRegistry.ListingStatus.Stale));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
        assertEq(royaltyVault.claimInfo(orderHash).amount, 0);
    }

    function testExpiryBecomesInactiveAndSyncReleasesLock() public {
        bytes32 orderHash = _create();
        OFLDListingRegistry.Listing memory created = listingRegistry.listingInfo(orderHash);
        vm.warp(created.expiry);
        assertFalse(listingRegistry.isListingActive(orderHash));

        listingRegistry.syncListing(orderHash);
        OFLDListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint256(listing.status), uint256(OFLDListingRegistry.ListingStatus.Expired));
        assertFalse(advantageRegistry.isListed(address(edition), 1));
        assertEq(royaltyVault.claimInfo(orderHash).amount, 0);
    }

    function testZoneRejectsExpiredOrTransferredOrderBeforeSync() public {
        bytes32 expiryOrder = _create();
        SeaportZoneParameters memory expiryParameters = _zoneParameters(expiryOrder);
        OFLDListingRegistry.Listing memory expiryListing = listingRegistry.listingInfo(expiryOrder);
        vm.warp(expiryListing.expiry);

        vm.prank(address(seaport));
        vm.expectRevert(OFLDListingRegistry.ListingNotActive.selector);
        zone.authorizeOrder(expiryParameters);
        assertEq(
            uint256(listingRegistry.listingInfo(expiryOrder).status), uint256(OFLDListingRegistry.ListingStatus.Active)
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
        vm.expectRevert(OFLDListingRegistry.ListingNotActive.selector);
        zone.authorizeOrder(transferParameters);
        assertEq(
            uint256(listingRegistry.listingInfo(transferOrder).status), uint256(OFLDListingRegistry.ListingStatus.Active)
        );
        listingRegistry.syncListing(transferOrder);
        assertFalse(advantageRegistry.isListed(address(edition), 1));
    }

    function testZoneCallerAndOneTimeWiringAreFailClosed() public {
        bytes32 orderHash = _create();
        SeaportZoneParameters memory parameters = _zoneParameters(orderHash);
        vm.expectRevert(OuterfieldZone.NotSeaport.selector);
        zone.authorizeOrder(parameters);

        OFLDRoyaltyVault freshVault = new OFLDRoyaltyVault(OWNER, usdg);
        OFLDListingRegistry fresh = new OFLDListingRegistry(
            OWNER,
            launchRegistry,
            IOFLDAdvantageListingController(address(advantageRegistry)),
            freshVault,
            SECONDARY_FEE_RECIPIENT,
            address(seaport)
        );
        MiswiredListingZone wrongZone = new MiswiredListingZone();
        vm.prank(OWNER);
        vm.expectRevert(OFLDListingRegistry.ZoneWiringMismatch.selector);
        fresh.setZone(address(wrongZone));
        assertEq(fresh.zone(), address(0));
    }
}
