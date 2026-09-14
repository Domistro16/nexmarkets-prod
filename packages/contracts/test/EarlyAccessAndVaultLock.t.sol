// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";
import {NexTBAResolver} from "../src/NexTBAResolver.sol";
import {ERC6551Registry} from "../src/erc6551/ERC6551Registry.sol";
import {IERC6551Executable} from "../src/erc6551/IERC6551.sol";
import {NexPassAccount} from "../src/erc6551/NexPassAccount.sol";

contract EAUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mirrors NexListingRegistry's lock surface so listing state can be driven
///      directly without standing up Seaport in a unit test.
contract ListingLockStub {
    mapping(address => mapping(uint256 => bytes32)) internal _active;
    mapping(bytes32 => bool) internal _live;
    bool public reverting;

    function setListed(address edition, uint256 tokenId, bool listed) external {
        bytes32 orderHash = keccak256(abi.encode(edition, tokenId));
        if (listed) {
            _active[edition][tokenId] = orderHash;
            _live[orderHash] = true;
        } else {
            delete _active[edition][tokenId];
            _live[orderHash] = false;
        }
    }

    /// @dev An order still recorded against the Pass but no longer executable.
    function setExpired(address edition, uint256 tokenId) external {
        bytes32 orderHash = keccak256(abi.encode(edition, tokenId));
        _active[edition][tokenId] = orderHash;
        _live[orderHash] = false;
    }

    function setReverting(bool value) external {
        reverting = value;
    }

    function activeListingFor(address edition, uint256 tokenId) external view returns (bytes32) {
        if (reverting) revert("listing oracle down");
        return _active[edition][tokenId];
    }

    function isListingActive(bytes32 orderHash) external view returns (bool) {
        if (reverting) revert("listing oracle down");
        return _live[orderHash];
    }
}

