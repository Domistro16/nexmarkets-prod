// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {NexListingRegistry} from "./NexListingRegistry.sol";
import {INexSeaportZone, SeaportSchema, SeaportZoneParameters} from "./SeaportTypes.sol";

/// @title NexMarketsZone
/// @notice Thin Seaport 1.6 adapter for NexListingRegistry.
/// @dev All NexMarkets listing policy remains in NexListingRegistry. This
///      contract only authenticates Seaport as caller and returns Seaport's
///      required zone magic values.
contract NexMarketsZone is Ownable, INexSeaportZone {
    NexListingRegistry public immutable listingRegistry;
    address public immutable seaport;

    error NotSeaport();

    constructor(address initialOwner, NexListingRegistry listingRegistry_, address seaport_) Ownable(initialOwner) {
        if (initialOwner == address(0) || address(listingRegistry_) == address(0) || seaport_ == address(0)) {
            revert NotSeaport();
        }
        if (
            address(listingRegistry_).code.length == 0 || seaport_.code.length == 0
                || listingRegistry_.owner() != initialOwner
        ) revert NotSeaport();
        listingRegistry = listingRegistry_;
        seaport = seaport_;
    }

    function authorizeOrder(SeaportZoneParameters calldata zoneParameters)
        external
        view
        override
        returns (bytes4 authorizedOrderMagicValue)
    {
        if (msg.sender != seaport) revert NotSeaport();
        listingRegistry.authorizeOrder(zoneParameters);
        return this.authorizeOrder.selector;
    }

    function validateOrder(SeaportZoneParameters calldata zoneParameters)
        external
        override
        returns (bytes4 validOrderMagicValue)
    {
        if (msg.sender != seaport) revert NotSeaport();
        listingRegistry.validateOrder(zoneParameters);
        return this.validateOrder.selector;
    }

    function getSeaportMetadata() external pure override returns (string memory name, SeaportSchema[] memory schemas) {
        schemas = new SeaportSchema[](0);
        return ("NexMarketsZone", schemas);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(INexSeaportZone).interfaceId || interfaceId == 0x01ffc9a7;
    }
}
