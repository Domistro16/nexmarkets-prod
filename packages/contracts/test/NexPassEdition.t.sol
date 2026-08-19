// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";

contract MintControllerMock {
    function mintEdition(
        NexPassEdition edition,
        address to,
        uint256 quantity,
        bytes32 termsVersionHash,
        uint256 termsSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external returns (uint256 firstTokenId) {
        return edition.mint(to, quantity, termsVersionHash, termsSupply, royaltyReceiver, royaltyBps);
    }
}

contract RevertingReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejected");
    }
}

contract NexPassEditionTest is Test {
    event EditionMinted(
        address indexed to,
        uint256 indexed firstTokenId,
        uint256 quantity,
        bytes32 indexed termsVersionHash,
        uint256 termsSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    );

    NexPassEdition internal edition;
    MintControllerMock internal controller;

    address internal constant OWNER = address(0xA11CE);
    address internal constant ALICE = address(0xB0B);
    address internal constant BOB = address(0xB0B1);
    address internal constant ROYALTY_RECEIVER_V1 = address(0xCAFE);
    address internal constant ROYALTY_RECEIVER_V2 = address(0xD00D);
    bytes32 internal constant EDITION_ID = keccak256("nexstudio:founding:01");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("nexstudio:founding:artwork");
    bytes32 internal constant TERMS_V1 = keccak256("nexstudio:founding:terms:v1");
    bytes32 internal constant TERMS_V2 = keccak256("nexstudio:founding:terms:v2");
    uint32 internal constant ABSOLUTE_SUPPLY_CAP = 5;
    uint256 internal constant TERMS_V1_SUPPLY = 3;
    uint256 internal constant TERMS_V2_SUPPLY = 5;

    function setUp() public {
        controller = new MintControllerMock();
        edition = new NexPassEdition(_config(ABSOLUTE_SUPPLY_CAP));

        vm.prank(OWNER);
        edition.setMintController(address(controller));
    }

    function _config(uint32 absoluteSupplyCap) internal pure returns (NexPassEdition.EditionConfig memory) {
        return NexPassEdition.EditionConfig({
            name: "NexStudio Founding Pass",
            symbol: "NEXPASS",
            initialOwner: OWNER,
            editionId: EDITION_ID,
            absoluteSupplyCap: absoluteSupplyCap,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://nexstudio-metadata/"
        });
    }

    function testPermanentIdentityHasNoCollectionRoyalty() public view {
        assertEq(edition.owner(), OWNER);
        assertEq(edition.editionId(), EDITION_ID);
        assertEq(edition.artworkCommitment(), ARTWORK_COMMITMENT);
        assertEq(edition.absoluteSupplyCap(), ABSOLUTE_SUPPLY_CAP);
        assertEq(edition.baseTokenURI(), "ipfs://nexstudio-metadata/");
        assertEq(edition.mintController(), address(controller));

        (address receiver, uint256 amount) = edition.royaltyInfo(1, 1 ether);
        assertEq(receiver, address(0));
        assertEq(amount, 0);
    }

    function testMintBindsActiveTermsVersionAndAssignsSerials() public {
        vm.expectEmit(true, true, true, true, address(edition));
        emit EditionMinted(ALICE, 1, 2, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        uint256 first = controller.mintEdition(edition, ALICE, 2, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        assertEq(first, 1);
        assertEq(edition.totalMinted(), 2);
        assertEq(edition.remainingAbsoluteSupply(), 3);
        assertEq(edition.remainingTermsSupply(TERMS_V1_SUPPLY), 1);
        assertEq(edition.ownerOf(1), ALICE);
        assertEq(edition.ownerOf(2), ALICE);
        assertEq(edition.termsVersionHashOf(1), TERMS_V1);
        assertEq(edition.termsVersionHashOf(2), TERMS_V1);
        (address receiver, uint256 amount) = edition.royaltyInfo(1, 1 ether);
        assertEq(receiver, ROYALTY_RECEIVER_V1);
        assertEq(amount, 0.05 ether);
        assertEq(edition.tokenURI(1), "ipfs://nexstudio-metadata/1");
        assertTrue(edition.isMintOpen(TERMS_V1_SUPPLY));
    }

    function testMintRejectsMissingTermsVersion() public {
        vm.expectRevert(NexPassEdition.TermsVersionRequired.selector);
        controller.mintEdition(edition, ALICE, 1, bytes32(0), TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);
    }

    function testOnlyControllerCanMint() public {
        vm.expectRevert(NexPassEdition.NotMintController.selector);
        edition.mint(ALICE, 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);
    }

    function testControllerMustBeContractAndCannotBeReset() public {
        NexPassEdition unconfigured = new NexPassEdition(_config(ABSOLUTE_SUPPLY_CAP));
        assertFalse(unconfigured.isMintOpen(TERMS_V1_SUPPLY));

        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerRequired.selector);
        unconfigured.setMintController(address(0));

        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerMustBeContract.selector);
        unconfigured.setMintController(address(0x1234));

        vm.prank(OWNER);
        unconfigured.setMintController(address(controller));
        assertTrue(unconfigured.isMintOpen(TERMS_V1_SUPPLY));

        MintControllerMock replacement = new MintControllerMock();
        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerAlreadySet.selector);
        unconfigured.setMintController(address(replacement));
    }

    function testSupplyCapMakesEditionUnavailable() public {
        controller.mintEdition(edition, ALICE, ABSOLUTE_SUPPLY_CAP, TERMS_V2, TERMS_V2_SUPPLY, ROYALTY_RECEIVER_V2, 300);
        assertEq(edition.totalMinted(), ABSOLUTE_SUPPLY_CAP);
        assertEq(edition.remainingAbsoluteSupply(), 0);
        assertFalse(edition.isMintOpen(TERMS_V2_SUPPLY));

        vm.expectRevert(NexPassEdition.SoldOut.selector);
        controller.mintEdition(edition, ALICE, 1, TERMS_V2, TERMS_V2_SUPPLY, ROYALTY_RECEIVER_V2, 300);
    }

    function testZeroQuantityAndZeroAddressPaths() public {
        vm.expectRevert(NexPassEdition.ZeroQuantity.selector);
        controller.mintEdition(edition, ALICE, 0, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        vm.expectRevert(NexPassEdition.AddressRequired.selector);
        controller.mintEdition(edition, address(0), 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);
    }

    function testReceiverRevertDoesNotConsumeSerial() public {
        RevertingReceiver receiver = new RevertingReceiver();

        vm.expectRevert();
        controller.mintEdition(edition, address(receiver), 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        assertEq(edition.totalMinted(), 0);
        assertEq(edition.remainingAbsoluteSupply(), ABSOLUTE_SUPPLY_CAP);
        assertTrue(edition.isMintOpen(TERMS_V1_SUPPLY));
    }

    function testPauseStopsMintButNotOwnerTransfers() public {
        controller.mintEdition(edition, ALICE, 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        vm.prank(OWNER);
        edition.pause();

        assertFalse(edition.isMintOpen(TERMS_V1_SUPPLY));
        vm.expectRevert();
        controller.mintEdition(edition, ALICE, 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(edition.ownerOf(1), BOB);
    }

    function testRoyaltyBounds() public {
        vm.expectRevert(NexPassEdition.InvalidRoyalty.selector);
        controller.mintEdition(edition, ALICE, 1, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 501);

        vm.expectRevert(NexPassEdition.RoyaltyReceiverRequired.selector);
        controller.mintEdition(edition, ALICE, 1, TERMS_V1, TERMS_V1_SUPPLY, address(0), 0);
    }

    function testFuzzSerialContinuity(uint256 quantity) public {
        quantity = bound(quantity, 1, TERMS_V1_SUPPLY);
        controller.mintEdition(edition, ALICE, quantity, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        for (uint256 tokenId = 1; tokenId <= quantity; ++tokenId) {
            assertEq(edition.ownerOf(tokenId), ALICE);
            assertEq(edition.termsVersionHashOf(tokenId), TERMS_V1);
        }
        assertEq(edition.totalMinted(), quantity);
        assertEq(edition.remainingAbsoluteSupply(), ABSOLUTE_SUPPLY_CAP - quantity);
        assertEq(edition.remainingTermsSupply(TERMS_V1_SUPPLY), TERMS_V1_SUPPLY - quantity);
    }

    function testTermsV1ToV2UpdatesSupplyAndSnapshotsRoyalty() public {
        controller.mintEdition(edition, ALICE, 2, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);
        controller.mintEdition(edition, ALICE, 2, TERMS_V2, TERMS_V2_SUPPLY, ROYALTY_RECEIVER_V2, 300);

        assertEq(edition.totalMinted(), 4);
        assertEq(edition.termsVersionHashOf(1), TERMS_V1);
        assertEq(edition.termsVersionHashOf(2), TERMS_V1);
        assertEq(edition.termsVersionHashOf(3), TERMS_V2);
        assertEq(edition.termsVersionHashOf(4), TERMS_V2);

        (address receiverV1, uint256 amountV1) = edition.royaltyInfo(1, 1 ether);
        (address receiverV2, uint256 amountV2) = edition.royaltyInfo(3, 1 ether);
        assertEq(receiverV1, ROYALTY_RECEIVER_V1);
        assertEq(amountV1, 0.05 ether);
        assertEq(receiverV2, ROYALTY_RECEIVER_V2);
        assertEq(amountV2, 0.03 ether);

        assertFalse(edition.isMintOpen(TERMS_V1_SUPPLY));
        assertTrue(edition.isMintOpen(TERMS_V2_SUPPLY));
    }

    function testActiveTermsSupplyCannotExceedAbsoluteCap() public {
        vm.expectRevert(NexPassEdition.InvalidTermsSupply.selector);
        controller.mintEdition(edition, ALICE, 1, TERMS_V2, ABSOLUTE_SUPPLY_CAP + 1, ROYALTY_RECEIVER_V2, 300);

        assertFalse(edition.isMintOpen(ABSOLUTE_SUPPLY_CAP + 1));
    }

    function testActiveTermsSupplyIsEnforcedAcrossVersions() public {
        controller.mintEdition(edition, ALICE, 2, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);

        vm.expectRevert(NexPassEdition.TermsSupplyExceeded.selector);
        controller.mintEdition(edition, ALICE, 2, TERMS_V1, TERMS_V1_SUPPLY, ROYALTY_RECEIVER_V1, 500);
    }
}
