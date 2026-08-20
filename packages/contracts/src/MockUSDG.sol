// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDG
/// @notice Testnet-only USDG-shaped settlement token for NexMarkets certification.
/// @dev This contract is intentionally not referenced by the Robinhood mainnet
///      deployment planner. It has no proxy or upgrade path and cannot be used
///      as a substitute for canonical production USDG.
contract MockUSDG is ERC20, Ownable {
    error FaucetAmountRequired();

    constructor(address initialOwner) ERC20("Mock USDG", "USDG") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints certification funds to a testnet wallet.
    /// @dev Owner-controlled issuance is acceptable only on the isolated testnet.
    function mint(address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert FaucetAmountRequired();
        _mint(to, amount);
    }
}
