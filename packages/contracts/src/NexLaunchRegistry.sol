// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface INexPassEditionLaunchView {
    function owner() external view returns (address);
    function editionId() external view returns (bytes32);
    function absoluteSupplyCap() external view returns (uint32);
    function totalMinted() external view returns (uint256);
}

/// @title NexLaunchRegistry
/// @notice Canonical versioned Terms and Preview authority for NexPass Editions.
/// @dev Every material launch change gets a new hash and a fresh Preview window.
///      The Registry never mints and never moves USDG.
contract NexLaunchRegistry is Ownable, Pausable {
    uint96 public constant MAX_ROYALTY_BPS = 500;
    uint64 public constant MIN_PREVIEW_DURATION = 1 days;
    bytes32 public constant TERMS_DOMAIN = keccak256("NEXMARKETS_LAUNCH_TERMS_V1");

    struct Terms {
        uint256 activeSupply;
        uint256 pricePerPass;
        uint64 previewStartsAt;
        uint64 mintStartsAt;
        uint64 mintEndsAt;
        address primaryRecipient;
        address royaltyReceiver;
        uint96 royaltyBps;
        bytes32 advantagesHash;
        bytes32 referralTermsHash;
    }

    struct EditionRecord {
        bytes32 editionId;
        uint32 absoluteSupplyCap;
        address publisher;
        bytes32 activeTermsVersionHash;
        uint64 nextTermsVersion;
        bool registered;
        bool disabled;
    }

    mapping(address => EditionRecord) private _editions;
    mapping(address => mapping(bytes32 => Terms)) private _termsByHash;
    address public factory;
    address public immutable settlementToken;

    error ActiveSupplyBelowMinted();
    error AddressRequired();
    error EditionAlreadyRegistered();
    error EditionDisabled();
    error EditionNotRegistered();
    error FactoryAlreadySet();
    error FactoryRequired();
    error InvalidMintWindow();
    error InvalidPreviewWindow();
    error InvalidRoyalty();
    error InvalidSupply();
    error InvalidTermsVersion();
    error NotEditionPublisher();
    error NotFactory();
    error PreviewMustRestart();
    error TermsPriceRequired();
    error TermsVersionNotFound();

    event FactorySet(address indexed factory);
    event EditionRegistered(
        address indexed edition,
        bytes32 indexed editionId,
        address indexed publisher,
        uint32 absoluteSupplyCap
    );
    event EditionPublisherSet(address indexed edition, address indexed publisher);
    event EditionDisabledSet(address indexed edition, bool disabled);
    event TermsPublished(
        address indexed edition,
        bytes32 indexed termsVersionHash,
        uint64 indexed version,
        uint256 activeSupply,
        uint256 pricePerPass,
        uint64 previewStartsAt,
        uint64 mintStartsAt,
        uint64 mintEndsAt,
        address primaryRecipient,
        address royaltyReceiver,
        uint96 royaltyBps,
        bytes32 advantagesHash,
        bytes32 referralTermsHash
    );

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyEditionPublisher(address edition) {
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        if (record.disabled) revert EditionDisabled();
        if (msg.sender != record.publisher && msg.sender != owner()) revert NotEditionPublisher();
        _;
    }

    constructor(address initialOwner, address settlementToken_) Ownable(initialOwner) {
        if (settlementToken_ == address(0)) revert AddressRequired();
        if (settlementToken_.code.length == 0) revert AddressRequired();
        settlementToken = settlementToken_;
    }

    /// @notice Bind the one Factory that may register permanent Editions.
    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0) || factory_.code.length == 0) revert FactoryRequired();
        factory = factory_;
        emit FactorySet(factory_);
    }

    function registerEdition(address edition, address publisher) external onlyFactory {
        if (edition == address(0) || publisher == address(0)) revert AddressRequired();
        if (edition.code.length == 0) revert AddressRequired();
        EditionRecord storage record = _editions[edition];
        if (record.registered) revert EditionAlreadyRegistered();

        INexPassEditionLaunchView deployedEdition = INexPassEditionLaunchView(edition);
        bytes32 editionId = deployedEdition.editionId();
        uint32 absoluteSupplyCap = deployedEdition.absoluteSupplyCap();
        if (editionId == bytes32(0) || absoluteSupplyCap == 0 || deployedEdition.owner() != owner()) {
            revert InvalidSupply();
        }

        record.editionId = editionId;
        record.absoluteSupplyCap = absoluteSupplyCap;
        record.publisher = publisher;
        record.registered = true;
        emit EditionRegistered(edition, editionId, publisher, absoluteSupplyCap);
    }

    function setEditionPublisher(address edition, address publisher) external onlyOwner {
        if (publisher == address(0)) revert AddressRequired();
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        record.publisher = publisher;
        emit EditionPublisherSet(edition, publisher);
    }

    function setEditionDisabled(address edition, bool disabled) external onlyOwner {
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        record.disabled = disabled;
        emit EditionDisabledSet(edition, disabled);
    }

    /// @notice Publish a new immutable Terms version and restart Preview.
    function publishTerms(
        address edition,
        Terms calldata terms
    ) external whenNotPaused onlyEditionPublisher(edition) returns (bytes32 termsVersionHash) {
        EditionRecord storage record = _editions[edition];
        _validateTerms(edition, record, terms);

        uint64 version = record.nextTermsVersion + 1;
        if (version == 0) revert InvalidTermsVersion();
        termsVersionHash = hashTerms(edition, record.editionId, version, terms);
        if (_termsByHash[edition][termsVersionHash].activeSupply != 0) revert InvalidTermsVersion();

        _termsByHash[edition][termsVersionHash] = terms;
        record.nextTermsVersion = version;
        record.activeTermsVersionHash = termsVersionHash;

        emit TermsPublished(
            edition,
            termsVersionHash,
            version,
            terms.activeSupply,
            terms.pricePerPass,
            terms.previewStartsAt,
            terms.mintStartsAt,
            terms.mintEndsAt,
            terms.primaryRecipient,
            terms.royaltyReceiver,
            terms.royaltyBps,
            terms.advantagesHash,
            terms.referralTermsHash
        );
    }

    function hashTerms(
        address edition,
        bytes32 editionId,
        uint64 version,
        Terms calldata terms
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TERMS_DOMAIN,
                edition,
                editionId,
                version,
                terms.activeSupply,
                terms.pricePerPass,
                terms.previewStartsAt,
                terms.mintStartsAt,
                terms.mintEndsAt,
                terms.primaryRecipient,
                terms.royaltyReceiver,
                terms.royaltyBps,
                terms.advantagesHash,
                terms.referralTermsHash
            )
        );
    }

    function editionInfo(address edition) external view returns (EditionRecord memory) {
        return _editions[edition];
    }

    function isRegisteredEdition(address edition) external view returns (bool) {
        return _editions[edition].registered;
    }

    function activeTerms(address edition) external view returns (bytes32 termsVersionHash, Terms memory terms) {
        EditionRecord storage record = _editions[edition];
        if (!record.registered) revert EditionNotRegistered();
        termsVersionHash = record.activeTermsVersionHash;
        if (termsVersionHash == bytes32(0)) return (termsVersionHash, terms);
        terms = _termsByHash[edition][termsVersionHash];
    }

    function termsOf(address edition, bytes32 termsVersionHash) external view returns (Terms memory) {
        if (!_editions[edition].registered) revert EditionNotRegistered();
        Terms memory terms = _termsByHash[edition][termsVersionHash];
        if (terms.activeSupply == 0) revert TermsVersionNotFound();
        return terms;
    }

    function isPreviewOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (paused()) return false;
        EditionRecord storage record = _editions[edition];
        if (!record.registered || record.disabled || record.activeTermsVersionHash != termsVersionHash) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        return terms.activeSupply != 0 && block.timestamp >= terms.previewStartsAt && block.timestamp < terms.mintStartsAt;
    }

    function isMintOpen(address edition, bytes32 termsVersionHash) external view returns (bool) {
        if (paused()) return false;
        EditionRecord storage record = _editions[edition];
        if (!record.registered || record.disabled || record.activeTermsVersionHash != termsVersionHash) return false;
        Terms storage terms = _termsByHash[edition][termsVersionHash];
        if (terms.activeSupply == 0 || block.timestamp < terms.mintStartsAt || block.timestamp >= terms.mintEndsAt) {
            return false;
        }
        return INexPassEditionLaunchView(edition).totalMinted() < terms.activeSupply;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateTerms(address edition, EditionRecord storage record, Terms calldata terms) internal view {
        if (terms.activeSupply == 0 || terms.activeSupply > record.absoluteSupplyCap) revert InvalidSupply();
        if (terms.pricePerPass == 0) revert TermsPriceRequired();
        if (terms.primaryRecipient == address(0)) revert AddressRequired();
        if (terms.royaltyReceiver == address(0) || terms.royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty();
        if (terms.previewStartsAt < block.timestamp) revert PreviewMustRestart();
        if (terms.mintStartsAt < terms.previewStartsAt || terms.mintStartsAt - terms.previewStartsAt < MIN_PREVIEW_DURATION) {
            revert InvalidPreviewWindow();
        }
        if (terms.mintEndsAt <= terms.mintStartsAt) revert InvalidMintWindow();
        if (terms.activeSupply < INexPassEditionLaunchView(edition).totalMinted()) {
            revert ActiveSupplyBelowMinted();
        }
    }
}
