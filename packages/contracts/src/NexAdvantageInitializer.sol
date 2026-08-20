// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {NexAdvantageRegistry} from "./NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";

interface INexMintControllerInitializerView {
    function owner() external view returns (address);
    function launchRegistry() external view returns (address);
}

/// @title NexAdvantageInitializer
/// @notice Atomic bridge between a successful primary mint and exact-Pass utility state.
/// @dev Only the permanently wired MintController may invoke initialization.
///      The AdvantageRegistry independently verifies every token's historical
///      Terms hash and canonical ADVANTAGES_DOMAIN commitment.
contract NexAdvantageInitializer is Ownable {
    NexAdvantageRegistry public immutable advantageRegistry;
    NexLaunchRegistry public immutable launchRegistry;
    address public immutable mintController;

    error AddressRequired();
    error AdvantagesRequired();
    error InvalidWiring();
    error NotMintController();

    event MintAdvantagesInitialized(
        address indexed edition,
        uint256 indexed firstTokenId,
        uint256 quantity,
        bytes32 indexed termsVersionHash,
        bytes32 advantagesHash
    );

    constructor(
        address initialOwner,
        NexLaunchRegistry launchRegistry_,
        NexAdvantageRegistry advantageRegistry_,
        address mintController_
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) || address(launchRegistry_) == address(0)
                || address(advantageRegistry_) == address(0) || mintController_ == address(0)
        ) revert AddressRequired();
        if (
            address(launchRegistry_).code.length == 0 || address(advantageRegistry_).code.length == 0
                || mintController_.code.length == 0
        ) revert AddressRequired();
        if (
            launchRegistry_.owner() != initialOwner || advantageRegistry_.owner() != initialOwner
                || address(advantageRegistry_.launchRegistry()) != address(launchRegistry_)
        ) revert InvalidWiring();
        try INexMintControllerInitializerView(mintController_).owner() returns (address controllerOwner) {
            if (controllerOwner != initialOwner) revert InvalidWiring();
        } catch {
            revert InvalidWiring();
        }
        try INexMintControllerInitializerView(mintController_).launchRegistry() returns (address registry_) {
            if (registry_ != address(launchRegistry_)) revert InvalidWiring();
        } catch {
            revert InvalidWiring();
        }
        launchRegistry = launchRegistry_;
        advantageRegistry = advantageRegistry_;
        mintController = mintController_;
    }

    function initializeMint(
        address edition,
        uint256 firstTokenId,
        uint256 quantity,
        bytes32 termsVersionHash,
        NexAdvantageRegistry.AdvantageConfig[] calldata configs
    ) external {
        if (msg.sender != mintController) revert NotMintController();
        if (edition == address(0) || firstTokenId == 0 || quantity == 0) revert AddressRequired();

        NexLaunchRegistry.Terms memory terms = launchRegistry.termsOf(edition, termsVersionHash);
        if (
            terms.advantagesHash == bytes32(0) || configs.length == 0
                || advantageRegistry.hashAdvantages(configs) != terms.advantagesHash
        ) revert AdvantagesRequired();

        for (uint256 i; i < quantity; ++i) {
            advantageRegistry.initializePass(edition, firstTokenId + i, termsVersionHash, terms.advantagesHash, configs);
        }
        emit MintAdvantagesInitialized(edition, firstTokenId, quantity, termsVersionHash, terms.advantagesHash);
    }
}
