// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {NexPassFactory} from "./NexPassFactory.sol";
import {IERC6551Registry} from "./erc6551/IERC6551.sol";

/// @title NexTBAResolver
/// @notice Immutable adapter from an exact factory Pass to its ERC-6551 account.
/// @dev This is an attachment resolver only. All NexMarkets canonical state
///      remains in the contracts named by the authority map.
contract NexTBAResolver {
    bytes32 public constant ACCOUNT_SALT = keccak256("NEXMARKETS_PASS_TBA_V1");

    NexPassFactory public immutable passFactory;
    IERC6551Registry public immutable registry;
    address public immutable accountImplementation;
    bytes32 public immutable registryRuntimeCodeHash;
    bytes32 public immutable implementationRuntimeCodeHash;

    error InvalidCodeHash();
    error InvalidEdition();
    error InvalidPass();

    event PassAccountCreated(address indexed edition, uint256 indexed tokenId, address indexed account);

    constructor(
        NexPassFactory passFactory_,
        IERC6551Registry registry_,
        address accountImplementation_,
        bytes32 expectedRegistryRuntimeCodeHash,
        bytes32 expectedImplementationRuntimeCodeHash
    ) {
        if (
            address(passFactory_) == address(0) || address(passFactory_).code.length == 0
                || address(registry_) == address(0) || address(registry_).code.length == 0
                || accountImplementation_ == address(0) || accountImplementation_.code.length == 0
        ) revert InvalidCodeHash();
        if (
            address(registry_).codehash != expectedRegistryRuntimeCodeHash
                || accountImplementation_.codehash != expectedImplementationRuntimeCodeHash
        ) revert InvalidCodeHash();
        passFactory = passFactory_;
        registry = registry_;
        accountImplementation = accountImplementation_;
        registryRuntimeCodeHash = expectedRegistryRuntimeCodeHash;
        implementationRuntimeCodeHash = expectedImplementationRuntimeCodeHash;
    }

    function account(address edition, uint256 tokenId) public view returns (address) {
        if (!passFactory.isFactoryEdition(edition)) revert InvalidEdition();
        return registry.account(accountImplementation, ACCOUNT_SALT, block.chainid, edition, tokenId);
    }

    function createAccount(address edition, uint256 tokenId) external returns (address tba) {
        if (!passFactory.isFactoryEdition(edition)) revert InvalidEdition();
        try IERC721(edition).ownerOf(tokenId) returns (address tokenOwner) {
            if (tokenOwner == address(0)) revert InvalidPass();
        } catch {
            revert InvalidPass();
        }
        tba = registry.createAccount(accountImplementation, ACCOUNT_SALT, block.chainid, edition, tokenId);
        emit PassAccountCreated(edition, tokenId, tba);
    }
}
