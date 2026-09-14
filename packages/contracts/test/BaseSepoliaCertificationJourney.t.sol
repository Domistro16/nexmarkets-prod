// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {NexAdvantageInitializer} from "../src/NexAdvantageInitializer.sol";
import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {INexAdvantageListingController, NexListingRegistry} from "../src/NexListingRegistry.sol";
import {NexMarketsZone} from "../src/NexMarketsZone.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";
import {NexRoyaltyVault} from "../src/NexRoyaltyVault.sol";
import {NexTBAResolver} from "../src/NexTBAResolver.sol";
import {IERC6551Executable, IERC6551Registry} from "../src/erc6551/IERC6551.sol";
import {NexPassAccount} from "../src/erc6551/NexPassAccount.sol";

contract RewardToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract Collectible is ERC721 {
    constructor() ERC721("NexMarkets Collectible", "NEXC") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

/// @title Base Sepolia certification journey
/// @notice Runs the NexMarkets Alice/Bob/Charlie certification scenario against
///         real forked Base Sepolia state: the canonical ERC-6551 Registry, the
///         canonical Seaport 1.6 deployment and canonical Base Sepolia USDC.
///         Time-dependent phases are advanced with vm.warp because the protocol
///         enforces a one day minimum Preview window that cannot be compressed
///         on a live public testnet.
contract BaseSepoliaCertificationJourneyTest is Test {
    // Canonical Base Sepolia addresses, read from deployments/base-sepolia.v1-deployment.json.
    address internal constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant ERC6551_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address internal constant SEAPORT_16 = 0x0000000000000068F116a894984e2DB1123eB395;

    uint256 internal constant USDC_ONE = 1e6;
    uint32 internal constant SUPPLY = 2000;
    uint256 internal constant PRICE = 5 * USDC_ONE;
    uint256 internal constant EARLY_ALLOCATION = 500;
    uint256 internal constant PER_WALLET = 2;
    uint256 internal constant CREDITS = 10;

    address internal alice; // Builder
    address internal bob; // eligible holder
    address internal charlie; // ineligible wallet / secondary buyer
    address internal protocolAdmin;
    address internal feeRecipient;

    IERC20 internal usdc;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal passFactory;
    NexAdvantageRegistry internal advantageRegistry;
    NexAdvantageInitializer internal advantageInitializer;
    NexRoyaltyVault internal royaltyVault;
    NexListingRegistry internal listingRegistry;
    NexMarketsZone internal zone;
    NexPassAccount internal passAccountImpl;
    NexTBAResolver internal tbaResolver;
    NexPassEdition internal baldies;

    RewardToken internal nvdac;
    RewardToken internal nex;
    RewardToken internal op;
    Collectible internal collectible;

    bytes32 internal constant ADVANTAGE_ID = keccak256("baldies:credits");
    // Fixed at setUp so the Advantage commitment hash is stable across warps.
    uint64 internal advStartsAt;
    uint64 internal advEndsAt;
    bytes32 internal bobLeaf;
    bytes32 internal siblingLeaf;
    bytes32 internal allowlistRoot;
    bytes32 internal termsHash;
    uint64 internal mintStartsAt;
    uint64 internal allowlistEndsAt;

    address internal passVault;

    function setUp() public {
        // Skip entirely unless a fork URL is supplied.
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        assertEq(block.chainid, 84532, "must fork Base Sepolia");
        assertGt(USDC.code.length, 0, "canonical USDC must exist on the fork");
        assertGt(ERC6551_REGISTRY.code.length, 0, "canonical ERC-6551 registry must exist");
        assertGt(SEAPORT_16.code.length, 0, "canonical Seaport 1.6 must exist");

        alice = makeAddr("alice-builder");
        bob = makeAddr("bob-holder");
        charlie = makeAddr("charlie-outsider");
        protocolAdmin = makeAddr("protocol-admin");
        feeRecipient = makeAddr("protocol-fee-recipient");
        usdc = IERC20(USDC);

        _deployStack();
        _fundActors();
        _createEdition();
    }

    modifier onFork() {
        if (address(launchRegistry) == address(0)) return;
        _;
    }

    function _deployStack() internal {
        vm.startPrank(protocolAdmin);
        launchRegistry = new NexLaunchRegistry(protocolAdmin, USDC);
        mintController = new NexMintController(protocolAdmin, launchRegistry, IERC20(USDC), feeRecipient);
        passFactory = new NexPassFactory(protocolAdmin, protocolAdmin, launchRegistry, mintController);
        advantageRegistry = new NexAdvantageRegistry(protocolAdmin, launchRegistry);
        advantageInitializer =
            new NexAdvantageInitializer(protocolAdmin, launchRegistry, advantageRegistry, address(mintController));
        royaltyVault = new NexRoyaltyVault(protocolAdmin, IERC20(USDC));
        listingRegistry = new NexListingRegistry(
            protocolAdmin,
            launchRegistry,
            INexAdvantageListingController(address(advantageRegistry)),
            royaltyVault,
            feeRecipient,
            SEAPORT_16
        );
        zone = new NexMarketsZone(protocolAdmin, listingRegistry, SEAPORT_16);

        // The Pass Vault is bound to the canonical listing authority at deploy time.
        passAccountImpl = new NexPassAccount(address(listingRegistry));
        tbaResolver = new NexTBAResolver(
            passFactory,
            IERC6551Registry(ERC6551_REGISTRY),
            address(passAccountImpl),
            ERC6551_REGISTRY.codehash,
            address(passAccountImpl).codehash
        );

        launchRegistry.setFactory(address(passFactory));
        advantageRegistry.setInitializer(address(advantageInitializer));
        mintController.setAdvantageInitializer(address(advantageInitializer));
        royaltyVault.setListingRegistry(address(listingRegistry));
        listingRegistry.setZone(address(zone));
        advantageRegistry.setListingAuthority(address(listingRegistry));
        vm.stopPrank();

        nvdac = new RewardToken("Tokenized NVIDIA", "NVDAc", 18);
        nex = new RewardToken("NexMarkets Token", "NEX", 18);
        op = new RewardToken("Optimism", "OP", 18);
        collectible = new Collectible();
    }

    function _fundActors() internal {
        // Canonical Base Sepolia USDC, balance dealt on the fork rather than
        // substituting a fake settlement token.
        deal(USDC, alice, 100_000 * USDC_ONE, true);
        deal(USDC, bob, 100_000 * USDC_ONE, true);
        deal(USDC, charlie, 100_000 * USDC_ONE, true);
        assertEq(usdc.balanceOf(bob), 100_000 * USDC_ONE, "deal must work against canonical USDC");

        vm.prank(alice);
        usdc.approve(address(mintController), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(mintController), type(uint256).max);
        vm.prank(charlie);
        usdc.approve(address(mintController), type(uint256).max);
    }

    function _createEdition() internal {
        advStartsAt = uint64(block.timestamp);
        advEndsAt = uint64(block.timestamp + 365 days);
        vm.prank(alice);
        baldies = NexPassEdition(
            passFactory.createEdition(
                NexPassEdition.EditionConfig({
                    name: "Baldies",
                    symbol: "BALDIES",
                    initialOwner: alice,
                    editionId: keccak256("baldies:edition:01"),
                    absoluteSupplyCap: SUPPLY,
                    artworkCommitment: keccak256("baldies:artwork"),
                    baseTokenURI: "ipfs://baldies/"
                }),
                keccak256("baldies:salt")
            )
        );

        bobLeaf = mintController.allowlistLeaf(address(baldies), bob, PER_WALLET);
        siblingLeaf = mintController.allowlistLeaf(address(baldies), makeAddr("other-eligible"), PER_WALLET);
        allowlistRoot = bobLeaf < siblingLeaf
            ? keccak256(abi.encode(bobLeaf, siblingLeaf))
            : keccak256(abi.encode(siblingLeaf, bobLeaf));
    }

    function _advantageConfigs() internal view returns (NexAdvantageRegistry.AdvantageConfig[] memory configs) {
        configs = new NexAdvantageRegistry.AdvantageConfig[](1);
        configs[0] = NexAdvantageRegistry.AdvantageConfig({
            advantageId: ADVANTAGE_ID,
            kind: NexAdvantageRegistry.AdvantageKind.QuantityBased,
            startsAt: advStartsAt,
            endsAt: advEndsAt,
            totalUnits: CREDITS,
            definitionHash: keccak256("baldies:10-credits")
        });
    }

    function _publish() internal {
        NexAdvantageRegistry.AdvantageConfig[] memory configs = _advantageConfigs();
        uint64 previewStartsAt = uint64(block.timestamp);
        mintStartsAt = previewStartsAt + 1 days;
        allowlistEndsAt = mintStartsAt + 1 days;
        // Resolve before pranking: a nested call would otherwise consume the prank.
        bytes32 advantagesHash = advantageRegistry.hashAdvantages(configs);

        vm.prank(alice);
        termsHash = launchRegistry.publishTerms(
            address(baldies),
            NexLaunchRegistry.Terms({
                activeSupply: SUPPLY,
                pricePerPass: PRICE,
                previewStartsAt: previewStartsAt,
                mintStartsAt: mintStartsAt,
                mintEndsAt: mintStartsAt + 60 days,
                allowlistRoot: allowlistRoot,
                allowlistEndsAt: allowlistEndsAt,
                allowlistSupply: EARLY_ALLOCATION,
                walletAllowance: PER_WALLET,
                primaryRecipient: alice,
                royaltyReceiver: alice,
                royaltyBps: 500,
                advantagesHash: advantagesHash,
                referralTermsHash: bytes32(0)
            })
        );
    }

    function _proof() internal view returns (bytes32[] memory proof) {
        proof = new bytes32[](1);
        proof[0] = siblingLeaf;
    }

    function _request(address recipient, uint256 quantity, bytes32 intentId)
        internal
        view
        returns (NexMintController.MintRequest memory)
    {
        return NexMintController.MintRequest({
            edition: address(baldies),
            termsVersionHash: termsHash,
            recipient: recipient,
            quantity: quantity,
            intentId: intentId,
            referralHint: address(0),
            advantageConfigs: _advantageConfigs()
        });
    }

    // ====================================================================
    // The certification journey
    // ====================================================================

    function testCertificationJourney() public onFork {
        _stepPublishAndPreview();
        _stepEligibility();
        _stepEarlyAccess();
        _stepPublicMint();
        _stepAdvantage();
        _stepVaultDeposit();
        _stepPartialClaim();
        _stepListingLock();
        _stepSecondaryTransfer();
    }

    function _stepPublishAndPreview() internal {
        _publish();
        assertTrue(launchRegistry.isPreviewOpen(address(baldies), termsHash), "Preview must be open after publish");
        assertFalse(launchRegistry.isMintOpen(address(baldies), termsHash), "mint must not be open during Preview");
        assertFalse(launchRegistry.isAllowlistMintOpen(address(baldies), termsHash));
        assertFalse(launchRegistry.isPublicMintOpen(address(baldies), termsHash));

        (bytes32 activeHash, NexLaunchRegistry.Terms memory terms) = launchRegistry.activeTerms(address(baldies));
        assertEq(activeHash, termsHash);
        assertEq(terms.activeSupply, SUPPLY);
        assertEq(terms.pricePerPass, PRICE);
        assertEq(terms.walletAllowance, PER_WALLET);
        assertEq(terms.allowlistSupply, EARLY_ALLOCATION);
        assertEq(terms.royaltyBps, 500);
        console2.log("[1] Published Baldies. Preview open. termsVersionHash:");
        console2.logBytes32(termsHash);
    }

    function _stepEligibility() internal {
        // Mint has not opened, so nobody can mint yet.
        vm.warp(mintStartsAt - 1);
        vm.prank(bob);
        vm.expectRevert(NexMintController.MintClosed.selector);
        mintController.mintAllowlisted(_request(bob, 1, "early:too-soon"), PER_WALLET, _proof());
        console2.log("[2] Pre-mint window correctly closed to everyone.");
    }

    function _stepEarlyAccess() internal {
        vm.warp(mintStartsAt);
        assertTrue(launchRegistry.isAllowlistMintOpen(address(baldies), termsHash), "Early Access must be live");
        assertFalse(launchRegistry.isPublicMintOpen(address(baldies), termsHash), "Public must not be live yet");

        // Charlie is not on the allowlist. The contract is the final authority.
        vm.prank(charlie);
        vm.expectRevert(NexMintController.NotAllowlisted.selector);
        mintController.mintAllowlisted(_request(charlie, 1, "charlie:ea"), PER_WALLET, _proof());

        // Charlie cannot route around it through the public entrypoint either.
        vm.prank(charlie);
        vm.expectRevert(NexMintController.MintClosed.selector);
        mintController.mint(_request(charlie, 1, "charlie:ea-public"));

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 feeBefore = usdc.balanceOf(feeRecipient);

        vm.prank(bob);
        uint256 first = mintController.mintAllowlisted(_request(bob, 1, "bob:ea-1"), PER_WALLET, _proof());
        vm.prank(bob);
        uint256 second = mintController.mintAllowlisted(_request(bob, 1, "bob:ea-2"), PER_WALLET, _proof());
        assertEq(first, 1, "first serial");
        assertEq(second, 2, "second serial");
        assertEq(baldies.ownerOf(1), bob);
        assertEq(baldies.ownerOf(2), bob);

        // Third mint must be rejected by the per-wallet allowance.
        vm.prank(bob);
        vm.expectRevert(NexMintController.WalletAllowanceExceeded.selector);
        mintController.mintAllowlisted(_request(bob, 1, "bob:ea-3"), PER_WALLET, _proof());

        assertEq(controllerWalletMinted(bob), 2);
        assertEq(mintController.allowlistMinted(address(baldies), termsHash), 2);
        assertEq(baldies.totalMinted(), 2);

        // Exact settlement: 5% protocol fee, remainder to the Builder.
        uint256 paid = 2 * PRICE;
        uint256 fee = (paid * 500) / 10_000;
        assertEq(usdc.balanceOf(feeRecipient) - feeBefore, fee, "protocol fee");
        assertEq(usdc.balanceOf(alice) - aliceBefore, paid - fee, "builder primary proceeds");
        console2.log("[3] Early Access: Bob minted 2, third reverted. Serials 1 and 2.");
    }

    function _stepPublicMint() internal {
        vm.warp(allowlistEndsAt);
        assertFalse(launchRegistry.isAllowlistMintOpen(address(baldies), termsHash));
        assertTrue(launchRegistry.isPublicMintOpen(address(baldies), termsHash), "public opens with no Builder tx");

        // Only 2 of the 500 Early Access allocation were used. The unused 498
        // are not stranded: remaining public supply is total minus total minted.
        assertEq(SUPPLY - baldies.totalMinted(), SUPPLY - 2);

        vm.prank(charlie);
        uint256 serial = mintController.mint(_request(charlie, 1, "charlie:public"));
        assertEq(serial, 3);
        assertEq(baldies.ownerOf(3), charlie);
        console2.log("[4] Public Mint opened automatically. Unused allocation rolled over. Charlie holds serial 3.");
    }

    function _stepAdvantage() internal {
        assertEq(remainingCredits(1), CREDITS, "Pass #1 must start with 10 credits");

        vm.prank(bob);
        advantageRegistry.consumeQuantity(address(baldies), 1, ADVANTAGE_ID, 3, keccak256("use:1"));

        assertEq(remainingCredits(1), CREDITS - 3, "7 credits must remain");

        // Idempotent: replaying the same use ID does not double-spend.
        vm.prank(bob);
        advantageRegistry.consumeQuantity(address(baldies), 1, ADVANTAGE_ID, 3, keccak256("use:1"));
        assertEq(remainingCredits(1), CREDITS - 3, "replay must not consume again");
        console2.log("[5] Advantage: consumed 3 of 10 credits, 7 remain, replay rejected.");
    }

    function _stepVaultDeposit() internal {
        passVault = tbaResolver.createAccount(address(baldies), 1);
        assertEq(tbaResolver.account(address(baldies), 1), passVault, "TBA must be deterministic");
        assertEq(NexPassAccount(payable(passVault)).owner(), bob, "Pass owner controls the Vault");

        deal(USDC, passVault, 400 * USDC_ONE, true);
        nvdac.mint(passVault, 20 ether);
        nex.mint(passVault, 800 ether);
        op.mint(passVault, 50 ether);
        collectible.mint(passVault, 7);

        assertEq(usdc.balanceOf(passVault), 400 * USDC_ONE);
        assertEq(nvdac.balanceOf(passVault), 20 ether);
        assertEq(nex.balanceOf(passVault), 800 ether);
        assertEq(op.balanceOf(passVault), 50 ether);
        assertEq(collectible.ownerOf(7), passVault);
        console2.log("[6] Pass Vault funded with 5 distinct assets (not a fixed two-slot shape).");
    }

    function _stepPartialClaim() internal {
        // USDC 100%, NVDAc 25%, computed in base units with no floating point.
        uint256 usdcClaim = (usdc.balanceOf(passVault) * 100) / 100;
        uint256 nvdacClaim = (nvdac.balanceOf(passVault) * 25) / 100;
        assertEq(usdcClaim, 400 * USDC_ONE);
        assertEq(nvdacClaim, 5 ether);

        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        uint256 bobNvdacBefore = nvdac.balanceOf(bob);

        vm.startPrank(bob);
        IERC6551Executable(payable(passVault)).execute(
            USDC, 0, abi.encodeCall(IERC20.transfer, (bob, usdcClaim)), 0
        );
        IERC6551Executable(payable(passVault)).execute(
            address(nvdac), 0, abi.encodeCall(IERC20.transfer, (bob, nvdacClaim)), 0
        );
        vm.stopPrank();

        assertEq(usdc.balanceOf(bob) - bobUsdcBefore, 400 * USDC_ONE, "wallet receives 400 USDC");
        assertEq(nvdac.balanceOf(bob) - bobNvdacBefore, 5 ether, "wallet receives 5 NVDAc");

        // Unselected assets are untouched.
        assertEq(usdc.balanceOf(passVault), 0);
        assertEq(nvdac.balanceOf(passVault), 15 ether, "15 NVDAc retained");
        assertEq(nex.balanceOf(passVault), 800 ether, "800 NEX untouched");
        assertEq(op.balanceOf(passVault), 50 ether, "50 OP untouched");
        assertEq(collectible.ownerOf(7), passVault, "collectible untouched");
        console2.log("[7] Partial claim: +400 USDC, +5 NVDAc. Vault retains 15 NVDAc, 800 NEX, 50 OP, 1 NFT.");
    }

    function _stepListingLock() internal {
        bytes32 orderHash = keccak256("baldies:listing:1");
        // Resolve before pranking: a nested call would otherwise consume the prank.
        bytes32 passTermsHash = baldies.termsVersionHashOf(1);
        vm.prank(bob);
        listingRegistry.createListing(
            NexListingRegistry.ListingRequest({
                orderHash: orderHash,
                edition: address(baldies),
                tokenId: 1,
                termsVersionHash: passTermsHash,
                usdGPrice: 250 * USDC_ONE,
                startTime: uint64(block.timestamp),
                expiry: uint64(block.timestamp + 7 days)
            })
        );
        assertTrue(listingRegistry.isListingActive(orderHash), "listing must be active");
        assertEq(listingRegistry.activeListingFor(address(baldies), 1), orderHash);

        // The Vault is now value-locked against the seller.
        assertTrue(NexPassAccount(payable(passVault)).isVaultLocked(), "Vault must lock while listed");
        vm.prank(bob);
        vm.expectRevert(NexPassAccount.PassVaultLockedWhileListed.selector);
        IERC6551Executable(payable(passVault)).execute(
            address(nex), 0, abi.encodeCall(IERC20.transfer, (bob, 800 ether)), 0
        );

        // The collectible cannot be walked out either.
        vm.prank(bob);
        vm.expectRevert(NexPassAccount.PassVaultLockedWhileListed.selector);
        IERC6551Executable(payable(passVault)).execute(
            address(collectible), 0, abi.encodeCall(IERC721.transferFrom, (passVault, bob, 7)), 0
        );

        // Advantage consumption is frozen by the listing authority as well.
        assertTrue(advantageRegistry.isListed(address(baldies), 1), "Advantage registry must know the Pass is listed");
        assertFalse(advantageRegistry.isUsable(address(baldies), 1, ADVANTAGE_ID), "Advantage use must freeze while listed");

        assertEq(nex.balanceOf(passVault), 800 ether, "no value left the Vault while listed");
        assertEq(nvdac.balanceOf(passVault), 15 ether);
        console2.log("[8] Listing lock verified: Vault claims and NFT withdrawal both revert while listed.");
    }

    function _stepSecondaryTransfer() internal {
        bytes32 orderHash = listingRegistry.activeListingFor(address(baldies), 1);

        // Cancel to release the lock, then settle the transfer of ownership.
        vm.prank(bob);
        listingRegistry.cancelListing(orderHash);
        assertFalse(NexPassAccount(payable(passVault)).isVaultLocked(), "cancel must release the lock");

        vm.prank(bob);
        baldies.transferFrom(bob, charlie, 1);
        assertEq(baldies.ownerOf(1), charlie, "buyer owns the Pass");

        // Same Vault, same contents, new controller.
        assertEq(tbaResolver.account(address(baldies), 1), passVault, "Vault address is Pass-bound");
        assertEq(nvdac.balanceOf(passVault), 15 ether, "15 NVDAc transferred with the Pass");
        assertEq(nex.balanceOf(passVault), 800 ether, "800 NEX transferred with the Pass");
        assertEq(op.balanceOf(passVault), 50 ether);
        assertEq(collectible.ownerOf(7), passVault, "collectible stays in the Vault");
        assertEq(NexPassAccount(payable(passVault)).owner(), charlie, "new owner controls the Vault");

        // Remaining Advantage follows the Pass: still 7, not 10 and not 0.
        assertEq(remainingCredits(1), CREDITS - 3, "7 credits transferred with the Pass");

        // The seller has lost all authority over the Vault.
        vm.prank(bob);
        vm.expectRevert(NexPassAccount.InvalidSigner.selector);
        IERC6551Executable(payable(passVault)).execute(
            address(nex), 0, abi.encodeCall(IERC20.transfer, (bob, 800 ether)), 0
        );

        // The buyer can claim.
        vm.prank(charlie);
        IERC6551Executable(payable(passVault)).execute(
            address(nex), 0, abi.encodeCall(IERC20.transfer, (charlie, 800 ether)), 0
        );
        assertEq(nex.balanceOf(charlie), 800 ether, "buyer claimed 800 NEX");
        assertEq(nex.balanceOf(passVault), 0);
        console2.log("[9] Secondary transfer: Vault and 7 remaining credits followed the Pass. Seller locked out.");
    }

    // ====================================================================
    // helpers
    // ====================================================================

    function controllerWalletMinted(address account) internal view returns (uint256) {
        return mintController.allowlistWalletMinted(address(baldies), termsHash, account);
    }

    function remainingCredits(uint256 tokenId) internal view returns (uint256) {
        return advantageRegistry.remaining(address(baldies), tokenId, ADVANTAGE_ID);
    }
}
