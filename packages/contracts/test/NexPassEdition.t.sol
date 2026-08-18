// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";

contract MintControllerMock {
    function mintEdition(NexPassEdition edition, address to, uint256 quantity, bytes32 termsVersionHash)
        external
        returns (uint256 firstTokenId)
    {
        return edition.mint(to, quantity, termsVersionHash);
    }
}

contract RevertingReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejected");
    }
}

contract NexPassEditionTest is Test {
    event EditionMinted(
        address indexed to, uint256 indexed firstTokenId, uint256 quantity, bytes32 indexed termsVersionHash
    );

    NexPassEdition internal edition;
    MintControllerMock internal controller;

    address internal constant OWNER = address(0xA11CE);
    address internal constant ALICE = address(0xB0B);
    address internal constant BOB = address(0xB0B1);
    address internal constant ROYALTY_RECEIVER = address(0xCAFE);
    bytes32 internal constant EDITION_ID = keccak256("nexstudio:founding:01");
    bytes32 internal constant ARTWORK_COMMITMENT = keccak256("nexstudio:founding:artwork");
    bytes32 internal constant TERMS_V1 = keccak256("nexstudio:founding:terms:v1");
    uint32 internal constant SUPPLY = 3;

    function setUp() public {
        controller = new MintControllerMock();
        edition = new NexPassEdition(_config(SUPPLY, 300));

        vm.prank(OWNER);
        edition.setMintController(address(controller));
    }

    function _config(uint32 supply, uint96 royaltyBps) internal pure returns (NexPassEdition.EditionConfig memory) {
        return NexPassEdition.EditionConfig({
            name: "NexStudio Founding Pass",
            symbol: "NEXPASS",
            initialOwner: OWNER,
            editionId: EDITION_ID,
            maxSupply: supply,
            royaltyReceiver: ROYALTY_RECEIVER,
            royaltyBps: royaltyBps,
            artworkCommitment: ARTWORK_COMMITMENT,
            baseTokenURI: "ipfs://nexstudio-metadata/"
        });
    }

    function testPermanentIdentityAndRoyalty() public view {
        assertEq(edition.owner(), OWNER);
        assertEq(edition.editionId(), EDITION_ID);
        assertEq(edition.artworkCommitment(), ARTWORK_COMMITMENT);
        assertEq(edition.maxSupply(), SUPPLY);
        assertEq(edition.baseTokenURI(), "ipfs://nexstudio-metadata/");
        assertEq(edition.mintController(), address(controller));

        (address receiver, uint256 amount) = edition.royaltyInfo(1, 1 ether);
        assertEq(receiver, ROYALTY_RECEIVER);
        assertEq(amount, 0.03 ether);
    }

    function testMintBindsActiveTermsVersionAndAssignsSerials() public {
        vm.expectEmit(true, true, true, true, address(edition));
        emit EditionMinted(ALICE, 1, 2, TERMS_V1);

        uint256 first = controller.mintEdition(edition, ALICE, 2, TERMS_V1);

        assertEq(first, 1);
        assertEq(edition.totalMinted(), 2);
        assertEq(edition.remainingSupply(), 1);
        assertEq(edition.ownerOf(1), ALICE);
        assertEq(edition.ownerOf(2), ALICE);
        assertEq(edition.tokenURI(1), "ipfs://nexstudio-metadata/1");
        assertTrue(edition.isMintOpen());
    }

    function testMintRejectsMissingTermsVersion() public {
        vm.expectRevert(NexPassEdition.TermsVersionRequired.selector);
        controller.mintEdition(edition, ALICE, 1, bytes32(0));
    }

    function testOnlyControllerCanMint() public {
        vm.expectRevert(NexPassEdition.NotMintController.selector);
        edition.mint(ALICE, 1, TERMS_V1);
    }

    function testControllerMustBeContractAndCannotBeReset() public {
        NexPassEdition unconfigured = new NexPassEdition(_config(SUPPLY, 0));
        assertFalse(unconfigured.isMintOpen());

        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerRequired.selector);
        unconfigured.setMintController(address(0));

        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerMustBeContract.selector);
        unconfigured.setMintController(address(0x1234));

        vm.prank(OWNER);
        unconfigured.setMintController(address(controller));
        assertTrue(unconfigured.isMintOpen());

        MintControllerMock replacement = new MintControllerMock();
        vm.prank(OWNER);
        vm.expectRevert(NexPassEdition.MintControllerAlreadySet.selector);
        unconfigured.setMintController(address(replacement));
    }

    function testSupplyCapMakesEditionUnavailable() public {
        controller.mintEdition(edition, ALICE, SUPPLY, TERMS_V1);
        assertEq(edition.totalMinted(), SUPPLY);
        assertEq(edition.remainingSupply(), 0);
        assertFalse(edition.isMintOpen());

        vm.expectRevert(NexPassEdition.SoldOut.selector);
        controller.mintEdition(edition, ALICE, 1, TERMS_V1);
    }

    function testZeroQuantityAndZeroAddressPaths() public {
        vm.expectRevert(NexPassEdition.ZeroQuantity.selector);
        controller.mintEdition(edition, ALICE, 0, TERMS_V1);

        vm.expectRevert(NexPassEdition.AddressRequired.selector);
        controller.mintEdition(edition, address(0), 1, TERMS_V1);
    }

    function testReceiverRevertDoesNotConsumeSerial() public {
        RevertingReceiver receiver = new RevertingReceiver();

        vm.expectRevert();
        controller.mintEdition(edition, address(receiver), 1, TERMS_V1);

        assertEq(edition.totalMinted(), 0);
        assertEq(edition.remainingSupply(), SUPPLY);
        assertTrue(edition.isMintOpen());
    }

    function testPauseStopsMintButNotOwnerTransfers() public {
        controller.mintEdition(edition, ALICE, 1, TERMS_V1);

        vm.prank(OWNER);
        edition.pause();

        assertFalse(edition.isMintOpen());
        vm.expectRevert();
        controller.mintEdition(edition, ALICE, 1, TERMS_V1);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(edition.ownerOf(1), BOB);
    }

    function testRoyaltyBounds() public {
        vm.expectRevert(NexPassEdition.InvalidRoyalty.selector);
        new NexPassEdition(_config(SUPPLY, 501));
    }

    function testFuzzSerialContinuity(uint256 quantity) public {
        quantity = bound(quantity, 1, SUPPLY);
        controller.mintEdition(edition, ALICE, quantity, TERMS_V1);

        for (uint256 tokenId = 1; tokenId <= quantity; ++tokenId) {
            assertEq(edition.ownerOf(tokenId), ALICE);
        }
        assertEq(edition.totalMinted(), quantity);
        assertEq(edition.remainingSupply(), SUPPLY - quantity);
    }
}
