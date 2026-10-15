// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {OFLDAdvantageRegistry} from "../src/OFLDAdvantageRegistry.sol";
import {OFLDAdvantageInitializer} from "../src/OFLDAdvantageInitializer.sol";
import {OFLDLaunchRegistry} from "../src/OFLDLaunchRegistry.sol";
import {OFLDMintController} from "../src/OFLDMintController.sol";
import {OFLDPassEdition} from "../src/OFLDPassEdition.sol";
import {OFLDPassFactory} from "../src/OFLDPassFactory.sol";

contract AdvantageMockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AdvantageInitializerMock {
    OFLDAdvantageRegistry public immutable advantageRegistry;
    OFLDLaunchRegistry public immutable launchRegistry;
    address public immutable owner;

    constructor(OFLDAdvantageRegistry registry_, OFLDLaunchRegistry launchRegistry_, address owner_) {
        advantageRegistry = registry_;
        launchRegistry = launchRegistry_;
        owner = owner_;
    }

    function initializePass(
        address edition,
        uint256 tokenId,
        bytes32 termsVersionHash,
        bytes32 advantagesHash,
        OFLDAdvantageRegistry.AdvantageConfig[] calldata configs
    ) external {
        advantageRegistry.initializePass(edition, tokenId, termsVersionHash, advantagesHash, configs);
    }
}

contract AdvantageListingAuthorityMock {
    OFLDAdvantageRegistry public immutable advantageRegistry;
    address public immutable owner;

    constructor(OFLDAdvantageRegistry registry_, address owner_) {
        advantageRegistry = registry_;
        owner = owner_;
    }

    function setListed(address edition, uint256 tokenId, bool listed) external {
        advantageRegistry.setListed(edition, tokenId, listed);
    }
}

