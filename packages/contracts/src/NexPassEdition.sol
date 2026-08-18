// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NexPassEdition
/// @notice Permanent collection identity and serial ownership for one NexMarkets Pass edition.
/// @dev Terms, Preview state, payment collection, mint intent, Advantages,
///      listings, and royalty settlement belong to the separately gated
///      NexMarkets registries and controllers. The mint controller supplies the
///      approved Terms version for every mint.
contract NexPassEdition is ERC721, ERC2981, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    uint96 public constant MAX_ROYALTY_BPS = 500;

    struct EditionConfig {
        string name;
        string symbol;
        address initialOwner;
        bytes32 editionId;
        uint32 maxSupply;
        address royaltyReceiver;
        uint96 royaltyBps;
        bytes32 artworkCommitment;
        string baseTokenURI;
    }

    bytes32 public immutable editionId;
    bytes32 public immutable artworkCommitment;
    uint32 public immutable maxSupply;

    address public mintController;

    string private _baseTokenURI;
    uint256 private _totalMinted;
    uint256 private _nextTokenId = 1;

    error AddressRequired();
    error ArtworkCommitmentRequired();
    error BaseURIRequired();
    error EditionIdRequired();
    error InvalidRoyalty();
    error InvalidSupply();
    error MintControllerAlreadySet();
    error MintControllerRequired();
    error MintControllerMustBeContract();
    error NotMintController();
    error SoldOut();
    error TermsVersionRequired();
    error ZeroQuantity();

    event EditionConfigured(
        bytes32 indexed editionId,
        bytes32 indexed artworkCommitment,
        uint32 maxSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    );
    event MintControllerSet(address indexed controller);
    event EditionMinted(
        address indexed to, uint256 indexed firstTokenId, uint256 quantity, bytes32 indexed termsVersionHash
    );

    modifier onlyMintController() {
        if (msg.sender != mintController) revert NotMintController();
        _;
    }

    constructor(EditionConfig memory config) ERC721(config.name, config.symbol) Ownable(config.initialOwner) {
        if (config.initialOwner == address(0) || config.royaltyReceiver == address(0)) {
            revert AddressRequired();
        }
        if (config.editionId == bytes32(0)) revert EditionIdRequired();
        if (config.artworkCommitment == bytes32(0)) revert ArtworkCommitmentRequired();
        if (config.maxSupply == 0) revert InvalidSupply();
        if (config.royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty();
        if (bytes(config.baseTokenURI).length == 0) revert BaseURIRequired();

        editionId = config.editionId;
        artworkCommitment = config.artworkCommitment;
        maxSupply = config.maxSupply;
        _baseTokenURI = config.baseTokenURI;

        _setDefaultRoyalty(config.royaltyReceiver, config.royaltyBps);

        emit EditionConfigured(
            config.editionId, config.artworkCommitment, config.maxSupply, config.royaltyReceiver, config.royaltyBps
        );
    }

    /// @notice Set the controller once, after the edition and controller are deployed.
    /// @dev The Protocol Admin Safe owns this handoff in production.
    function setMintController(address controller) external onlyOwner {
        if (controller == address(0)) revert MintControllerRequired();
        if (mintController != address(0)) revert MintControllerAlreadySet();
        if (controller.code.length == 0) revert MintControllerMustBeContract();

        mintController = controller;
        emit MintControllerSet(controller);
    }

    /// @notice Mint the next serials after the controller validates payment and Terms.
    /// @param termsVersionHash The active, approved Terms version in NexLaunchRegistry.
    function mint(address to, uint256 quantity, bytes32 termsVersionHash)
        external
        onlyMintController
        whenNotPaused
        nonReentrant
        returns (uint256 firstTokenId)
    {
        return _mintWithTerms(to, quantity, termsVersionHash);
    }

    function _mintWithTerms(address to, uint256 quantity, bytes32 termsVersionHash)
        internal
        returns (uint256 firstTokenId)
    {
        if (to == address(0)) revert AddressRequired();
        if (quantity == 0) revert ZeroQuantity();
        if (termsVersionHash == bytes32(0)) revert TermsVersionRequired();

        uint256 minted = _totalMinted;
        if (quantity > maxSupply - minted) revert SoldOut();

        firstTokenId = _nextTokenId;
        for (uint256 i; i < quantity; ++i) {
            _safeMint(to, _nextTokenId);
            unchecked {
                ++_nextTokenId;
            }
        }

        _totalMinted = minted + quantity;
        emit EditionMinted(to, firstTokenId, quantity, termsVersionHash);
    }

    /// @notice Pause controller minting without freezing existing ownership transfers.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function totalMinted() external view returns (uint256) {
        return _totalMinted;
    }

    function remainingSupply() external view returns (uint256) {
        return maxSupply - _totalMinted;
    }

    /// @notice Whether the edition is available to its controller for a valid launch mint.
    /// @dev Preview and time-window decisions remain in NexLaunchRegistry.
    function isMintOpen() external view returns (bool) {
        return !paused() && mintController != address(0) && _totalMinted < maxSupply;
    }

    function baseTokenURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
