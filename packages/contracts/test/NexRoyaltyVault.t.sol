// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexRoyaltyVault} from "../src/NexRoyaltyVault.sol";

contract VaultMockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RoyaltyListingRegistryMock {
    NexRoyaltyVault public immutable royaltyVault;
    address public immutable owner;

    constructor(NexRoyaltyVault royaltyVault_, address owner_) {
        royaltyVault = royaltyVault_;
        owner = owner_;
    }

    function record(bytes32 orderHash, address edition, uint256 tokenId, address builder, uint256 amount) external {
        royaltyVault.recordRoyalty(orderHash, edition, tokenId, builder, amount);
    }
}

contract MiswiredRoyaltyListingRegistry {
    function royaltyVault() external pure returns (address) {
        return address(0x1111);
    }

    function owner() external pure returns (address) {
        return address(0x2222);
    }
}

contract RoyaltyEditionMock {}

contract NexRoyaltyVaultTest is Test {
    VaultMockUSDG internal usdg;
    NexRoyaltyVault internal vault;
    RoyaltyListingRegistryMock internal listingRegistry;
    RoyaltyEditionMock internal edition;

    address internal constant OWNER = address(0xA11CE);
    address internal constant BUILDER = address(0xB011D);
    uint256 internal constant ROYALTY = 100_000;

    function setUp() public {
        usdg = new VaultMockUSDG();
        vault = new NexRoyaltyVault(OWNER, usdg);
        listingRegistry = new RoyaltyListingRegistryMock(vault, OWNER);
        edition = new RoyaltyEditionMock();

        vm.prank(OWNER);
        vault.setListingRegistry(address(listingRegistry));
    }

    function testRoyaltyUnlocksAtExactlyThirtyDaysAndCannotWithdrawTwice() public {
        bytes32 orderHash = keccak256("vault:order:one");
        usdg.mint(address(vault), ROYALTY);
        listingRegistry.record(orderHash, address(edition), 7, BUILDER, ROYALTY);

        NexRoyaltyVault.RoyaltyClaim memory claim = vault.claimInfo(orderHash);
        assertEq(claim.edition, address(edition));
        assertEq(claim.tokenId, 7);
        assertEq(claim.builder, BUILDER);
        assertEq(claim.amount, ROYALTY);
        assertEq(claim.releaseAt, block.timestamp + 30 days);
        assertFalse(claim.withdrawn);
        assertEq(vault.totalOutstanding(), ROYALTY);

        vm.warp(claim.releaseAt - 1);
        vm.prank(BUILDER);
        vm.expectRevert(NexRoyaltyVault.RoyaltyStillLocked.selector);
        vault.withdraw(orderHash);

        vm.warp(claim.releaseAt);
        vm.prank(address(0xBAD));
        vm.expectRevert(NexRoyaltyVault.NotBuilder.selector);
        vault.withdraw(orderHash);

        vm.prank(BUILDER);
        vault.withdraw(orderHash);
        assertEq(usdg.balanceOf(BUILDER), ROYALTY);
        assertEq(vault.totalOutstanding(), 0);
        assertTrue(vault.claimInfo(orderHash).withdrawn);

        vm.prank(BUILDER);
        vm.expectRevert(NexRoyaltyVault.RoyaltyAlreadyWithdrawn.selector);
        vault.withdraw(orderHash);
    }

    function testDuplicateRoyaltyRecordingFails() public {
        bytes32 orderHash = keccak256("vault:duplicate");
        usdg.mint(address(vault), 2 * ROYALTY);
        listingRegistry.record(orderHash, address(edition), 1, BUILDER, ROYALTY);

        vm.expectRevert(NexRoyaltyVault.RoyaltyAlreadyRecorded.selector);
        listingRegistry.record(orderHash, address(edition), 1, BUILDER, ROYALTY);
    }

    function testRecordingRequiresPermanentlyBoundRegistryAndBacking() public {
        bytes32 orderHash = keccak256("vault:backing");
        vm.expectRevert(NexRoyaltyVault.NotListingRegistry.selector);
        vault.recordRoyalty(orderHash, address(edition), 1, BUILDER, ROYALTY);

        vm.expectRevert(NexRoyaltyVault.InsufficientBacking.selector);
        listingRegistry.record(orderHash, address(edition), 1, BUILDER, ROYALTY);

        NexRoyaltyVault fresh = new NexRoyaltyVault(OWNER, usdg);
        MiswiredRoyaltyListingRegistry wrong = new MiswiredRoyaltyListingRegistry();
        vm.prank(OWNER);
        vm.expectRevert(NexRoyaltyVault.ListingRegistryWiringMismatch.selector);
        fresh.setListingRegistry(address(wrong));
        assertEq(fresh.listingRegistry(), address(0));
    }
}
