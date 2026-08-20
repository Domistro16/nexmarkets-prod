// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";

contract AdvantageMockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AdvantageInitializerMock {
    NexAdvantageRegistry public immutable registry;

    constructor(NexAdvantageRegistry registry_) {
        registry = registry_;
    }

    function initializePass(
        address edition,
        uint256 tokenId,
        bytes32 termsVersionHash,
        bytes32 advantagesHash,
        NexAdvantageRegistry.AdvantageConfig[] calldata configs
    ) external {
        registry.initializePass(edition, tokenId, termsVersionHash, advantagesHash, configs);
    }
}

contract AdvantageListingAuthorityMock {
    NexAdvantageRegistry public immutable registry;

    constructor(NexAdvantageRegistry registry_) {
        registry = registry_;
    }

    function setListed(address edition, uint256 tokenId, bool listed) external {
        registry.setListed(edition, tokenId, listed);
    }
}

contract NexAdvantageRegistryTest is Test {
    AdvantageMockUSDG internal usdg;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    NexAdvantageRegistry internal advantages;
    AdvantageInitializerMock internal initializer;
    AdvantageListingAuthorityMock internal listingAuthority;

    address internal constant OWNER = address(0xA11CE);
    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA1);
    address internal constant BOB = address(0xB2);
    bytes32 internal constant EDITION_ID = keccak256("nexadvantage:edition");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("nexadvantage:artwork");
    bytes32 internal constant SALT = keccak256("nexadvantage:salt");
    bytes32 internal constant ADVANTAGES_HASH = keccak256("nexadvantage:definitions:v1");
    bytes32 internal constant REFERRALS_HASH = keccak256("nexadvantage:referrals:v1");
    uint256 internal constant PRICE = 1_000_000;

    function setUp() public {
        usdg = new AdvantageMockUSDG();
        launchRegistry = new NexLaunchRegistry(OWNER, address(usdg));
        mintController = new NexMintController(OWNER, launchRegistry, usdg, FEE_RECIPIENT);
        factory = new NexPassFactory(OWNER, OWNER, launchRegistry, mintController);

        vm.prank(OWNER);
        launchRegistry.setFactory(address(factory));

        NexPassEdition.EditionConfig memory config = NexPassEdition.EditionConfig({
            name: "NexAdvantage Pass",
            symbol: "NEXADV",
            initialOwner: OWNER,
            editionId: EDITION_ID,
            absoluteSupplyCap: 5,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://nexadvantage/"
        });
        vm.prank(OWNER);
        edition = NexPassEdition(factory.createEdition(config, PUBLISHER, SALT));

        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: 3,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 2 days,
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
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: publishedHash,
            recipient: ALICE,
            quantity: 2,
            intentId: keccak256("nexadvantage:mint"),
            referralHint: address(0)
        });
        vm.prank(ALICE);
        mintController.mint(request);

        advantages = new NexAdvantageRegistry(OWNER, launchRegistry);
        initializer = new AdvantageInitializerMock(advantages);
        listingAuthority = new AdvantageListingAuthorityMock(advantages);
        vm.prank(OWNER);
        advantages.setInitializer(address(initializer));
        vm.prank(OWNER);
        advantages.setListingAuthority(address(listingAuthority));
    }

    function _config(
        bytes32 advantageId,
        NexAdvantageRegistry.AdvantageKind kind,
        uint64 startsAt,
        uint64 endsAt,
        uint256 totalUnits
    ) internal pure returns (NexAdvantageRegistry.AdvantageConfig memory) {
        return NexAdvantageRegistry.AdvantageConfig({
            advantageId: advantageId,
            kind: kind,
            startsAt: startsAt,
            endsAt: endsAt,
            totalUnits: totalUnits,
            definitionHash: keccak256(abi.encode("definition", advantageId))
        });
    }

    function _initialize(uint256 tokenId, NexAdvantageRegistry.AdvantageConfig[] memory configs) internal {
        bytes32 termsHash = edition.termsVersionHashOf(tokenId);
        initializer.initializePass(address(edition), tokenId, termsHash, ADVANTAGES_HASH, configs);
    }

    function testInitializesAllAdvantageKindsAndBindsTerms() public {
        uint64 startsAt = uint64(block.timestamp);
        uint64 endsAt = startsAt + 30 days;
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](4);
        configs[0] = _config(keccak256("time"), NexAdvantageRegistry.AdvantageKind.TimeBased, startsAt, endsAt, 0);
        configs[1] =
            _config(keccak256("quantity"), NexAdvantageRegistry.AdvantageKind.QuantityBased, startsAt, endsAt, 5);
        configs[2] = _config(keccak256("connected"), NexAdvantageRegistry.AdvantageKind.Connected, startsAt, endsAt, 0);
        configs[3] =
            _config(keccak256("redemption"), NexAdvantageRegistry.AdvantageKind.Redemption, startsAt, endsAt, 3);

        _initialize(1, configs);

        NexAdvantageRegistry.PassRecord memory record = advantages.passInfo(address(edition), 1);
        assertEq(record.termsVersionHash, edition.termsVersionHashOf(1));
        assertEq(record.advantagesHash, ADVANTAGES_HASH);
        assertEq(record.advantageCount, 4);
        assertFalse(record.listed);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 30 days);
        assertEq(advantages.remaining(address(edition), 1, configs[1].advantageId), 5);
        assertEq(advantages.remaining(address(edition), 1, configs[2].advantageId), 1);
        assertEq(advantages.remaining(address(edition), 1, configs[3].advantageId), 3);
        assertTrue(advantages.isUsable(address(edition), 1, configs[2].advantageId));
    }

    function testTransferPreservesRemainingAdvantage() public {
        uint64 startsAt = uint64(block.timestamp);
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = _config(
            keccak256("redemption"), NexAdvantageRegistry.AdvantageKind.Redemption, startsAt, startsAt + 30 days, 3
        );
        _initialize(1, configs);

        vm.prank(ALICE);
        assertTrue(advantages.redeem(address(edition), 1, configs[0].advantageId, keccak256("claim:1")));
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 2);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(edition.ownerOf(1), BOB);
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 2);

        vm.prank(BOB);
        assertTrue(advantages.redeem(address(edition), 1, configs[0].advantageId, keccak256("claim:2")));
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 1);
    }

    function testListedPassCannotConsumeAndLockSurvivesTransfer() public {
        uint64 startsAt = uint64(block.timestamp);
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = _config(
            keccak256("listed-redemption"),
            NexAdvantageRegistry.AdvantageKind.Redemption,
            startsAt,
            startsAt + 30 days,
            2
        );
        _initialize(1, configs);

        listingAuthority.setListed(address(edition), 1, true);
        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageRegistry.ListedPass.selector);
        advantages.redeem(address(edition), 1, configs[0].advantageId, keccak256("listed:1"));

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertTrue(advantages.isListed(address(edition), 1));
        vm.prank(BOB);
        vm.expectRevert(NexAdvantageRegistry.ListedPass.selector);
        advantages.redeem(address(edition), 1, configs[0].advantageId, keccak256("listed:2"));

        listingAuthority.setListed(address(edition), 1, false);
        vm.prank(BOB);
        assertTrue(advantages.redeem(address(edition), 1, configs[0].advantageId, keccak256("listed:3")));
    }

    function testRedemptionIdsAreIdempotentAndCannotCrossPasses() public {
        uint64 startsAt = uint64(block.timestamp);
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = _config(
            keccak256("idempotent-redemption"),
            NexAdvantageRegistry.AdvantageKind.Redemption,
            startsAt,
            startsAt + 30 days,
            2
        );
        _initialize(1, configs);
        _initialize(2, configs);
        bytes32 redemptionId = keccak256("global:redemption:1");

        vm.prank(ALICE);
        assertTrue(advantages.redeem(address(edition), 1, configs[0].advantageId, redemptionId));
        vm.prank(ALICE);
        assertFalse(advantages.redeem(address(edition), 1, configs[0].advantageId, redemptionId));
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 1);

        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageRegistry.UseIdCollision.selector);
        advantages.redeem(address(edition), 2, configs[0].advantageId, redemptionId);
    }

    function testQuantityConsumptionIsIdempotentAndExpires() public {
        uint64 startsAt = uint64(block.timestamp);
        uint64 endsAt = startsAt + 2 days;
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] =
            _config(keccak256("quantity"), NexAdvantageRegistry.AdvantageKind.QuantityBased, startsAt, endsAt, 5);
        _initialize(1, configs);

        bytes32 useId = keccak256("quantity:1");
        vm.prank(ALICE);
        assertTrue(advantages.consumeQuantity(address(edition), 1, configs[0].advantageId, 2, useId));
        vm.prank(ALICE);
        assertFalse(advantages.consumeQuantity(address(edition), 1, configs[0].advantageId, 2, useId));
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 3);

        vm.warp(endsAt);
        assertFalse(advantages.isUsable(address(edition), 1, configs[0].advantageId));
        assertEq(advantages.remaining(address(edition), 1, configs[0].advantageId), 0);
        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageRegistry.AdvantageUnavailable.selector);
        advantages.consumeQuantity(address(edition), 1, configs[0].advantageId, 1, keccak256("quantity:2"));
    }

    function testAuthorityAndTermsValidationAreFailClosed() public {
        NexAdvantageRegistry.AdvantageConfig[] memory configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        uint64 startsAt = uint64(block.timestamp);
        bytes32 termsHash = edition.termsVersionHashOf(1);
        configs[0] = _config(
            keccak256("bad-terms"), NexAdvantageRegistry.AdvantageKind.Redemption, startsAt, startsAt + 1 days, 1
        );

        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageRegistry.NotInitializer.selector);
        advantages.initializePass(address(edition), 1, termsHash, ADVANTAGES_HASH, configs);

        vm.expectRevert(NexAdvantageRegistry.AdvantagesHashMismatch.selector);
        initializer.initializePass(address(edition), 1, termsHash, keccak256("wrong"), configs);

        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageRegistry.NotListingAuthority.selector);
        advantages.setListed(address(edition), 1, true);
    }
}
