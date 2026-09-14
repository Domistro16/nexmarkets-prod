// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {NexAdvantageInitializer} from "../src/NexAdvantageInitializer.sol";
import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {INexAdvantageListingController, NexListingRegistry} from "../src/NexListingRegistry.sol";
import {NexMarketsZone} from "../src/NexMarketsZone.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";
import {NexRoyaltyVault} from "../src/NexRoyaltyVault.sol";
import {NexTBAResolver} from "../src/NexTBAResolver.sol";
import {IERC6551Registry} from "../src/erc6551/IERC6551.sol";
import {NexPassAccount} from "../src/erc6551/NexPassAccount.sol";
import {SeaportItemType} from "../src/SeaportTypes.sol";

/// @dev Exact Seaport 1.6 order ABI. Declared locally so NexMarkets neither
///      forks nor deploys Seaport source, matching SeaportTypes.sol.
enum SeaportOrderType {
    FULL_OPEN,
    PARTIAL_OPEN,
    FULL_RESTRICTED,
    PARTIAL_RESTRICTED,
    CONTRACT
}

struct OfferItem {
    SeaportItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
}

struct ConsiderationItem {
    SeaportItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
    address payable recipient;
}

struct OrderParameters {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    SeaportOrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 totalOriginalConsiderationItems;
}

struct OrderComponents {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    SeaportOrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 counter;
}

struct Order {
    OrderParameters parameters;
    bytes signature;
}

interface ISeaport {
    function getOrderHash(OrderComponents calldata order) external view returns (bytes32);
    function getCounter(address offerer) external view returns (uint256);
    function information()
        external
        view
        returns (string memory version, bytes32 domainSeparator, address conduitController);
    function fulfillOrder(Order calldata order, bytes32 fulfillerConduitKey) external payable returns (bool);
}

