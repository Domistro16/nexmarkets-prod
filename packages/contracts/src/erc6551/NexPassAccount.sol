// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC6551Account, IERC6551Executable} from "./IERC6551.sol";

/// @notice Minimal read surface of the canonical listing authority.
interface INexPassVaultListingLock {
    function activeListingFor(address edition, uint256 tokenId) external view returns (bytes32);
    function isListingActive(bytes32 orderHash) external view returns (bool);
}

/// @title NexPassAccount
/// @notice Source-pinned ERC-6551 account capability for a NexPass.
/// @dev Behavior follows the official v0.3.1 simple reference account pinned at
///      erc6551/reference commit 43a84573bb47b0df3ab543a20365f4974f56a809, with
///      one NexMarkets invariant added: while the exact Pass has an executable
///      listing, the Pass Vault is value-locked so a seller cannot remove value
///      out from under a buyer mid-sale. Deposits are never blocked; only
///      owner-authorized outbound authority is.
///      Control always resolves from ERC-721 ownerOf; this account stores no
///      NexMarkets Terms, serial, Advantage, or royalty authority.
contract NexPassAccount is IERC165, IERC1271, IERC6551Account, IERC6551Executable {
    uint256 public state;

    /// @notice Canonical listing authority consulted for the Vault value lock.
    address public immutable listingRegistry;

    error InvalidOperation();
    error InvalidSigner();
    error ListingRegistryRequired();
    error PassVaultLockedWhileListed();

    constructor(address listingRegistry_) {
        if (listingRegistry_ == address(0) || listingRegistry_.code.length == 0) revert ListingRegistryRequired();
        listingRegistry = listingRegistry_;
    }

    receive() external payable {}

    /// @notice Whether the Vault is currently value-locked by an executable listing.
    /// @dev Auto-clears on cancel, sale, expiry or seller transfer because the
    ///      listing authority is the single source of truth. A Pass from a token
    ///      contract the listing authority does not track is never locked.
    function isVaultLocked() public view returns (bool) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid || tokenContract == address(0)) return false;
        try INexPassVaultListingLock(listingRegistry).activeListingFor(tokenContract, tokenId) returns (
            bytes32 orderHash
        ) {
            if (orderHash == bytes32(0)) return false;
            // A listing is known to exist. Fail closed if liveness cannot be read.
            try INexPassVaultListingLock(listingRegistry).isListingActive(orderHash) returns (bool active) {
                return active;
            } catch {
                return true;
            }
        } catch {
            return false;
        }
    }

    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result)
    {
        if (msg.sender != owner()) revert InvalidSigner();
        if (operation != 0) revert InvalidOperation();
        if (isVaultLocked()) revert PassVaultLockedWhileListed();
        ++state;
        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        if (isVaultLocked()) return bytes4(0);
        return signer == owner() ? IERC6551Account.isValidSigner.selector : bytes4(0);
    }

    /// @dev Also gated by the Vault lock so a listed Pass cannot authorize an
    ///      offchain order that moves Vault value before settlement.
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        if (isVaultLocked()) return bytes4(0);
        return
            SignatureChecker.isValidSignatureNow(owner(), hash, signature)
                ? IERC1271.isValidSignature.selector
                : bytes4(0);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId || interfaceId == type(IERC1271).interfaceId;
    }

    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(0x60);
        assembly {
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid || tokenContract.code.length == 0) return address(0);
        try IERC721(tokenContract).ownerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner;
        } catch {
            return address(0);
        }
    }
}
