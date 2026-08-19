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
        uint32 absoluteSupplyCap;
        bytes32 artworkCommitment;
        string baseTokenURI;
    }

    bytes32 public immutable editionId;
    bytes32 public immutable artworkCommitment;
    /// @notice Immutable upper bound for all serials and committed artwork in this Edition.
    uint32 public immutable absoluteSupplyCap;

    address public mintController;

    string private _baseTokenURI;
    uint256 private _totalMinted;
    uint256 private _nextTokenId = 1;
    mapping(uint256 => bytes32) private _termsVersionHashByToken;

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
    error RoyaltyReceiverRequired();
    error SoldOut();
    error TermsSupplyExceeded();
    error TermsVersionRequired();
    error ZeroQuantity();
    error InvalidTermsSupply();

    event EditionConfigured(bytes32 indexed editionId, bytes32 indexed artworkCommitment, uint32 absoluteSupplyCap);
    event MintControllerSet(address indexed controller);
    event EditionMinted(
        address indexed to,
        uint256 indexed firstTokenId,
        uint256 quantity,
        bytes32 indexed termsVersionHash,
        uint256 termsSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    );

    modifier onlyMintController() {
        if (msg.sender != mintController) revert NotMintController();
        _;
    }

    constructor(EditionConfig memory config) ERC721(config.name, config.symbol) Ownable(config.initialOwner) {
        if (config.initialOwner == address(0)) revert AddressRequired();
        if (config.editionId == bytes32(0)) revert EditionIdRequired();
        if (config.artworkCommitment == bytes32(0)) revert ArtworkCommitmentRequired();
        if (config.absoluteSupplyCap == 0) revert InvalidSupply();
        if (bytes(config.baseTokenURI).length == 0) revert BaseURIRequired();

        editionId = config.editionId;
        artworkCommitment = config.artworkCommitment;
        absoluteSupplyCap = config.absoluteSupplyCap;
        _baseTokenURI = config.baseTokenURI;

        emit EditionConfigured(config.editionId, config.artworkCommitment, config.absoluteSupplyCap);
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

    /// @notice Mint the next serials from a controller-validated Terms snapshot.
    /// @param termsVersionHash The active, approved Terms version in NexLaunchRegistry.
    /// @param termsSupply The currently advertised supply for this Terms version.
    /// @param royaltyReceiver Builder Royalty recipient from this Terms version.
    /// @param royaltyBps Builder Royalty rate from this Terms version, capped at 5%.
    function mint(
        address to,
        uint256 quantity,
        bytes32 termsVersionHash,
        uint256 termsSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external onlyMintController whenNotPaused nonReentrant returns (uint256 firstTokenId) {
        return _mintWithTerms(to, quantity, termsVersionHash, termsSupply, royaltyReceiver, royaltyBps);
    }

    function _mintWithTerms(
        address to,
        uint256 quantity,
        bytes32 termsVersionHash,
        uint256 termsSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    ) internal returns (uint256 firstTokenId) {
        if (to == address(0)) revert AddressRequired();
        if (quantity == 0) revert ZeroQuantity();
        if (termsVersionHash == bytes32(0)) revert TermsVersionRequired();
        if (termsSupply == 0 || termsSupply > absoluteSupplyCap) revert InvalidTermsSupply();
        if (royaltyReceiver == address(0)) revert RoyaltyReceiverRequired();
        if (royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty();

        uint256 minted = _totalMinted;
        if (quantity > absoluteSupplyCap - minted) revert SoldOut();
        if (termsSupply <= minted || quantity > termsSupply - minted) revert TermsSupplyExceeded();

        firstTokenId = _nextTokenId;
        for (uint256 i; i < quantity; ++i) {
            _termsVersionHashByToken[_nextTokenId] = termsVersionHash;
            _setTokenRoyalty(_nextTokenId, royaltyReceiver, royaltyBps);
            _safeMint(to, _nextTokenId);
            unchecked {
                ++_nextTokenId;
            }
        }

        _totalMinted = minted + quantity;
        emit EditionMinted(to, firstTokenId, quantity, termsVersionHash, termsSupply, royaltyReceiver, royaltyBps);
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

    function remainingAbsoluteSupply() external view returns (uint256) {
        return absoluteSupplyCap - _totalMinted;
    }

    /// @notice Return the remaining room under an active Terms version's advertised supply.
    function remainingTermsSupply(uint256 termsSupply) external view returns (uint256) {
        if (termsSupply <= _totalMinted) return 0;
        return termsSupply - _totalMinted;
    }

    /// @notice Whether the edition is available for the supplied active Terms version.
    /// @dev NexLaunchRegistry owns Preview/time windows; NexMintController must
    ///      validate the supplied Terms snapshot before calling mint.
    function isMintOpen(uint256 termsSupply) external view returns (bool) {
        return !paused() && mintController != address(0) && termsSupply > _totalMinted
            && termsSupply <= absoluteSupplyCap && _totalMinted < absoluteSupplyCap;
    }

    /// @notice Return the immutable Terms version bound to a minted serial.
    function termsVersionHashOf(uint256 tokenId) external view returns (bytes32) {
        _requireOwned(tokenId);
        return _termsVersionHashByToken[tokenId];
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