/// @title Early Access allowance, allowlist binding and Pass Vault listing lock
/// @notice Covers the NexMarkets certification cases that the pre-fix protocol
///         could not enforce: a per-wallet Early Access cap, an allowlist proof
///         that cannot be replayed onto another Edition, and a Pass Vault that
///         cannot be drained while the Pass has an executable listing.
contract EarlyAccessAndVaultLockTest is Test {
    EAUSDG internal usdg;
    NexLaunchRegistry internal registry;
    NexMintController internal controller;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    NexPassEdition internal otherEdition;
    ERC6551Registry internal erc6551;
    NexPassAccount internal implementation;
    NexTBAResolver internal resolver;
    ListingLockStub internal listingLock;

    address internal constant ALICE = address(0xA11CE); // Builder
    address internal constant BOB = address(0xB0B); // eligible holder
    address internal constant CHARLIE = address(0xC4A511E); // ineligible wallet
    address internal constant FEE_RECIPIENT = address(0xFEE);

    uint256 internal constant PRICE = 1_000_000; // 1 USDG (6dp)
    uint32 internal constant SUPPLY = 2000;
    uint256 internal constant EARLY_ALLOCATION = 500;
    uint256 internal constant PER_WALLET = 2;

    bytes32 internal bobLeaf;
    bytes32 internal otherLeaf;
    bytes32 internal allowlistRoot;

    function setUp() public {
        usdg = new EAUSDG();
        registry = new NexLaunchRegistry(address(this), address(usdg));
        controller = new NexMintController(address(this), registry, usdg, FEE_RECIPIENT);
        factory = new NexPassFactory(address(this), address(this), registry, controller);
        registry.setFactory(address(factory));

        vm.prank(ALICE);
        edition = NexPassEdition(factory.createEdition(_config("Baldies", keccak256("baldies")), keccak256("s1")));
        vm.prank(ALICE);
        otherEdition =
            NexPassEdition(factory.createEdition(_config("Other", keccak256("other")), keccak256("s2")));

        listingLock = new ListingLockStub();
        erc6551 = new ERC6551Registry();
        implementation = new NexPassAccount(address(listingLock));
        resolver = new NexTBAResolver(
            factory, erc6551, address(implementation), address(erc6551).codehash, address(implementation).codehash
        );

        for (uint256 i; i < 3; ++i) {
            address who = i == 0 ? BOB : (i == 1 ? CHARLIE : ALICE);
            usdg.mint(who, 10_000 * PRICE);
            vm.prank(who);
            usdg.approve(address(controller), type(uint256).max);
        }

        // Two-leaf allowlist: Bob is eligible for exactly PER_WALLET, Charlie is not on it.
        bobLeaf = controller.allowlistLeaf(address(edition), BOB, PER_WALLET);
        otherLeaf = controller.allowlistLeaf(address(edition), address(0xDEAD), PER_WALLET);
        allowlistRoot = _pair(bobLeaf, otherLeaf);
    }

    // --------------------------------------------------------------------
    // Section 7 - Early Access certification case
    // --------------------------------------------------------------------

    function testEarlyAccessPerWalletAllowanceIsEnforcedOnChain() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();
        vm.warp(mintStartsAt);

        bytes32[] memory proof = _proof(otherLeaf);

        // Mint #1 and #2 succeed.
        vm.prank(BOB);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:1"), PER_WALLET, proof);
        vm.prank(BOB);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:2"), PER_WALLET, proof);
        assertEq(controller.allowlistWalletMinted(address(edition), termsHash, BOB), 2);
        assertEq(controller.allowlistRemaining(address(edition), termsHash, BOB, PER_WALLET), 0);

        // Mint #3 must revert. This is the case the pre-fix protocol allowed.
        vm.prank(BOB);
        vm.expectRevert(NexMintController.WalletAllowanceExceeded.selector);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:3"), PER_WALLET, proof);

        assertEq(edition.totalMinted(), 2);
    }

    function testEarlyAccessBatchCannotStraddleTheWalletCap() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();
        vm.warp(mintStartsAt);

        // A single oversized batch must not bypass the per-wallet cap either.
        vm.prank(BOB);
        vm.expectRevert(NexMintController.WalletAllowanceExceeded.selector);
        controller.mintAllowlisted(_request(termsHash, BOB, 3, "bob:batch"), PER_WALLET, _proof(otherLeaf));
        assertEq(edition.totalMinted(), 0);
    }

    function testIneligibleWalletCannotMintEvenCallingTheContractDirectly() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();
        vm.warp(mintStartsAt);

        // Charlie is not in the tree. No proof he can construct verifies.
        vm.prank(CHARLIE);
        vm.expectRevert(NexMintController.NotAllowlisted.selector);
        controller.mintAllowlisted(_request(termsHash, CHARLIE, 1, "charlie:1"), PER_WALLET, _proof(otherLeaf));

        // Reusing Bob's proof does not help: the leaf binds msg.sender.
        vm.prank(CHARLIE);
        vm.expectRevert(NexMintController.NotAllowlisted.selector);
        controller.mintAllowlisted(_request(termsHash, CHARLIE, 1, "charlie:2"), PER_WALLET, _proof(bobLeaf));

        // Public mint is not open yet, so the public entrypoint is closed too.
        vm.prank(CHARLIE);
        vm.expectRevert(NexMintController.MintClosed.selector);
        controller.mint(_request(termsHash, CHARLIE, 1, "charlie:3"));
    }

    function testWalletCannotInflateItsOwnAllowance() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();
        vm.warp(mintStartsAt);

        // Bob claims a larger allowance than his leaf commits. The proof fails.
        vm.prank(BOB);
        vm.expectRevert(NexMintController.NotAllowlisted.selector);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:inflate"), 500, _proof(otherLeaf));
    }

    function testUnusedEarlyAccessAllocationRollsIntoPublicSupply() public {
        (bytes32 termsHash, uint64 mintStartsAt, uint64 allowlistEndsAt) = _publishEarlyAccess();
        vm.warp(mintStartsAt);

        vm.prank(BOB);
        controller.mintAllowlisted(_request(termsHash, BOB, 2, "bob:ea"), PER_WALLET, _proof(otherLeaf));
        uint256 earlyMinted = controller.allowlistMinted(address(edition), termsHash);
        assertEq(earlyMinted, 2);

        // Public phase opens automatically on time, with no Builder transaction.
        vm.warp(allowlistEndsAt);
        assertFalse(registry.isAllowlistMintOpen(address(edition), termsHash));
        assertTrue(registry.isPublicMintOpen(address(edition), termsHash));

        // Remaining public supply is the full Edition supply less what was minted,
        // not supply less the unused Early Access allocation.
        assertEq(SUPPLY - edition.totalMinted(), SUPPLY - earlyMinted);

        vm.prank(CHARLIE);
        controller.mint(_request(termsHash, CHARLIE, 1, "charlie:public"));
        assertEq(edition.ownerOf(3), CHARLIE);
    }

    function testEarlyAccessAllocationCapStillBinds() public {
        // Bob's leaf allows 5, but the Edition only allocates 2 to Early Access.
        bytes32 leaf = controller.allowlistLeaf(address(edition), BOB, 5);
        bytes32 root = _pair(leaf, otherLeaf);
        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        vm.prank(ALICE);
        bytes32 termsHash = registry.publishTerms(address(edition), _earlyAccessTerms(root, 2, 0, previewStartsAt));
        vm.warp(mintStartsAt);

        vm.prank(BOB);
        vm.expectRevert(NexMintController.AllowlistSupplyExceeded.selector);
        controller.mintAllowlisted(_request(termsHash, BOB, 3, "bob:overalloc"), 5, _proof(otherLeaf));

        // Exactly the allocation is fine.
        vm.prank(BOB);
        controller.mintAllowlisted(_request(termsHash, BOB, 2, "bob:exact"), 5, _proof(otherLeaf));
        assertEq(controller.allowlistMinted(address(edition), termsHash), 2);
    }

    // --------------------------------------------------------------------
    // Section 8 - allowlist proof binding
    // --------------------------------------------------------------------

    function testAllowlistProofCannotBeReplayedOntoAnotherEdition() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();

        // The Builder reuses the very same allowlist root on a second Edition.
        vm.prank(ALICE);
        bytes32 otherTermsHash = registry.publishTerms(
            address(otherEdition), _earlyAccessTerms(allowlistRoot, EARLY_ALLOCATION, PER_WALLET, uint64(block.timestamp))
        );
        vm.warp(mintStartsAt);

        // Bob's proof is valid against the root but bound to the first Edition.
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(otherEdition),
            termsVersionHash: otherTermsHash,
            recipient: BOB,
            quantity: 1,
            intentId: keccak256("bob:replay"),
            referralHint: address(0),
            advantageConfigs: new NexAdvantageRegistry.AdvantageConfig[](0)
        });
        vm.prank(BOB);
        vm.expectRevert(NexMintController.NotAllowlisted.selector);
        controller.mintAllowlisted(request, PER_WALLET, _proof(otherLeaf));

        // The proof still works on the Edition it was issued for.
        vm.prank(BOB);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:ok"), PER_WALLET, _proof(otherLeaf));
        assertEq(edition.ownerOf(1), BOB);
    }

    function testZeroAllowanceIsRejected() public {
        (bytes32 termsHash, uint64 mintStartsAt,) = _publishEarlyAccess();
        vm.warp(mintStartsAt);
        vm.prank(BOB);
        vm.expectRevert(NexMintController.WalletAllowanceRequired.selector);
        controller.mintAllowlisted(_request(termsHash, BOB, 1, "bob:zero"), 0, _proof(otherLeaf));
    }

    // --------------------------------------------------------------------
    // Section 20 - Pass Vault listing lock
    // --------------------------------------------------------------------

    function testVaultCannotBeDrainedWhileListed() public {
        (address tba, uint256 tokenId) = _mintPassWithVault(400 * PRICE);

        // Unlisted: the holder controls the Vault normally.
        vm.prank(BOB);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (BOB, 100 * PRICE)), 0
        );
        assertEq(usdg.balanceOf(tba), 300 * PRICE);

        // Listed: the Vault is value-locked.
        listingLock.setListed(address(edition), tokenId, true);
        assertTrue(NexPassAccount(payable(tba)).isVaultLocked());
        vm.prank(BOB);
        vm.expectRevert(NexPassAccount.PassVaultLockedWhileListed.selector);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (BOB, 300 * PRICE)), 0
        );
        assertEq(usdg.balanceOf(tba), 300 * PRICE);

        // Deposits are never blocked - a buyer must be able to receive value.
        usdg.mint(tba, 50 * PRICE);
        assertEq(usdg.balanceOf(tba), 350 * PRICE);

        // Delisting restores control.
        listingLock.setListed(address(edition), tokenId, false);
        assertFalse(NexPassAccount(payable(tba)).isVaultLocked());
        vm.prank(BOB);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (BOB, 350 * PRICE)), 0
        );
        assertEq(usdg.balanceOf(tba), 0);
    }

    function testListedPassSignatureAuthorityIsAlsoLocked() public {
        (address tba, uint256 tokenId) = _mintPassWithVault(10 * PRICE);
        bytes32 digest = keccak256("order");

        assertEq(NexPassAccount(payable(tba)).isValidSigner(BOB, ""), bytes4(0x523e3260));
        listingLock.setListed(address(edition), tokenId, true);
        assertEq(NexPassAccount(payable(tba)).isValidSigner(BOB, ""), bytes4(0));
        assertEq(NexPassAccount(payable(tba)).isValidSignature(digest, ""), bytes4(0));
    }

    function testExpiredListingDoesNotPermanentlyLockTheVault() public {
        (address tba, uint256 tokenId) = _mintPassWithVault(10 * PRICE);

        // An order remains recorded but is no longer executable.
        listingLock.setExpired(address(edition), tokenId);
        assertFalse(NexPassAccount(payable(tba)).isVaultLocked());
        vm.prank(BOB);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (BOB, 10 * PRICE)), 0
        );
        assertEq(usdg.balanceOf(tba), 0);
    }

    function testLockFailsClosedWhenListingAuthorityIsUnreadable() public {
        (address tba, uint256 tokenId) = _mintPassWithVault(10 * PRICE);
        listingLock.setListed(address(edition), tokenId, true);
        listingLock.setReverting(true);

        // activeListingFor itself reverts, so the account cannot prove a listing
        // exists and must not brick a Pass that may never have been listed.
        assertFalse(NexPassAccount(payable(tba)).isVaultLocked());
    }

    function testVaultFollowsThePassOnTransfer() public {
        (address tba, uint256 tokenId) = _mintPassWithVault(400 * PRICE);

        vm.prank(BOB);
        edition.transferFrom(BOB, CHARLIE, tokenId);

        // Same Vault address, same contents, new controller.
        assertEq(resolver.account(address(edition), tokenId), tba);
        assertEq(usdg.balanceOf(tba), 400 * PRICE);
        assertEq(NexPassAccount(payable(tba)).owner(), CHARLIE);

        // The old owner has no authority over the Vault.
        vm.prank(BOB);
        vm.expectRevert(NexPassAccount.InvalidSigner.selector);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (BOB, 400 * PRICE)), 0
        );

        // The new owner does.
        vm.prank(CHARLIE);
        IERC6551Executable(payable(tba)).execute(
            address(usdg), 0, abi.encodeCall(ERC20.transfer, (CHARLIE, 400 * PRICE)), 0
        );
        assertEq(usdg.balanceOf(CHARLIE), 10_000 * PRICE + 400 * PRICE);
    }

    // --------------------------------------------------------------------
    // Section 36 - invariants
    // --------------------------------------------------------------------

    /// forge-config: default.fuzz.runs = 20000
    function testFuzzWalletEarlyMintsNeverExceedAllowance(uint8 allowanceRaw, uint8 attemptsRaw, uint8 qtyRaw) public {
        uint256 allowance = uint256(bound(allowanceRaw, 1, 10));
        uint256 attempts = uint256(bound(attemptsRaw, 1, 8));
        uint256 qty = uint256(bound(qtyRaw, 1, 4));

        bytes32 leaf = controller.allowlistLeaf(address(edition), BOB, allowance);
        bytes32 root = _pair(leaf, otherLeaf);
        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        vm.prank(ALICE);
        bytes32 termsHash =
            registry.publishTerms(address(edition), _earlyAccessTerms(root, 0, 0, previewStartsAt));
        vm.warp(mintStartsAt);

        bytes32[] memory proof = _proof(otherLeaf);
        for (uint256 i; i < attempts; ++i) {
            vm.prank(BOB);
            try controller.mintAllowlisted(
                _request(termsHash, BOB, qty, bytes32(i)), allowance, proof
            ) {} catch {}
            assertLe(controller.allowlistWalletMinted(address(edition), termsHash, BOB), allowance);
            assertLe(edition.totalMinted(), SUPPLY);
        }
    }

    /// forge-config: default.fuzz.runs = 20000
    function testFuzzEarlyAccessPhaseNeverExceedsAllocation(uint8 allocationRaw, uint8 qtyRaw) public {
        uint256 allocation = uint256(bound(allocationRaw, 1, 12));
        uint256 qty = uint256(bound(qtyRaw, 1, 5));
        uint256 allowance = 100;

        bytes32 leaf = controller.allowlistLeaf(address(edition), BOB, allowance);
        bytes32 root = _pair(leaf, otherLeaf);
        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        vm.prank(ALICE);
        bytes32 termsHash =
            registry.publishTerms(address(edition), _earlyAccessTerms(root, allocation, 0, previewStartsAt));
        vm.warp(mintStartsAt);

        bytes32[] memory proof = _proof(otherLeaf);
        for (uint256 i; i < 6; ++i) {
            vm.prank(BOB);
            try controller.mintAllowlisted(
                _request(termsHash, BOB, qty, bytes32(i)), allowance, proof
            ) {} catch {}
            assertLe(controller.allowlistMinted(address(edition), termsHash), allocation);
            assertLe(edition.totalMinted(), SUPPLY);
        }
    }

    // --------------------------------------------------------------------
    // helpers
    // --------------------------------------------------------------------

    function _config(string memory name, bytes32 editionId)
        internal
        pure
        returns (NexPassEdition.EditionConfig memory)
    {
        return NexPassEdition.EditionConfig({
            name: name,
            symbol: "NEXPASS",
            initialOwner: ALICE,
            editionId: editionId,
            absoluteSupplyCap: SUPPLY,
            artworkCommitment: keccak256(abi.encode(editionId, "artwork")),
            baseTokenURI: "ipfs://nexmarkets/"
        });
    }

    function _earlyAccessTerms(bytes32 root, uint256 allocation, uint256 perWallet, uint64 previewStartsAt)
        internal
        pure
        returns (NexLaunchRegistry.Terms memory)
    {
        uint64 mintStartsAt = previewStartsAt + 1 days;
        bool hasAllowlist = root != bytes32(0);
        return NexLaunchRegistry.Terms({
            activeSupply: SUPPLY,
            pricePerPass: PRICE,
            previewStartsAt: previewStartsAt,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 30 days,
            allowlistRoot: root,
            allowlistEndsAt: hasAllowlist ? mintStartsAt + 1 days : 0,
            allowlistSupply: hasAllowlist ? allocation : 0,
            walletAllowance: hasAllowlist ? perWallet : 0,
            primaryRecipient: ALICE,
            royaltyReceiver: ALICE,
            royaltyBps: 500,
            advantagesHash: bytes32(0),
            referralTermsHash: bytes32(0)
        });
    }

    function _publishEarlyAccess() internal returns (bytes32 termsHash, uint64 mintStartsAt, uint64 allowlistEndsAt) {
        return _publishEarlyAccessWithAllocation(EARLY_ALLOCATION, PER_WALLET);
    }

    function _publishEarlyAccessWithAllocation(uint256 allocation, uint256 perWallet)
        internal
        returns (bytes32 termsHash, uint64 mintStartsAt, uint64 allowlistEndsAt)
    {
        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        allowlistEndsAt = mintStartsAt + 1 days;
        vm.prank(ALICE);
        termsHash = registry.publishTerms(
            address(edition), _earlyAccessTerms(allowlistRoot, allocation, perWallet, previewStartsAt)
        );
    }

    function _republish(bytes32 root, uint256 allocation, uint256 perWallet, uint64 from) internal {
        vm.warp(from - 1 days);
        vm.prank(ALICE);
        registry.publishTerms(address(edition), _earlyAccessTerms(root, allocation, perWallet, uint64(block.timestamp)));
    }

    function _request(bytes32 termsHash, address recipient, uint256 quantity, bytes32 intentId)
        internal
        view
        returns (NexMintController.MintRequest memory)
    {
        return NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: recipient,
            quantity: quantity,
            intentId: intentId,
            referralHint: address(0),
            advantageConfigs: new NexAdvantageRegistry.AdvantageConfig[](0)
        });
    }

    function _mintPassWithVault(uint256 vaultAmount) internal returns (address tba, uint256 tokenId) {
        uint64 previewStartsAt = uint64(block.timestamp);
        uint64 mintStartsAt = previewStartsAt + 1 days;
        vm.prank(ALICE);
        bytes32 termsHash =
            registry.publishTerms(address(edition), _earlyAccessTerms(bytes32(0), 0, 0, previewStartsAt));
        vm.warp(mintStartsAt);
        vm.prank(BOB);
        tokenId = controller.mint(_request(termsHash, BOB, 1, keccak256("vault:mint")));
        tba = resolver.createAccount(address(edition), tokenId);
        usdg.mint(tba, vaultAmount);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _proof(bytes32 sibling) internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](1);
        proof[0] = sibling;
    }
}
