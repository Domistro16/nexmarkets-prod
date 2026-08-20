// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

contract MockUSDGTest is Test {
    MockUSDG internal token;
    address internal constant OWNER = address(0xA11CE);
    address internal constant ALICE = address(0xB0B);

    function setUp() public {
        vm.prank(OWNER);
        token = new MockUSDG(OWNER);
    }

    function testMetadataAndDecimals() public view {
        assertEq(token.name(), "Mock USDG");
        assertEq(token.symbol(), "USDG");
        assertEq(token.decimals(), 6);
    }

    function testOwnerCanMintAndAllowanceTransferWork() public {
        vm.prank(OWNER);
        token.mint(ALICE, 1_000_000);
        assertEq(token.balanceOf(ALICE), 1_000_000);
        vm.prank(ALICE);
        token.approve(OWNER, 250_000);
        vm.prank(OWNER);
        token.transferFrom(ALICE, OWNER, 250_000);
        assertEq(token.balanceOf(ALICE), 750_000);
        assertEq(token.balanceOf(OWNER), 250_000);
    }

    function testNonOwnerAndZeroMintFail() public {
        vm.prank(ALICE);
        vm.expectRevert();
        token.mint(ALICE, 1);
        vm.prank(OWNER);
        vm.expectRevert(MockUSDG.FaucetAmountRequired.selector);
        token.mint(ALICE, 0);
    }
}
