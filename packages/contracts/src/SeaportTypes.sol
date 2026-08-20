// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Seaport's item type values. These values are part of Seaport's
///      canonical ABI and are intentionally kept local so NexMarkets does not
///      fork or deploy Seaport source code.
enum SeaportItemType {
    NATIVE,
    ERC20,
    ERC721,
    ERC1155,
    ERC721_WITH_CRITERIA,
    ERC1155_WITH_CRITERIA
}

struct SeaportSpentItem {
    SeaportItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
}

struct SeaportReceivedItem {
    SeaportItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
    address payable recipient;
}

/// @dev Exact Seaport 1.6 ZoneParameters ABI layout.
struct SeaportZoneParameters {
    bytes32 orderHash;
    address fulfiller;
    address offerer;
    SeaportSpentItem[] offer;
    SeaportReceivedItem[] consideration;
    bytes extraData;
    bytes32[] orderHashes;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
}

struct SeaportSchema {
    uint256 id;
    bytes metadata;
}

interface INexSeaportZone {
    function authorizeOrder(SeaportZoneParameters calldata zoneParameters)
        external
        returns (bytes4 authorizedOrderMagicValue);

    function validateOrder(SeaportZoneParameters calldata zoneParameters) external returns (bytes4 validOrderMagicValue);

    function getSeaportMetadata() external view returns (string memory name, SeaportSchema[] memory schemas);

    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