contract OFLDAdvantageRegistryTest is Test {
    AdvantageMockUSDG internal usdg;
    OFLDLaunchRegistry internal launchRegistry;
    OFLDMintController internal mintController;
    OFLDPassFactory internal factory;
    OFLDPassEdition internal edition;
    OFLDAdvantageRegistry internal advantages;
    OFLDAdvantageRegistry internal mintAdvantages;
    OFLDAdvantageInitializer internal mintInitializer;
    AdvantageInitializerMock internal initializer;
    AdvantageListingAuthorityMock internal listingAuthority;

    address internal constant OWNER = address(0xA11CE);
    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA1);
    address internal constant BOB = address(0xB2);
    bytes32 internal constant EDITION_ID = keccak256("ofldadvantage:edition");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("ofldadvantage:artwork");
    bytes32 internal constant SALT = keccak256("ofldadvantage:salt");
    bytes32 internal ADVANTAGES_HASH;
    bytes32 internal constant REFERRALS_HASH = keccak256("ofldadvantage:referrals:v1");
    uint256 internal constant PRICE = 1_000_000;
    uint64 internal advantageStartsAt;
    uint64 internal advantageEndsAt;
    uint64 internal lateAdvantageStartsAt;
    uint64 internal lateAdvantageEndsAt;

    function setUp() public {
        usdg = new AdvantageMockUSDG();
        launchRegistry = new OFLDLaunchRegistry(OWNER, address(usdg));
        mintController = new OFLDMintController(OWNER, launchRegistry, usdg, FEE_RECIPIENT);
        factory = new OFLDPassFactory(OWNER, OWNER, launchRegistry, mintController);

        vm.prank(OWNER);
        launchRegistry.setFactory(address(factory));

        OFLDPassEdition.EditionConfig memory config = OFLDPassEdition.EditionConfig({
            name: "OFLDAdvantage Pass",
            symbol: "OFLDADV",
            initialOwner: PUBLISHER,
            editionId: EDITION_ID,
            absoluteSupplyCap: 5,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://ofldadvantage/"
        });
        vm.prank(PUBLISHER);
        edition = OFLDPassEdition(factory.createEdition(config, SALT));

        // The primary path initializes a production-wired utility registry
        // atomically. This test contract keeps a second isolated registry for
        // direct Advantage-ledger adversarial tests below.
        mintAdvantages = new OFLDAdvantageRegistry(OWNER, launchRegistry);
        mintInitializer = new OFLDAdvantageInitializer(OWNER, launchRegistry, mintAdvantages, address(mintController));
        vm.prank(OWNER);
        mintAdvantages.setInitializer(address(mintInitializer));
        vm.prank(OWNER);
        mintController.setAdvantageInitializer(address(mintInitializer));

        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        advantageStartsAt = mintStartsAt;
        advantageEndsAt = mintStartsAt + 30 days;
        lateAdvantageStartsAt = mintStartsAt + 60 days;
        lateAdvantageEndsAt = mintStartsAt + 90 days;
        OFLDAdvantageRegistry.AdvantageConfig[] memory canonicalConfigs = _canonicalConfigs();
        ADVANTAGES_HASH = keccak256(abi.encode(keccak256("OUTERFIELD_ADVANTAGES_V1"), canonicalConfigs));
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
            advantagesHash: ADVANTAGES_HASH,
            referralTermsHash: REFERRALS_HASH
        });
        vm.prank(PUBLISHER);
        bytes32 publishedHash = launchRegistry.publishTerms(address(edition), terms);

        vm.warp(mintStartsAt);
        usdg.mint(ALICE, 10 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(mintController), type(uint256).max);
        OFLDMintController.MintRequest memory request = OFLDMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: publishedHash,
            recipient: ALICE,
            quantity: 2,
            intentId: keccak256("ofldadvantage:mint"),
            referralHint: address(0),
            advantageConfigs: canonicalConfigs
        });
        vm.prank(ALICE);
        mintController.mint(request);

        advantages = new OFLDAdvantageRegistry(OWNER, launchRegistry);
        initializer = new AdvantageInitializerMock(advantages, launchRegistry, OWNER);
        listingAuthority = new AdvantageListingAuthorityMock(advantages, OWNER);
        vm.prank(OWNER);
        advantages.setInitializer(address(initializer));
        vm.prank(OWNER);
        advantages.setListingAuthority(address(listingAuthority));
    }

    function _config(
        bytes32 advantageId,
        OFLDAdvantageRegistry.AdvantageKind kind,
        uint64 startsAt,
        uint64 endsAt,
        uint256 totalUnits
    ) internal pure returns (OFLDAdvantageRegistry.AdvantageConfig memory) {
        return OFLDAdvantageRegistry.AdvantageConfig({
            advantageId: advantageId,
            kind: kind,
            startsAt: startsAt,
            endsAt: endsAt,
            totalUnits: totalUnits,
            definitionHash: keccak256(abi.encode("definition", advantageId))
        });
    }

    function _canonicalConfigs() internal view returns (OFLDAdvantageRegistry.AdvantageConfig[] memory configs) {
        configs = new OFLDAdvantageRegistry.AdvantageConfig[](5);
        configs[0] = _config(
            keccak256("time"), OFLDAdvantageRegistry.AdvantageKind.TimeBased, advantageStartsAt, advantageEndsAt, 0
        );
        configs[1] = _config(
            keccak256("quantity"),
            OFLDAdvantageRegistry.AdvantageKind.QuantityBased,
            advantageStartsAt,
            advantageEndsAt,
            5
        );
        configs[2] = _config(
            keccak256("connected"), OFLDAdvantageRegistry.AdvantageKind.Connected, advantageStartsAt, advantageEndsAt, 0
        );
        configs[3] = _config(
            keccak256("redemption"),
            OFLDAdvantageRegistry.AdvantageKind.Redemption,
            advantageStartsAt,
            advantageEndsAt,
            3
        );
        configs[4] = _config(
            keccak256("late-time"),
            OFLDAdvantageRegistry.AdvantageKind.TimeBased,
            lateAdvantageStartsAt,
            lateAdvantageEndsAt,
            0
        );
    }

    function _initialize(uint256 tokenId, OFLDAdvantageRegistry.AdvantageConfig[] memory configs) internal {
        bytes32 termsHash = edition.termsVersionHashOf(tokenId);
        initializer.initializePass(address(edition), tokenId, termsHash, ADVANTAGES_HASH, configs);
    }

    function testInitializesAllAdvantageKindsAndBindsTerms() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();

        _initialize(1, configs);

        OFLDAdvantageRegistry.PassRecord memory record = advantages.passInfo(address(edition), 1);
        assertEq(advantages.hashAdvantages(configs), ADVANTAGES_HASH);
        assertEq(record.termsVersionHash, edition.termsVersionHashOf(1));
        assertEq(record.advantagesHash, ADVANTAGES_HASH);
        assertEq(record.advantageCount, 5);
        assertFalse(record.listed);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 30 days);
        assertEq(advantages.remaining(address(edition), 1, configs[1].advantageId), 5);
        assertEq(advantages.remaining(address(edition), 1, configs[2].advantageId), 1);
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 3);
        assertTrue(advantages.isUsable(address(edition), 1, configs[2].advantageId));
    }

    function testTransferPreservesRemainingAdvantage() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        vm.prank(ALICE);
        assertTrue(advantages.redeem(address(edition), 1, configs[3].advantageId, keccak256("claim:1")));
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 2);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(edition.ownerOf(1), BOB);
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 2);

        vm.prank(BOB);
        assertTrue(advantages.redeem(address(edition), 1, configs[3].advantageId, keccak256("claim:2")));
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 1);
    }

    function testListedPassCannotConsumeAndLockSurvivesTransfer() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        listingAuthority.setListed(address(edition), 1, true);
        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.ListedPass.selector);
        advantages.redeem(address(edition), 1, configs[3].advantageId, keccak256("listed:1"));

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertTrue(advantages.isListed(address(edition), 1));
        vm.prank(BOB);
        vm.expectRevert(OFLDAdvantageRegistry.ListedPass.selector);
        advantages.redeem(address(edition), 1, configs[3].advantageId, keccak256("listed:2"));

        listingAuthority.setListed(address(edition), 1, false);
        vm.prank(BOB);
        assertTrue(advantages.redeem(address(edition), 1, configs[3].advantageId, keccak256("listed:3")));
    }

    function testRedemptionIdsAreScopedToExactUtility() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);
        _initialize(2, configs);
        bytes32 redemptionId = keccak256("global:redemption:1");

        vm.prank(ALICE);
        assertTrue(advantages.redeem(address(edition), 1, configs[3].advantageId, redemptionId));
        vm.prank(ALICE);
        assertFalse(advantages.redeem(address(edition), 1, configs[3].advantageId, redemptionId));
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 2);

        vm.prank(ALICE);
        assertTrue(advantages.redeem(address(edition), 2, configs[3].advantageId, redemptionId));
        assertEq(advantages.useAmount(address(edition), 1, configs[3].advantageId, redemptionId), 1);
        assertEq(advantages.useAmount(address(edition), 2, configs[3].advantageId, redemptionId), 1);
    }

    function testQuantityConsumptionIsIdempotentAndExpires() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        bytes32 useId = keccak256("quantity:1");
        vm.prank(ALICE);
        assertTrue(advantages.consumeQuantity(address(edition), 1, configs[1].advantageId, 2, useId));
        vm.prank(ALICE);
        assertFalse(advantages.consumeQuantity(address(edition), 1, configs[1].advantageId, 2, useId));
        assertEq(advantages.useAmount(address(edition), 1, configs[1].advantageId, useId), 2);
        assertEq(advantages.remaining(address(edition), 1, configs[1].advantageId), 3);

        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.UseIdAmountMismatch.selector);
        advantages.consumeQuantity(address(edition), 1, configs[1].advantageId, 1, useId);

        vm.warp(advantageEndsAt);
        assertFalse(advantages.isUsable(address(edition), 1, configs[1].advantageId));
        assertEq(advantages.remaining(address(edition), 1, configs[1].advantageId), 0);
        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.AdvantageUnavailable.selector);
        advantages.consumeQuantity(address(edition), 1, configs[1].advantageId, 1, keccak256("quantity:2"));
    }

    function testAuthorityAndTermsValidationAreFailClosed() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        bytes32 termsHash = edition.termsVersionHashOf(1);

        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.NotInitializer.selector);
        advantages.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);

        vm.expectRevert(OFLDAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, keccak256("wrong"), configs);

        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.NotListingAuthority.selector);
        advantages.setListed(address(edition), 1, true);
    }

    function testRedemptionCanConsumePartOrAllRemainingUnits() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);
        bytes32 advantageId = configs[3].advantageId;
        bytes32 partialId = keccak256("redemption:partial");
        bytes32 allId = keccak256("redemption:all");

        vm.prank(ALICE);
        assertTrue(advantages.redeemAmount(address(edition), 1, advantageId, 2, partialId));
        assertEq(advantages.remaining(address(edition), 1, advantageId), 1);

        vm.prank(ALICE);
        assertTrue(advantages.redeemAmount(address(edition), 1, advantageId, 1, allId));
        assertEq(advantages.remaining(address(edition), 1, advantageId), 0);
    }

    function testAdvantagesCommitmentRejectsAlteredQuantityDatesKindsAndDefinitions() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        bytes32 termsHash = edition.termsVersionHashOf(1);

        configs[0].endsAt += 1;
        vm.expectRevert(OFLDAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);

        configs = _canonicalConfigs();
        configs[1].totalUnits += 1;
        vm.expectRevert(OFLDAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);

        configs = _canonicalConfigs();
        configs[2].kind = OFLDAdvantageRegistry.AdvantageKind.Redemption;
        configs[2].totalUnits = 1;
        vm.expectRevert(OFLDAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);

        configs = _canonicalConfigs();
        configs[3].definitionHash = keccak256("altered-definition");
        vm.expectRevert(OFLDAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);
    }

    function testTimeBasedRemainingFreezesWhileListed() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        vm.warp(advantageStartsAt + 10 days);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 20 days);

        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(advantageStartsAt + 20 days);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 20 days);

        listingAuthority.setListed(address(edition), 1, false);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 20 days);

        vm.warp(advantageStartsAt + 40 days);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 0);
    }

    function testListingBeforeTimeAdvantageDoesNotShiftStart() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(lateAdvantageStartsAt - 1 days);
        listingAuthority.setListed(address(edition), 1, false);
        assertEq(advantages.remaining(address(edition), 1, configs[4].advantageId), 0);

        vm.warp(lateAdvantageStartsAt);
        assertEq(advantages.remaining(address(edition), 1, configs[4].advantageId), 30 days);
    }

    function testListingAfterTimeAdvantageExpiryDoesNotExtendIt() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        vm.warp(advantageEndsAt + 1);
        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(advantageEndsAt + 10 days);
        listingAuthority.setListed(address(edition), 1, false);

        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 0);
        assertFalse(advantages.isUsable(address(edition), 1, configs[0].advantageId));
    }

    function testTwoTimeAdvantagesFreezeIndependently() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        vm.warp(advantageStartsAt + 10 days);
        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(advantageStartsAt + 20 days);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        listingAuthority.setListed(address(edition), 1, false);

        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 20 days);
        assertEq(advantages.remaining(address(edition), 1, configs[4].advantageId), 0);

        vm.warp(lateAdvantageStartsAt);
        assertEq(advantages.remaining(address(edition), 1, configs[4].advantageId), 30 days);
    }

    function testRepeatedListingCyclesPreserveExactRemainingTime() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _canonicalConfigs();
        _initialize(1, configs);

        vm.warp(advantageStartsAt + 5 days);
        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(advantageStartsAt + 10 days);
        listingAuthority.setListed(address(edition), 1, false);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 25 days);

        vm.warp(advantageStartsAt + 15 days);
        listingAuthority.setListed(address(edition), 1, true);
        vm.warp(advantageStartsAt + 20 days);
        listingAuthority.setListed(address(edition), 1, false);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 20 days);

        vm.warp(advantageStartsAt + 30 days);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 10 days);
    }

    function testAuthorityWiringCannotBeConsumedByMisconfiguredContracts() public {
        OFLDAdvantageRegistry fresh = new OFLDAdvantageRegistry(OWNER, launchRegistry);
        AdvantageInitializerMock wrongInitializer =
            new AdvantageInitializerMock(OFLDAdvantageRegistry(address(0x1234)), launchRegistry, OWNER);
        vm.prank(OWNER);
        vm.expectRevert(OFLDAdvantageRegistry.InitializerWiringMismatch.selector);
        fresh.setInitializer(address(wrongInitializer));

        AdvantageInitializerMock validInitializer = new AdvantageInitializerMock(fresh, launchRegistry, OWNER);
        vm.prank(OWNER);
        fresh.setInitializer(address(validInitializer));

        AdvantageListingAuthorityMock wrongListing =
            new AdvantageListingAuthorityMock(OFLDAdvantageRegistry(address(0x5678)), OWNER);
        vm.prank(OWNER);
        vm.expectRevert(OFLDAdvantageRegistry.ListingAuthorityWiringMismatch.selector);
        fresh.setListingAuthority(address(wrongListing));

        AdvantageListingAuthorityMock validListing = new AdvantageListingAuthorityMock(fresh, OWNER);
        vm.prank(OWNER);
        fresh.setListingAuthority(address(validListing));
    }
}
