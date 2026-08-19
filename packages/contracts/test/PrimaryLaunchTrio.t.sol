// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";

contract MockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RevertingMintReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejected");
    }
}

contract PrimaryLaunchTrioTest is Test {
    MockUSDG internal usdg;
    NexLaunchRegistry internal registry;
    NexMintController internal controller;
    NexPassFactory internal factory;
    NexPassEdition internal edition;

    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    bytes32 internal constant EDITION_ID = keccak256("nexstudio:primary:01");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("nexstudio:primary:artwork");
    bytes32 internal constant SALT = keccak256("nexstudio:primary:salt");
    bytes32 internal constant ADVANTAGES_V1 = keccak256("advantage:v1");
    bytes32 internal constant REFERRALS_V1 = keccak256("referrals:v1");
    uint32 internal constant ABSOLUTE_CAP = 5;
    uint256 internal constant PRICE = 1_000_000;

    function setUp() public {
        usdg = new MockUSDG();
        registry = new NexLaunchRegistry(address(this), address(usdg));
        controller = new NexMintController(address(this), registry, usdg, FEE_RECIPIENT, 500);
        factory = new NexPassFactory(address(this), address(this), registry, controller);
        registry.setFactory(address(factory));

        NexPassEdition.EditionConfig memory config = _config();
        address predicted = factory.predictEditionAddress(config, SALT);
        address deployed = factory.createEdition(config, PUBLISHER, SALT);
        assertEq(deployed, predicted);
        edition = NexPassEdition(deployed);
        assertEq(edition.owner(), address(this));
        assertEq(edition.mintController(), address(controller));
        assertEq(edition.editionId(), EDITION_ID);
        assertEq(factory.editionForId(EDITION_ID), deployed);

        usdg.mint(ALICE, 100 * PRICE);
        usdg.mint(BOB, 100 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(controller), type(uint256).max);
        vm.prank(BOB);
        usdg.approve(address(controller), type(uint256).max);
    }

    function _config() internal view returns (NexPassEdition.EditionConfig memory) {
        return NexPassEdition.EditionConfig({
            name: "NexStudio Founding Pass",
            symbol: "NEXPASS",
            initialOwner: address(this),
            editionId: EDITION_ID,
            absoluteSupplyCap: ABSOLUTE_CAP,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://nexstudio/"
        });
    }

    function _terms(uint256 supply, uint64 previewStartsAt, uint64 mintStartsAt)
        internal
        pure
        returns (NexLaunchRegistry.Terms memory)
    {
        return NexLaunchRegistry.Terms({
            activeSupply: supply,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 2 days,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 500,
            advantagesHash: ADVANTAGES_V1,
            referralTermsHash: REFERRALS_V1
        });
    }

    function _publish(uint256 supply) internal returns (bytes32 hash, uint64 mintStartsAt) {
        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        NexLaunchRegistry.Terms memory terms = _terms(supply, previewStartsAt, mintStartsAt);
        vm.prank(PUBLISHER);
        hash = registry.publishTerms(address(edition), terms);
    }

    function testFactoryWiresEditionAndRegistry() public view {
        NexLaunchRegistry.EditionRecord memory record = registry.editionInfo(address(edition));
        assertEq(record.editionId, EDITION_ID);
        assertEq(record.absoluteSupplyCap, ABSOLUTE_CAP);
        assertEq(record.publisher, PUBLISHER);
        assertEq(record.activeTermsVersionHash, bytes32(0));
        assertEq(record.nextTermsVersion, 0);
        assertTrue(record.registered);
        assertFalse(record.disabled);
        assertEq(registry.factory(), address(factory));
        assertEq(registry.settlementToken(), address(usdg));
    }

    function testTermsPublishCreatesVersionAndPreviewWindow() public {
        (bytes32 hash, uint64 mintStartsAt) = _publish(3);
        (bytes32 activeHash, NexLaunchRegistry.Terms memory terms) = registry.activeTerms(address(edition));

        assertEq(activeHash, hash);
        assertEq(terms.activeSupply, 3);
        assertEq(terms.pricePerPass, PRICE);
        assertTrue(registry.isPreviewOpen(address(edition), hash));
        assertFalse(registry.isMintOpen(address(edition), hash));

        vm.warp(mintStartsAt);
        assertFalse(registry.isPreviewOpen(address(edition), hash));
        assertTrue(registry.isMintOpen(address(edition), hash));
    }

    function testMintSettlesUSDGAndIsIdempotentPerPayer() public {
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(3);
        vm.warp(mintStartsAt);

        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 2,
            intentId: keccak256("alice:intent:1"),
            referrer: BOB
        });

        uint256 builderBefore = usdg.balanceOf(BUILDER);
        uint256 feeBefore = usdg.balanceOf(FEE_RECIPIENT);
        vm.prank(ALICE);
        uint256 firstTokenId = controller.mint(request);

        assertEq(firstTokenId, 1);
        assertEq(edition.totalMinted(), 2);
        assertEq(edition.ownerOf(1), ALICE);
        assertEq(edition.termsVersionHashOf(1), termsHash);
        assertEq(usdg.balanceOf(BUILDER) - builderBefore, 2 * PRICE * 95 / 100);
        assertEq(usdg.balanceOf(FEE_RECIPIENT) - feeBefore, 2 * PRICE * 5 / 100);
        vm.prank(ALICE);
        assertTrue(controller.isIntentConsumed(ALICE, request.intentId));

        vm.prank(ALICE);
        vm.expectRevert(NexMintController.IntentAlreadyConsumed.selector);
        controller.mint(request);

        request.intentId = keccak256("bob:intent:1");
        request.quantity = 1;
        vm.prank(BOB);
        controller.mint(request);
        assertEq(edition.totalMinted(), 3);
    }

    function testOldTermsCannotMintAfterMaterialRevision() public {
        (bytes32 v1, uint64 mintStartsAt) = _publish(3);
        vm.warp(mintStartsAt);

        NexMintController.MintRequest memory first = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: v1,
            recipient: ALICE,
            quantity: 1,
            intentId: keccak256("revision:first"),
            referrer: address(0)
        });
        vm.prank(ALICE);
        controller.mint(first);

        vm.warp(block.timestamp + 1);
        uint64 nextPreview = uint64(block.timestamp);
        uint64 nextMint = nextPreview + 1 days;
        NexLaunchRegistry.Terms memory v2Terms = _terms(5, nextPreview, nextMint);
        v2Terms.pricePerPass = 2 * PRICE;
        v2Terms.royaltyBps = 300;
        vm.prank(PUBLISHER);
        bytes32 v2 = registry.publishTerms(address(edition), v2Terms);
        assertTrue(v1 != v2);
        assertFalse(registry.isMintOpen(address(edition), v1));
        assertTrue(registry.isPreviewOpen(address(edition), v2));

        first.intentId = keccak256("revision:old");
        vm.prank(ALICE);
        vm.expectRevert(NexMintController.MintClosed.selector);
        controller.mint(first);

        vm.warp(nextMint);
        first.termsVersionHash = v2;
        first.intentId = keccak256("revision:new");
        vm.prank(ALICE);
        controller.mint(first);
        assertEq(edition.termsVersionHashOf(2), v2);
        (address receiver, uint256 amount) = edition.royaltyInfo(2, 1 ether);
        assertEq(receiver, BUILDER);
        assertEq(amount, 0.03 ether);
    }

    function testMintFailureRollsBackPaymentAndIntent() public {
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(3);
        vm.warp(mintStartsAt);
        RevertingMintReceiver receiver = new RevertingMintReceiver();
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: address(receiver),
            quantity: 1,
            intentId: keccak256("receiver:revert"),
            referrer: address(0)
        });

        uint256 aliceBefore = usdg.balanceOf(ALICE);
        vm.prank(ALICE);
        vm.expectRevert();
        controller.mint(request);
        assertEq(usdg.balanceOf(ALICE), aliceBefore);
        assertFalse(controller.isIntentConsumed(ALICE, request.intentId));
        assertEq(edition.totalMinted(), 0);
    }

    function testTermsValidationRejectsUnsafeLaunches() public {
        uint64 start = uint64(block.timestamp);
        NexLaunchRegistry.Terms memory invalid = _terms(ABSOLUTE_CAP + 1, start, start + 1 days);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexLaunchRegistry.InvalidSupply.selector);
        registry.publishTerms(address(edition), invalid);

        invalid = _terms(ABSOLUTE_CAP, start, start + 1 days - 1);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexLaunchRegistry.InvalidPreviewWindow.selector);
        registry.publishTerms(address(edition), invalid);

        invalid = _terms(ABSOLUTE_CAP, start, start + 1 days);
        invalid.royaltyBps = 501;
        vm.prank(PUBLISHER);
        vm.expectRevert(NexLaunchRegistry.InvalidRoyalty.selector);
        registry.publishTerms(address(edition), invalid);
    }

    function testRegistryAndControllerPauseFailClosed() public {
        (bytes32 termsHash, uint64 mintStartsAt) = _publish(3);
        vm.prank(address(this));
        registry.pause();
        assertFalse(registry.isMintOpen(address(edition), termsHash));
        registry.unpause();

        vm.warp(mintStartsAt);
        controller.pause();
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 1,
            intentId: keccak256("paused"),
            referrer: address(0)
        });
        vm.prank(ALICE);
        vm.expectRevert();
        controller.mint(request);
    }
}
