// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexAdvantageInitializer} from "../src/NexAdvantageInitializer.sol";
import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";

contract IntegrationUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MintAdvantageIntegrationTest is Test {
    IntegrationUSDG internal usdg;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    NexAdvantageRegistry internal advantageRegistry;
    NexAdvantageInitializer internal initializer;

    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant PRICE = 1_000_000;
    bytes32 internal constant REFERRAL_TERMS = keccak256("referral:v1");

    function setUp() public {
        usdg = new IntegrationUSDG();
        launchRegistry = new NexLaunchRegistry(address(this), address(usdg));
        mintController = new NexMintController(address(this), launchRegistry, usdg, FEE_RECIPIENT);
        factory = new NexPassFactory(address(this), address(this), launchRegistry, mintController);
        launchRegistry.setFactory(address(factory));

        NexPassEdition.EditionConfig memory config = NexPassEdition.EditionConfig({
            name: "Integrated Pass",
            symbol: "NEXINT",
            initialOwner: address(this),
            editionId: keccak256("integrated:edition"),
            absoluteSupplyCap: 10,
            artworkCommitment: keccak256("integrated:art"),
            baseTokenURI: "ipfs://integrated/"
        });
        edition = NexPassEdition(factory.createEdition(config, PUBLISHER, keccak256("integrated:salt")));

        advantageRegistry = new NexAdvantageRegistry(address(this), launchRegistry);
        initializer =
            new NexAdvantageInitializer(address(this), launchRegistry, advantageRegistry, address(mintController));
        advantageRegistry.setInitializer(address(initializer));
        mintController.setAdvantageInitializer(address(initializer));

        usdg.mint(ALICE, 100 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(mintController), type(uint256).max);
    }

    function _configs(bytes32 suffix, uint256 units)
        internal
        view
        returns (NexAdvantageRegistry.AdvantageConfig[] memory configs)
    {
        configs = new NexAdvantageRegistry.AdvantageConfig[](2);
        configs[0] = NexAdvantageRegistry.AdvantageConfig({
            advantageId: keccak256(abi.encode("quantity", suffix)),
            kind: NexAdvantageRegistry.AdvantageKind.QuantityBased,
            startsAt: uint64(block.timestamp + 1 days),
            endsAt: uint64(block.timestamp + 31 days),
            totalUnits: units,
            definitionHash: keccak256(abi.encode("quantity-definition", suffix, units))
        });
        configs[1] = NexAdvantageRegistry.AdvantageConfig({
            advantageId: keccak256(abi.encode("connected", suffix)),
            kind: NexAdvantageRegistry.AdvantageKind.Connected,
            startsAt: uint64(block.timestamp + 1 days),
            endsAt: uint64(block.timestamp + 31 days),
            totalUnits: 0,
            definitionHash: keccak256(abi.encode("connected-definition", suffix))
        });
    }

    function _publish(NexAdvantageRegistry.AdvantageConfig[] memory configs, uint256 activeSupply)
        internal
        returns (bytes32 termsHash, uint64 mintStartsAt)
    {
        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        bytes32 advantagesHash = configs.length == 0 ? bytes32(0) : advantageRegistry.hashAdvantages(configs);
        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: activeSupply,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 2 days,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 500,
            advantagesHash: advantagesHash,
            referralTermsHash: REFERRAL_TERMS
        });
        vm.prank(PUBLISHER);
        termsHash = launchRegistry.publishTerms(address(edition), terms);
    }

    function _request(
        bytes32 termsHash,
        uint256 quantity,
        bytes32 intentId,
        NexAdvantageRegistry.AdvantageConfig[] memory configs
    ) internal view returns (NexMintController.MintRequest memory) {
        return NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: quantity,
            intentId: intentId,
            referralHint: address(0),
            advantageConfigs: configs
        });
    }

    function testSingleMintInitializesCommittedAdvantagesAtomically() public {
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _configs("v1", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(configs, 3);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("single"), configs));

        NexAdvantageRegistry.PassRecord memory record = advantageRegistry.passInfo(address(edition), 1);
        assertTrue(record.initialized);
        assertEq(record.termsVersionHash, termsHash);
        assertEq(record.advantagesHash, advantageRegistry.hashAdvantages(configs));
        assertEq(record.advantageCount, 2);
    }

    function testBatchMintInitializesEveryExactSerial() public {
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _configs("batch", 3);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(configs, 3);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        uint256 first = mintController.mint(_request(termsHash, 3, keccak256("batch"), configs));
        assertEq(first, 1);
        for (uint256 tokenId = 1; tokenId <= 3; ++tokenId) {
            assertTrue(advantageRegistry.passInfo(address(edition), tokenId).initialized);
            assertEq(edition.termsVersionHashOf(tokenId), termsHash);
        }
    }

    function testNoAdvantageTermsMintWithoutUtilityRecord() public {
        NexAdvantageRegistry.AdvantageConfig[] memory none = new NexAdvantageRegistry.AdvantageConfig[](0);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(none, 1);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("none"), none));
        assertEq(edition.ownerOf(1), ALICE);
        vm.expectRevert(NexAdvantageRegistry.PassNotInitialized.selector);
        advantageRegistry.passInfo(address(edition), 1);
    }

    function testWrongCommitmentRollsBackPaymentMintAndIntent() public {
        NexAdvantageRegistry.AdvantageConfig[] memory committed = _configs("committed", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(committed, 1);
        NexAdvantageRegistry.AdvantageConfig[] memory altered = _configs("committed", 9);
        vm.warp(mintStartsAt);

        uint256 payerBefore = usdg.balanceOf(ALICE);
        bytes32 intentId = keccak256("wrong-commitment");
        vm.prank(ALICE);
        vm.expectRevert(NexAdvantageInitializer.AdvantagesRequired.selector);
        mintController.mint(_request(termsHash, 1, intentId, altered));

        assertEq(usdg.balanceOf(ALICE), payerBefore);
        assertEq(edition.totalMinted(), 0);
        assertFalse(mintController.isIntentConsumed(ALICE, intentId));
    }

    function testMissingInitializerFailsClosedBeforeBrokenMintPersists() public {
        NexLaunchRegistry freshRegistry = new NexLaunchRegistry(address(this), address(usdg));
        NexMintController freshController = new NexMintController(address(this), freshRegistry, usdg, FEE_RECIPIENT);
        NexPassFactory freshFactory = new NexPassFactory(address(this), address(this), freshRegistry, freshController);
        freshRegistry.setFactory(address(freshFactory));
        NexPassEdition.EditionConfig memory config = NexPassEdition.EditionConfig({
            name: "Unwired",
            symbol: "UNWIRED",
            initialOwner: address(this),
            editionId: keccak256("unwired"),
            absoluteSupplyCap: 1,
            artworkCommitment: keccak256("unwired:art"),
            baseTokenURI: "ipfs://unwired/"
        });
        NexPassEdition freshEdition =
            NexPassEdition(freshFactory.createEdition(config, PUBLISHER, keccak256("unwired:salt")));
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _configs("unwired", 1);
        uint64 preview = uint64(block.timestamp);
        uint64 mintStart = preview + 1 days;
        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: 1,
            pricePerPass: PRICE,
            previewStartsAt: preview,
            mintStartsAt: mintStart,
            mintEndsAt: mintStart + 1 days,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 0,
            advantagesHash: advantageRegistry.hashAdvantages(configs),
            referralTermsHash: REFERRAL_TERMS
        });
        vm.prank(PUBLISHER);
        bytes32 termsHash = freshRegistry.publishTerms(address(freshEdition), terms);
        vm.prank(ALICE);
        usdg.approve(address(freshController), type(uint256).max);
        vm.warp(mintStart);
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(freshEdition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 1,
            intentId: keccak256("unwired"),
            referralHint: address(0),
            advantageConfigs: configs
        });
        vm.prank(ALICE);
        vm.expectRevert(NexMintController.AdvantageInitializerRequired.selector);
        freshController.mint(request);
        assertEq(freshEdition.totalMinted(), 0);
    }

    function testTermsRevisionSnapshotsDistinctUtilityOnSameEdition() public {
        NexAdvantageRegistry.AdvantageConfig[] memory v1Configs = _configs("v1", 5);
        (bytes32 v1, uint64 v1Mint) = _publish(v1Configs, 2);
        vm.warp(v1Mint);
        vm.prank(ALICE);
        mintController.mint(_request(v1, 1, keccak256("v1"), v1Configs));

        vm.warp(block.timestamp + 1);
        NexAdvantageRegistry.AdvantageConfig[] memory v2Configs = _configs("v2", 2);
        (bytes32 v2, uint64 v2Mint) = _publish(v2Configs, 2);
        vm.warp(v2Mint);
        vm.prank(ALICE);
        mintController.mint(_request(v2, 1, keccak256("v2"), v2Configs));

        assertEq(advantageRegistry.passInfo(address(edition), 1).termsVersionHash, v1);
        assertEq(advantageRegistry.passInfo(address(edition), 2).termsVersionHash, v2);
        assertTrue(v1 != v2);
    }

    function testTransferPreservesAutomaticallyInitializedState() public {
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _configs("transfer", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(configs, 1);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("transfer"), configs));

        NexAdvantageRegistry.PassRecord memory beforeRecord = advantageRegistry.passInfo(address(edition), 1);
        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        NexAdvantageRegistry.PassRecord memory afterRecord = advantageRegistry.passInfo(address(edition), 1);
        assertEq(edition.ownerOf(1), BOB);
        assertEq(afterRecord.termsVersionHash, beforeRecord.termsVersionHash);
        assertEq(afterRecord.advantagesHash, beforeRecord.advantagesHash);
    }
}
