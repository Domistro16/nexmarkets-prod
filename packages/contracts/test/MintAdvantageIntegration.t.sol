// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {OFLDAdvantageInitializer} from "../src/OFLDAdvantageInitializer.sol";
import {OFLDAdvantageRegistry} from "../src/OFLDAdvantageRegistry.sol";
import {OFLDLaunchRegistry} from "../src/OFLDLaunchRegistry.sol";
import {OFLDMintController} from "../src/OFLDMintController.sol";
import {OFLDPassEdition} from "../src/OFLDPassEdition.sol";
import {OFLDPassFactory} from "../src/OFLDPassFactory.sol";

contract IntegrationUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MintAdvantageIntegrationTest is Test {
    IntegrationUSDG internal usdg;
    OFLDLaunchRegistry internal launchRegistry;
    OFLDMintController internal mintController;
    OFLDPassFactory internal factory;
    OFLDPassEdition internal edition;
    OFLDAdvantageRegistry internal advantageRegistry;
    OFLDAdvantageInitializer internal initializer;

    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant PRICE = 1_000_000;
    bytes32 internal constant REFERRAL_TERMS = keccak256("referral:v1");

    function setUp() public {
        usdg = new IntegrationUSDG();
        launchRegistry = new OFLDLaunchRegistry(address(this), address(usdg));
        mintController = new OFLDMintController(address(this), launchRegistry, usdg, FEE_RECIPIENT);
        factory = new OFLDPassFactory(address(this), address(this), launchRegistry, mintController);
        launchRegistry.setFactory(address(factory));

        OFLDPassEdition.EditionConfig memory config = OFLDPassEdition.EditionConfig({
            name: "Integrated Pass",
            symbol: "OFLDINT",
            initialOwner: PUBLISHER,
            editionId: keccak256("integrated:edition"),
            absoluteSupplyCap: 10,
            artworkCommitment: keccak256("integrated:art"),
            baseTokenURI: "ipfs://integrated/"
        });
        vm.prank(PUBLISHER);
        edition = OFLDPassEdition(factory.createEdition(config, keccak256("integrated:salt")));

        advantageRegistry = new OFLDAdvantageRegistry(address(this), launchRegistry);
        initializer =
            new OFLDAdvantageInitializer(address(this), launchRegistry, advantageRegistry, address(mintController));
        advantageRegistry.setInitializer(address(initializer));
        mintController.setAdvantageInitializer(address(initializer));

        usdg.mint(ALICE, 100 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(mintController), type(uint256).max);
    }

    function _configs(bytes32 suffix, uint256 units)
        internal
        view
        returns (OFLDAdvantageRegistry.AdvantageConfig[] memory configs)
    {
        configs = new OFLDAdvantageRegistry.AdvantageConfig[](2);
        configs[0] = OFLDAdvantageRegistry.AdvantageConfig({
            advantageId: keccak256(abi.encode("quantity", suffix)),
            kind: OFLDAdvantageRegistry.AdvantageKind.QuantityBased,
            startsAt: uint64(block.timestamp + 1 days),
            endsAt: uint64(block.timestamp + 31 days),
            totalUnits: units,
            definitionHash: keccak256(abi.encode("quantity-definition", suffix, units))
        });
        configs[1] = OFLDAdvantageRegistry.AdvantageConfig({
            advantageId: keccak256(abi.encode("connected", suffix)),
            kind: OFLDAdvantageRegistry.AdvantageKind.Connected,
            startsAt: uint64(block.timestamp + 1 days),
            endsAt: uint64(block.timestamp + 31 days),
            totalUnits: 0,
            definitionHash: keccak256(abi.encode("connected-definition", suffix))
        });
    }

    function _publish(OFLDAdvantageRegistry.AdvantageConfig[] memory configs, uint256 activeSupply)
        internal
        returns (bytes32 termsHash, uint64 mintStartsAt)
    {
        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        bytes32 advantagesHash = configs.length == 0 ? bytes32(0) : advantageRegistry.hashAdvantages(configs);
        OFLDLaunchRegistry.Terms memory terms = OFLDLaunchRegistry.Terms({
            activeSupply: activeSupply,
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
            referralTermsHash: REFERRAL_TERMS
        });
        vm.prank(PUBLISHER);
        termsHash = launchRegistry.publishTerms(address(edition), terms);
    }

    function _request(
        bytes32 termsHash,
        uint256 quantity,
        bytes32 intentId,
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs
    ) internal view returns (OFLDMintController.MintRequest memory) {
        return OFLDMintController.MintRequest({
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
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _configs("v1", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(configs, 3);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("single"), configs));

        OFLDAdvantageRegistry.PassRecord memory record = advantageRegistry.passInfo(address(edition), 1);
        assertTrue(record.initialized);
        assertEq(record.termsVersionHash, termsHash);
        assertEq(record.advantagesHash, advantageRegistry.hashAdvantages(configs));
        assertEq(record.advantageCount, 2);
    }

    function testBatchMintInitializesEveryExactSerial() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _configs("batch", 3);
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
        OFLDAdvantageRegistry.AdvantageConfig[] memory none = new OFLDAdvantageRegistry.AdvantageConfig[](0);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(none, 1);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("none"), none));
        assertEq(edition.ownerOf(1), ALICE);
        vm.expectRevert(OFLDAdvantageRegistry.PassNotInitialized.selector);
        advantageRegistry.passInfo(address(edition), 1);
    }

    function testWrongCommitmentRollsBackPaymentMintAndIntent() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory committed = _configs("committed", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(committed, 1);
        OFLDAdvantageRegistry.AdvantageConfig[] memory altered = _configs("committed", 9);
        vm.warp(mintStartsAt);

        uint256 payerBefore = usdg.balanceOf(ALICE);
        bytes32 intentId = keccak256("wrong-commitment");
        vm.prank(ALICE);
        vm.expectRevert(OFLDAdvantageInitializer.AdvantagesRequired.selector);
        mintController.mint(_request(termsHash, 1, intentId, altered));

        assertEq(usdg.balanceOf(ALICE), payerBefore);
        assertEq(edition.totalMinted(), 0);
        assertFalse(mintController.isIntentConsumed(ALICE, intentId));
    }

    function testMissingInitializerFailsClosedBeforeBrokenMintPersists() public {
        OFLDLaunchRegistry freshRegistry = new OFLDLaunchRegistry(address(this), address(usdg));
        OFLDMintController freshController = new OFLDMintController(address(this), freshRegistry, usdg, FEE_RECIPIENT);
        OFLDPassFactory freshFactory = new OFLDPassFactory(address(this), address(this), freshRegistry, freshController);
        freshRegistry.setFactory(address(freshFactory));
        OFLDPassEdition.EditionConfig memory config = OFLDPassEdition.EditionConfig({
            name: "Unwired",
            symbol: "UNWIRED",
            initialOwner: PUBLISHER,
            editionId: keccak256("unwired"),
            absoluteSupplyCap: 1,
            artworkCommitment: keccak256("unwired:art"),
            baseTokenURI: "ipfs://unwired/"
        });
        vm.prank(PUBLISHER);
        OFLDPassEdition freshEdition = OFLDPassEdition(freshFactory.createEdition(config, keccak256("unwired:salt")));
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _configs("unwired", 1);
        uint64 preview = uint64(block.timestamp);
        uint64 mintStart = preview + 1 days;
        OFLDLaunchRegistry.Terms memory terms = OFLDLaunchRegistry.Terms({
            activeSupply: 1,
            pricePerPass: PRICE,
            previewStartsAt: preview,
            mintStartsAt: mintStart,
            mintEndsAt: mintStart + 1 days,
            allowlistRoot: bytes32(0),
            allowlistEndsAt: 0,
            allowlistSupply: 0,
            walletAllowance: 0,
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
        OFLDMintController.MintRequest memory request = OFLDMintController.MintRequest({
            edition: address(freshEdition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 1,
            intentId: keccak256("unwired"),
            referralHint: address(0),
            advantageConfigs: configs
        });
        vm.prank(ALICE);
        vm.expectRevert(OFLDMintController.AdvantageInitializerRequired.selector);
        freshController.mint(request);
        assertEq(freshEdition.totalMinted(), 0);
    }

    function testTermsRevisionSnapshotsDistinctUtilityOnSameEdition() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory v1Configs = _configs("v1", 5);
        (bytes32 v1, uint64 v1Mint) = _publish(v1Configs, 2);
        vm.warp(v1Mint);
        vm.prank(ALICE);
        mintController.mint(_request(v1, 1, keccak256("v1"), v1Configs));

        vm.warp(block.timestamp + 1);
        OFLDAdvantageRegistry.AdvantageConfig[] memory v2Configs = _configs("v2", 2);
        (bytes32 v2, uint64 v2Mint) = _publish(v2Configs, 2);
        vm.warp(v2Mint);
        vm.prank(ALICE);
        mintController.mint(_request(v2, 1, keccak256("v2"), v2Configs));

        assertEq(advantageRegistry.passInfo(address(edition), 1).termsVersionHash, v1);
        assertEq(advantageRegistry.passInfo(address(edition), 2).termsVersionHash, v2);
        assertTrue(v1 != v2);
    }

    function testTransferPreservesAutomaticallyInitializedState() public {
        OFLDAdvantageRegistry.AdvantageConfig[] memory configs = _configs("transfer", 5);
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(configs, 1);
        vm.warp(mintStartsAt);
        vm.prank(ALICE);
        mintController.mint(_request(termsHash, 1, keccak256("transfer"), configs));

        OFLDAdvantageRegistry.PassRecord memory beforeRecord = advantageRegistry.passInfo(address(edition), 1);
        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        OFLDAdvantageRegistry.PassRecord memory afterRecord = advantageRegistry.passInfo(address(edition), 1);
        assertEq(edition.ownerOf(1), BOB);
        assertEq(afterRecord.termsVersionHash, beforeRecord.termsVersionHash);
        assertEq(afterRecord.advantagesHash, beforeRecord.advantagesHash);
    }
}
