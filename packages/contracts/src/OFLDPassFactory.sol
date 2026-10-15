// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {OFLDLaunchRegistry} from "./OFLDLaunchRegistry.sol";
import {OFLDMintController} from "./OFLDMintController.sol";
import {OFLDPassEdition} from "./OFLDPassEdition.sol";

/// @title OFLDPassFactory
/// @notice Permissionless deterministic deployment and wiring for creator-owned Editions.
/// @dev The Factory temporarily owns a new Edition so the controller handoff is
///      atomic; final Edition ownership and publishing authority belong to the caller.
contract OFLDPassFactory is Ownable {
    OFLDLaunchRegistry public immutable launchRegistry;
    OFLDMintController public immutable mintController;
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
        address editionOwner,
        address mintController,
        uint32 absoluteSupplyCap,
        bytes32 artworkCommitment
    );

    constructor(
        address initialOwner,
        address protocolAdmin_,
        OFLDLaunchRegistry launchRegistry_,
        OFLDMintController mintController_
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
    function createEdition(OFLDPassEdition.EditionConfig calldata config, bytes32 salt)
        external
        returns (address editionAddress)
    {
        if (config.initialOwner != msg.sender) revert EditionOwnerMismatch();
        if (editionForId[config.editionId] != address(0)) revert EditionAlreadyCreated();

        OFLDPassEdition.EditionConfig memory deployConfig = config;
        deployConfig.initialOwner = address(this);
        OFLDPassEdition edition = new OFLDPassEdition{salt: salt}(deployConfig);
        edition.setMintController(address(mintController));
        edition.transferOwnership(msg.sender);
        launchRegistry.registerEdition(address(edition), msg.sender);

        editionAddress = address(edition);
        editionForId[config.editionId] = editionAddress;
        isFactoryEdition[editionAddress] = true;
        emit EditionCreated(
            editionAddress,
            config.editionId,
            msg.sender,
            salt,
            msg.sender,
            address(mintController),
            config.absoluteSupplyCap,
            config.artworkCommitment
        );
    }

    function predictEditionAddress(OFLDPassEdition.EditionConfig calldata config, bytes32 salt)
        external
        view
        returns (address predicted)
    {
        OFLDPassEdition.EditionConfig memory deployConfig = config;
        deployConfig.initialOwner = address(this);
        bytes memory bytecode = abi.encodePacked(type(OFLDPassEdition).creationCode, abi.encode(deployConfig));
        bytes32 hash = keccak256(bytecode);
        predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))));
    }
}