/// @title Seaport 1.6 fulfilment against forked Base Sepolia
/// @notice The certification journey moved ownership with cancelListing plus
///         transferFrom, so no Seaport order was ever signed or fulfilled and
///         the entire secondary money path stayed unproven. This exercises it
///         for real: a signed restricted order, fulfilled by canonical Seaport
///         1.6, paying canonical Base Sepolia USDC, driving NexMarketsZone's
///         authorizeOrder and validateOrder callbacks and NexRoyaltyVault
///         accrual as a single atomic settlement.
contract SeaportFulfillmentForkTest is Test {
    address internal constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant ERC6551_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address internal constant SEAPORT_16 = 0x0000000000000068F116a894984e2DB1123eB395;

    uint256 internal constant USDC_ONE = 1e6;
    uint32 internal constant SUPPLY = 2000;
    uint256 internal constant PRICE = 5 * USDC_ONE;
    uint256 internal constant SALE_PRICE = 250 * USDC_ONE;
    uint96 internal constant ROYALTY_BPS = 500;

    // NexListingRegistry.SECONDARY_PROTOCOL_FEE_BPS is 100 (1%).
    uint256 internal constant EXPECTED_PROTOCOL_FEE = (SALE_PRICE * 100) / 10_000;
    uint256 internal constant EXPECTED_ROYALTY = (SALE_PRICE * ROYALTY_BPS) / 10_000;
    uint256 internal constant EXPECTED_SELLER = SALE_PRICE - EXPECTED_PROTOCOL_FEE - EXPECTED_ROYALTY;

    address internal alice; // Builder and royalty receiver
    address internal bob; // seller
    uint256 internal bobKey;
    address internal charlie; // buyer
    address internal protocolAdmin;
    address internal feeRecipient;

    IERC20 internal usdc;
    ISeaport internal seaport;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal passFactory;
    NexAdvantageRegistry internal advantageRegistry;
    NexAdvantageInitializer internal advantageInitializer;
    NexRoyaltyVault internal royaltyVault;
    NexListingRegistry internal listingRegistry;
    NexMarketsZone internal zone;
    NexPassAccount internal passAccountImpl;
    NexTBAResolver internal tbaResolver;
    NexPassEdition internal baldies;

    bytes32 internal termsHash;
    // Fixed once so the Advantage commitment hash is stable across warps.
    uint64 internal advStartsAt;
    uint64 internal advEndsAt;
    uint64 internal mintStartsAt;
    uint64 internal allowlistEndsAt;
    uint64 internal saleStart;
    uint64 internal saleEnd;
    bytes32 internal zoneHash;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        assertEq(block.chainid, 84532, "must fork Base Sepolia");
        assertGt(SEAPORT_16.code.length, 0, "canonical Seaport 1.6 must exist");

        alice = makeAddr("alice-builder");
        (bob, bobKey) = makeAddrAndKey("bob-seller");
        charlie = makeAddr("charlie-buyer");
        protocolAdmin = makeAddr("protocol-admin");
        feeRecipient = makeAddr("protocol-fee-recipient");
        usdc = IERC20(USDC);
        seaport = ISeaport(SEAPORT_16);

        _deployStack();
        _mintPassToBob();
    }

    modifier onFork() {
        if (address(launchRegistry) == address(0)) return;
        _;
    }

    function _deployStack() internal {
        vm.startPrank(protocolAdmin);
        launchRegistry = new NexLaunchRegistry(protocolAdmin, USDC);
        mintController = new NexMintController(protocolAdmin, launchRegistry, IERC20(USDC), feeRecipient);
        passFactory = new NexPassFactory(protocolAdmin, protocolAdmin, launchRegistry, mintController);
        advantageRegistry = new NexAdvantageRegistry(protocolAdmin, launchRegistry);
        advantageInitializer =
            new NexAdvantageInitializer(protocolAdmin, launchRegistry, advantageRegistry, address(mintController));
        royaltyVault = new NexRoyaltyVault(protocolAdmin, IERC20(USDC));
        listingRegistry = new NexListingRegistry(
            protocolAdmin,
            launchRegistry,
            INexAdvantageListingController(address(advantageRegistry)),
            royaltyVault,
            feeRecipient,
            SEAPORT_16
        );
        zone = new NexMarketsZone(protocolAdmin, listingRegistry, SEAPORT_16);
        passAccountImpl = new NexPassAccount(address(listingRegistry));
        tbaResolver = new NexTBAResolver(
            passFactory,
            IERC6551Registry(ERC6551_REGISTRY),
            address(passAccountImpl),
            ERC6551_REGISTRY.codehash,
            address(passAccountImpl).codehash
        );

        launchRegistry.setFactory(address(passFactory));
        advantageRegistry.setInitializer(address(advantageInitializer));
        mintController.setAdvantageInitializer(address(advantageInitializer));
        royaltyVault.setListingRegistry(address(listingRegistry));
        listingRegistry.setZone(address(zone));
        advantageRegistry.setListingAuthority(address(listingRegistry));
        vm.stopPrank();
    }

    function _mintPassToBob() internal {
        advStartsAt = uint64(block.timestamp);
        advEndsAt = uint64(block.timestamp + 365 days);
        vm.prank(alice);
        baldies = NexPassEdition(
            passFactory.createEdition(
                NexPassEdition.EditionConfig({
                    name: "Baldies",
                    symbol: "BALDIES",
                    initialOwner: alice,
                    editionId: keccak256("baldies:seaport:edition"),
                    absoluteSupplyCap: SUPPLY,
                    artworkCommitment: keccak256("baldies:artwork"),
                    baseTokenURI: "ipfs://baldies/"
                }),
                keccak256("baldies:seaport:salt")
            )
        );

        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        allowlistEndsAt = mintStartsAt + 1 days;
        bytes32 advantagesHash = advantageRegistry.hashAdvantages(_advantageConfigs());

        vm.prank(alice);
        termsHash = launchRegistry.publishTerms(
            address(baldies),
            NexLaunchRegistry.Terms({
                activeSupply: SUPPLY,
                pricePerPass: PRICE,
                previewStartsAt: previewStartsAt,
                mintStartsAt: mintStartsAt,
                mintEndsAt: mintStartsAt + 60 days,
                allowlistRoot: keccak256("baldies:root"),
                allowlistEndsAt: allowlistEndsAt,
                allowlistSupply: 500,
                walletAllowance: 2,
                primaryRecipient: alice,
                royaltyReceiver: alice,
                royaltyBps: ROYALTY_BPS,
                advantagesHash: advantagesHash,
                referralTermsHash: bytes32(0)
            })
        );

        deal(USDC, bob, 100_000 * USDC_ONE, true);
        deal(USDC, charlie, 100_000 * USDC_ONE, true);
        vm.prank(bob);
        usdc.approve(address(mintController), type(uint256).max);

        // Public phase opens with no Builder transaction once Early Access ends.
        vm.warp(allowlistEndsAt);
        vm.prank(bob);
        uint256 serial = mintController.mint(
            NexMintController.MintRequest({
                edition: address(baldies),
                termsVersionHash: termsHash,
                recipient: bob,
                quantity: 1,
                intentId: "bob:public",
                referralHint: address(0),
                advantageConfigs: _advantageConfigs()
            })
        );
        assertEq(serial, 1, "Bob holds serial 1");
        assertEq(baldies.ownerOf(1), bob);
    }

    function _advantageConfigs() internal view returns (NexAdvantageRegistry.AdvantageConfig[] memory configs) {
        configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = NexAdvantageRegistry.AdvantageConfig({
            advantageId: keccak256("baldies:credits"),
            kind: NexAdvantageRegistry.AdvantageKind.QuantityBased,
            startsAt: advStartsAt,
            endsAt: advEndsAt,
            totalUnits: 10,
            definitionHash: keccak256("baldies:10-credits")
        });
    }

    // ====================================================================
    // order construction
    // ====================================================================

    function _offer() internal view returns (OfferItem[] memory offer) {
        offer = new OfferItem[](1);
        offer[0] = OfferItem({
            itemType: SeaportItemType.ERC721,
            token: address(baldies),
            identifierOrCriteria: 1,
            startAmount: 1,
            endAmount: 1
        });
    }

    function _consideration(uint256 protocolFee, uint256 royalty, uint256 sellerProceeds)
        internal
        view
        returns (ConsiderationItem[] memory consideration)
    {
        // Canonical order required by NexListingRegistry._validateOrderShape:
        // protocol fee, then royalty vault, then seller.
        consideration = new ConsiderationItem[](3);
        consideration[0] = _usdcTo(feeRecipient, protocolFee);
        consideration[1] = _usdcTo(address(royaltyVault), royalty);
        consideration[2] = _usdcTo(bob, sellerProceeds);
    }

    function _usdcTo(address recipient, uint256 amount) internal pure returns (ConsiderationItem memory) {
        return ConsiderationItem({
            itemType: SeaportItemType.ERC20,
            token: USDC,
            identifierOrCriteria: 0,
            startAmount: amount,
            endAmount: amount,
            recipient: payable(recipient)
        });
    }

    function _components(ConsiderationItem[] memory consideration, uint256 counter)
        internal
        view
        returns (OrderComponents memory)
    {
        return OrderComponents({
            offerer: bob,
            zone: address(zone),
            offer: _offer(),
            consideration: consideration,
            orderType: SeaportOrderType.FULL_RESTRICTED,
            startTime: saleStart,
            endTime: saleEnd,
            zoneHash: zoneHash,
            salt: uint256(keccak256("baldies:seaport:salt:order")),
            conduitKey: bytes32(0),
            counter: counter
        });
    }

    function _parameters(ConsiderationItem[] memory consideration) internal view returns (OrderParameters memory) {
        return OrderParameters({
            offerer: bob,
            zone: address(zone),
            offer: _offer(),
            consideration: consideration,
            orderType: SeaportOrderType.FULL_RESTRICTED,
            startTime: saleStart,
            endTime: saleEnd,
            zoneHash: zoneHash,
            salt: uint256(keccak256("baldies:seaport:salt:order")),
            conduitKey: bytes32(0),
            totalOriginalConsiderationItems: consideration.length
        });
    }

    function _sign(bytes32 orderHash) internal view returns (bytes memory) {
        (, bytes32 domainSeparator,) = seaport.information();
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", domainSeparator, orderHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Builds the signed order and registers the matching NexMarkets listing.
    function _listAndSign(uint256 protocolFee, uint256 royalty, uint256 sellerProceeds)
        internal
        returns (Order memory order, bytes32 orderHash)
    {
        saleStart = uint64(block.timestamp);
        saleEnd = uint64(block.timestamp + 7 days);

        // The zoneHash binds the economics before the order is signed.
        zoneHash = listingRegistry.zoneHashFor(
            address(baldies), 1, bob, termsHash, SALE_PRICE, alice, ROYALTY_BPS, saleStart, saleEnd
        );

        ConsiderationItem[] memory consideration = _consideration(protocolFee, royalty, sellerProceeds);
        uint256 counter = seaport.getCounter(bob);
        orderHash = seaport.getOrderHash(_components(consideration, counter));

        bytes32 passTermsHash = baldies.termsVersionHashOf(1);
        vm.prank(bob);
        bytes32 registeredZoneHash = listingRegistry.createListing(
            NexListingRegistry.ListingRequest({
                orderHash: orderHash,
                edition: address(baldies),
                tokenId: 1,
                termsVersionHash: passTermsHash,
                usdGPrice: SALE_PRICE,
                startTime: saleStart,
                expiry: saleEnd
            })
        );
        assertEq(registeredZoneHash, zoneHash, "registry must derive the signed zoneHash");

        vm.prank(bob);
        baldies.setApprovalForAll(SEAPORT_16, true);
        vm.prank(charlie);
        usdc.approve(SEAPORT_16, type(uint256).max);

        order = Order({parameters: _parameters(consideration), signature: _sign(orderHash)});
    }

    // ====================================================================
    // the money path
    // ====================================================================

    function testSeaportFulfilmentSettlesEveryEconomicComponent() public onFork {
        (Order memory order, bytes32 orderHash) =
            _listAndSign(EXPECTED_PROTOCOL_FEE, EXPECTED_ROYALTY, EXPECTED_SELLER);

        address passVault = tbaResolver.createAccount(address(baldies), 1);
        assertTrue(NexPassAccount(payable(passVault)).isVaultLocked(), "Vault locks while listed");

        uint256 feeBefore = usdc.balanceOf(feeRecipient);
        uint256 vaultBefore = usdc.balanceOf(address(royaltyVault));
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 charlieBefore = usdc.balanceOf(charlie);

        vm.prank(charlie);
        bool fulfilled = seaport.fulfillOrder(order, bytes32(0));
        assertTrue(fulfilled, "Seaport must report the order fulfilled");

        // Ownership moved through Seaport, not a direct transferFrom.
        assertEq(baldies.ownerOf(1), charlie, "buyer owns the Pass");

        // Every economic component, settled atomically.
        assertEq(usdc.balanceOf(feeRecipient) - feeBefore, EXPECTED_PROTOCOL_FEE, "secondary protocol fee");
        assertEq(usdc.balanceOf(address(royaltyVault)) - vaultBefore, EXPECTED_ROYALTY, "Builder royalty to vault");
        assertEq(usdc.balanceOf(bob) - bobBefore, EXPECTED_SELLER, "seller proceeds");
        assertEq(charlieBefore - usdc.balanceOf(charlie), SALE_PRICE, "buyer paid exactly the sale price");
        assertEq(
            EXPECTED_PROTOCOL_FEE + EXPECTED_ROYALTY + EXPECTED_SELLER, SALE_PRICE, "components must sum to the price"
        );

        // validateOrder ran and closed the listing.
        NexListingRegistry.Listing memory listing = listingRegistry.listingInfo(orderHash);
        assertEq(uint8(listing.status), uint8(NexListingRegistry.ListingStatus.Filled), "listing must be Filled");
        assertFalse(listingRegistry.isListingActive(orderHash), "filled listing is not active");
        assertEq(listingRegistry.activeListingFor(address(baldies), 1), bytes32(0), "active pointer cleared");

        // Royalty accrual recorded against the order, held for 30 days.
        NexRoyaltyVault.RoyaltyClaim memory claim = royaltyVault.claimInfo(orderHash);
        assertEq(claim.amount, EXPECTED_ROYALTY, "royalty claim amount");
        assertEq(claim.builder, alice, "royalty accrues to the Builder");
        assertEq(claim.edition, address(baldies));
        assertEq(claim.tokenId, 1);
        assertFalse(claim.withdrawn);
        assertEq(royaltyVault.totalOutstanding(), EXPECTED_ROYALTY, "vault tracks outstanding backing");
        assertFalse(royaltyVault.isWithdrawable(orderHash), "royalty is locked for the hold period");

        // The sale itself released the Vault lock, with no extra transaction.
        assertFalse(NexPassAccount(payable(passVault)).isVaultLocked(), "sale releases the Vault lock");
        assertFalse(advantageRegistry.isListed(address(baldies), 1), "Advantage lock released on settlement");

        console2.log("Seaport 1.6 fulfilment settled. protocolFee/royalty/seller (USDC base units):");
        console2.log(EXPECTED_PROTOCOL_FEE, EXPECTED_ROYALTY, EXPECTED_SELLER);
    }

    function testBuilderWithdrawsRoyaltyOnlyAfterHoldPeriod() public onFork {
        (Order memory order, bytes32 orderHash) =
            _listAndSign(EXPECTED_PROTOCOL_FEE, EXPECTED_ROYALTY, EXPECTED_SELLER);
        vm.prank(charlie);
        seaport.fulfillOrder(order, bytes32(0));

        vm.prank(alice);
        vm.expectRevert(NexRoyaltyVault.RoyaltyStillLocked.selector);
        royaltyVault.withdraw(orderHash);

        vm.warp(block.timestamp + royaltyVault.HOLD_PERIOD());
        assertTrue(royaltyVault.isWithdrawable(orderHash), "claim matures after the hold period");

        // Only the bound Builder may withdraw.
        vm.prank(charlie);
        vm.expectRevert(NexRoyaltyVault.NotBuilder.selector);
        royaltyVault.withdraw(orderHash);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        royaltyVault.withdraw(orderHash);
        assertEq(usdc.balanceOf(alice) - aliceBefore, EXPECTED_ROYALTY, "Builder receives the matured royalty");
        assertEq(royaltyVault.totalOutstanding(), 0, "outstanding cleared");
    }

    /// @dev Mutating a signed order's consideration changes its hash, so Seaport
    ///      rejects it on the signature before the zone is ever consulted.
    function testTamperedConsiderationFailsSeaportSignatureCheck() public onFork {
        (Order memory order,) = _listAndSign(EXPECTED_PROTOCOL_FEE, EXPECTED_ROYALTY, EXPECTED_SELLER);

        order.parameters.consideration[0].startAmount = 0;
        order.parameters.consideration[0].endAmount = 0;
        order.parameters.consideration[2].startAmount = EXPECTED_SELLER + EXPECTED_PROTOCOL_FEE;
        order.parameters.consideration[2].endAmount = EXPECTED_SELLER + EXPECTED_PROTOCOL_FEE;

        vm.prank(charlie);
        vm.expectRevert(bytes4(keccak256("InvalidSigner()")));
        seaport.fulfillOrder(order, bytes32(0));

        assertEq(baldies.ownerOf(1), bob, "tampered order must not move the Pass");
    }

    /// @dev The load-bearing case. The order is validly signed *and* its hash is
    ///      registered as a listing, so only the zone's consideration check
    ///      stands between a one base unit fee skim and settlement.
    function testZoneRejectsUnderpaidProtocolFeeOnASignedAndListedOrder() public onFork {
        saleStart = uint64(block.timestamp);
        saleEnd = uint64(block.timestamp + 7 days);
        zoneHash = listingRegistry.zoneHashFor(
            address(baldies), 1, bob, termsHash, SALE_PRICE, alice, ROYALTY_BPS, saleStart, saleEnd
        );

        ConsiderationItem[] memory underpaid = new ConsiderationItem[](3);
        underpaid[0] = _usdcTo(feeRecipient, EXPECTED_PROTOCOL_FEE - 1);
        underpaid[1] = _usdcTo(address(royaltyVault), EXPECTED_ROYALTY);
        underpaid[2] = _usdcTo(bob, EXPECTED_SELLER + 1);

        uint256 counter = seaport.getCounter(bob);
        bytes32 orderHash = seaport.getOrderHash(_components(underpaid, counter));

        bytes32 passTermsHash = baldies.termsVersionHashOf(1);
        vm.prank(bob);
        listingRegistry.createListing(
            NexListingRegistry.ListingRequest({
                orderHash: orderHash,
                edition: address(baldies),
                tokenId: 1,
                termsVersionHash: passTermsHash,
                usdGPrice: SALE_PRICE,
                startTime: saleStart,
                expiry: saleEnd
            })
        );
        vm.prank(bob);
        baldies.setApprovalForAll(SEAPORT_16, true);
        vm.prank(charlie);
        usdc.approve(SEAPORT_16, type(uint256).max);

        Order memory order = Order({parameters: _parameters(underpaid), signature: _sign(orderHash)});

        vm.prank(charlie);
        vm.expectRevert(NexListingRegistry.ConsiderationMismatch.selector);
        seaport.fulfillOrder(order, bytes32(0));

        assertEq(baldies.ownerOf(1), bob, "underpaid order must not settle");
        assertEq(usdc.balanceOf(address(royaltyVault)), 0, "no royalty accrued");
    }

    /// @dev A perfectly signed order that was never registered has no listing to
    ///      authorize, so the zone refuses it and Seaport cannot settle.
    function testUnregisteredOrderIsRejectedByZone() public onFork {
        (Order memory honest,) = _listAndSign(EXPECTED_PROTOCOL_FEE, EXPECTED_ROYALTY, EXPECTED_SELLER);

        // Same Pass and price, but the royalty is routed to the seller and this
        // order hash was never presented to the registry.
        ConsiderationItem[] memory skimmed = new ConsiderationItem[](2);
        skimmed[0] = _usdcTo(feeRecipient, EXPECTED_PROTOCOL_FEE);
        skimmed[1] = _usdcTo(bob, EXPECTED_SELLER + EXPECTED_ROYALTY);

        uint256 counter = seaport.getCounter(bob);
        bytes32 skimmedHash = seaport.getOrderHash(_components(skimmed, counter));
        Order memory skimmedOrder = Order({parameters: _parameters(skimmed), signature: _sign(skimmedHash)});

        vm.prank(charlie);
        vm.expectRevert(NexListingRegistry.ListingNotActive.selector);
        seaport.fulfillOrder(skimmedOrder, bytes32(0));

        assertEq(baldies.ownerOf(1), bob, "royalty-skimming order must not settle");
        assertEq(usdc.balanceOf(address(royaltyVault)), 0, "no royalty accrued");

        // The honest order is unaffected and still settles.
        vm.prank(charlie);
        assertTrue(seaport.fulfillOrder(honest, bytes32(0)), "honest order still settles");
        assertEq(baldies.ownerOf(1), charlie);
        assertEq(usdc.balanceOf(address(royaltyVault)), EXPECTED_ROYALTY);
    }
}
