// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";
import {NexMintController} from "./NexMintController.sol";
import {NexPassEdition} from "./NexPassEdition.sol";

/// @title NexPassFactory
/// @notice Safe-controlled deterministic deployment and wiring for Editions.
/// @dev The Factory temporarily owns a new Edition so the controller handoff is
///      atomic; final Edition ownership is always transferred to protocolAdmin.
contract NexPassFactory is Ownable {
    NexLaunchRegistry public immutable launchRegistry;
    NexMintController public immutable mintController;
    address public immutable protocolAdmin;

    mapping(bytes32 => address) public editionForId;
    mapping(address => bool) public isFactoryEdition;

    error AddressRequired();
    error EditionAlreadyCreated();
    error EditionOwnerMismatch();
    error FactoryWiringMismatch();

    event EditionCreated(
        address indexed edition,
        bytes32 indexed editionId,
        address indexed publisher,
        bytes32 salt,
        address protocolAdmin,
        address mintController,
        uint32 absoluteSupplyCap,
        bytes32 artworkCommitment
    );

    constructor(
        address initialOwner,
        address protocolAdmin_,
        NexLaunchRegistry launchRegistry_,
        NexMintController mintController_
    ) Ownable(initialOwner) {
        if (initialOwner == address(0) || protocolAdmin_ == address(0)) {
            revert AddressRequired();
        }
        if (address(launchRegistry_) == address(0) || address(mintController_) == address(0)) revert AddressRequired();
        if (address(launchRegistry_).code.length == 0 || address(mintController_).code.length == 0) {
            revert AddressRequired();
        }
        if (initialOwner != protocolAdmin_ || launchRegistry_.owner() != protocolAdmin_) {
            revert FactoryWiringMismatch();
        }
        if (address(mintController_.launchRegistry()) != address(launchRegistry_)) revert FactoryWiringMismatch();
        launchRegistry = launchRegistry_;
        mintController = mintController_;
        protocolAdmin = protocolAdmin_;
    }

    /// @notice Deploy, wire, register, and hand off one permanent Edition.
    function createEdition(NexPassEdition.EditionConfig calldata config, address publisher, bytes32 salt)
        external
        onlyOwner
        returns (address editionAddress)
    {
        if (config.initialOwner != protocolAdmin) revert EditionOwnerMismatch();
        if (editionForId[config.editionId] != address(0)) revert EditionAlreadyCreated();
        if (publisher == address(0)) revert AddressRequired();

        NexPassEdition.EditionConfig memory deployConfig = config;
        deployConfig.initialOwner = address(this);
        NexPassEdition edition = new NexPassEdition{salt: salt}(deployConfig);
        edition.setMintController(address(mintController));
        edition.transferOwnership(protocolAdmin);
        launchRegistry.registerEdition(address(edition), publisher);

        editionAddress = address(edition);
        editionForId[config.editionId] = editionAddress;
        isFactoryEdition[editionAddress] = true;
        emit EditionCreated(
            editionAddress,
            config.editionId,
            publisher,
            salt,
            protocolAdmin,
            address(mintController),
            config.absoluteSupplyCap,
            config.artworkCommitment
        );
    }

    function predictEditionAddress(NexPassEdition.EditionConfig calldata config, bytes32 salt)
        external
        view
        returns (address predicted)
    {
        NexPassEdition.EditionConfig memory deployConfig = config;
        deployConfig.initialOwner = address(this);
        bytes memory bytecode = abi.encodePacked(type(NexPassEdition).creationCode, abi.encode(deployConfig));
        bytes32 hash = keccak256(bytecode);
        predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))));
    }
}
