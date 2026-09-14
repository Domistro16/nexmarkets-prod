// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";

import {NexAdvantageRegistry} from "../src/NexAdvantageRegistry.sol";
import {NexLaunchRegistry} from "../src/NexLaunchRegistry.sol";
import {NexMintController} from "../src/NexMintController.sol";
import {NexPassEdition} from "../src/NexPassEdition.sol";
import {NexPassFactory} from "../src/NexPassFactory.sol";
import {NexRewardDistributor} from "../src/NexRewardDistributor.sol";
import {NexTBAResolver} from "../src/NexTBAResolver.sol";
import {ERC6551Registry} from "../src/erc6551/ERC6551Registry.sol";
import {IERC6551Executable} from "../src/erc6551/IERC6551.sol";
import {NexPassAccount} from "../src/erc6551/NexPassAccount.sol";

contract RewardUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes 1% on every transfer between non-zero addresses so a Cycle that
///      trusts `transferFrom`'s return value would silently under-fund.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, to, value - fee);
            if (fee != 0) super._update(from, address(this), fee);
            return;
        }
        super._update(from, to, value);
    }
}

contract RewardListingLockStub {
    mapping(address => mapping(uint256 => bytes32)) internal _active;
    mapping(bytes32 => bool) internal _live;

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

    function activeListingFor(address edition, uint256 tokenId) external view returns (bytes32) {
        return _active[edition][tokenId];
    }

    function isListingActive(bytes32 orderHash) external view returns (bool) {
        return _live[orderHash];
    }
}

/// @title Reward Policy / Reward Cycle — equal-split drops into the Pass Vault
/// @notice Proves the distinction the product requires: a Policy is a published
///         rule with no money, a Cycle is a funded amount that settles into the
///         exact numbered Pass, follows the Pass on sale, and can be credited
///         even while the Vault is listing-locked.
contract NexRewardDistributorTest is Test {
    RewardUSDC internal usdc;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    ERC6551Registry internal erc6551;
    NexPassAccount internal implementation;
    NexTBAResolver internal resolver;
    RewardListingLockStub internal listingLock;
    NexRewardDistributor internal rewards;

    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant STRANGER = address(0x5E7);

    uint256 internal constant PRICE = 1_000_000;
    uint256 internal constant PER_PASS = 20_500_000; // 20.5 USDC, 6dp
    uint32 internal constant SUPPLY = 8;

    bytes32 internal termsHash;
    uint64 internal mintStartsAt;

    function setUp() public {
        usdc = new RewardUSDC();
        launchRegistry = new NexLaunchRegistry(address(this), address(usdc));
        mintController = new NexMintController(address(this), launchRegistry, usdc, address(0xFEE));
        factory = new NexPassFactory(address(this), address(this), launchRegistry, mintController);
        launchRegistry.setFactory(address(factory));

        vm.prank(PUBLISHER);
        edition = NexPassEdition(
            factory.createEdition(
                NexPassEdition.EditionConfig({
                    name: "Pulse",
                    symbol: "PULSE",
                    initialOwner: PUBLISHER,
                    editionId: keccak256("pulse:edition"),
                    absoluteSupplyCap: SUPPLY,
                    artworkCommitment: keccak256("pulse:art"),
                    baseTokenURI: "ipfs://pulse/"
                }),
                keccak256("pulse:salt")
            )
        );

        listingLock = new RewardListingLockStub();
        erc6551 = new ERC6551Registry();
        implementation = new NexPassAccount(address(listingLock));
        resolver = new NexTBAResolver(
            factory, erc6551, address(implementation), address(erc6551).codehash, address(implementation).codehash
        );
        rewards = new NexRewardDistributor(address(this), launchRegistry, resolver);

        uint64 preview = uint64(block.timestamp);
        mintStartsAt = preview + 1 days;
        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: SUPPLY,
            pricePerPass: PRICE,
            previewStartsAt: preview,
            mintStartsAt: mintStartsAt,
            mintEndsAt: mintStartsAt + 30 days,
            allowlistRoot: bytes32(0),
            allowlistEndsAt: 0,
            allowlistSupply: 0,
            walletAllowance: 0,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 250,
            advantagesHash: bytes32(0),
            referralTermsHash: keccak256("pulse:referral")
        });
        vm.prank(PUBLISHER);
        termsHash = launchRegistry.publishTerms(address(edition), terms);

        usdc.mint(ALICE, 10 * PRICE);
        usdc.mint(BOB, 10 * PRICE);
        usdc.mint(PUBLISHER, 1_000_000 * PER_PASS);
        vm.prank(ALICE);
        usdc.approve(address(mintController), type(uint256).max);
        vm.prank(BOB);
        usdc.approve(address(mintController), type(uint256).max);
        vm.prank(PUBLISHER);
        usdc.approve(address(rewards), type(uint256).max);

        vm.warp(mintStartsAt);
    }

    // --------------------------------------------------------------------
    // Policy vs Cycle
    // --------------------------------------------------------------------

    function testPublishPolicyCommitsNoFunds() public {
        bytes32 policyId = _publishFlexibleOngoing();
        NexRewardDistributor.Policy memory policy = rewards.policyInfo(policyId);
        assertEq(policy.edition, address(edition));
        assertEq(uint8(policy.status), uint8(NexRewardDistributor.PolicyStatus.ACTIVE));
        assertEq(policy.cycleCount, 0);
        assertEq(usdc.balanceOf(address(rewards)), 0);
        assertEq(rewards.escrowedByAsset(address(usdc)), 0);
    }

    function testFundCycleEscrowsExactEqualSplit() public {
        _mint(ALICE, 2, "alice:pair");
        _mint(BOB, 1, "bob:one");
        bytes32 policyId = _publishFlexibleOngoing();

        vm.prank(PUBLISHER);
        bytes32 cycleId = rewards.fundCycle(policyId, usdc, PER_PASS);

        NexRewardDistributor.Cycle memory cycle = rewards.cycleInfo(cycleId);
        assertEq(cycle.eligibleSupply, 3);
        assertEq(cycle.amountPerPass, PER_PASS);
        assertEq(cycle.fundedAmount, 3 * PER_PASS);
        assertEq(cycle.claimedAmount, 0);
        assertEq(usdc.balanceOf(address(rewards)), 3 * PER_PASS);
        assertEq(rewards.escrowedByAsset(address(usdc)), 3 * PER_PASS);
        assertEq(rewards.unclaimedAmount(cycleId), 3 * PER_PASS);
        assertEq(cycle.snapshotBlock, uint64(block.number));
    }

    function testClaimCreditsThePassVaultNotTheCaller() public {
        _mint(ALICE, 1, "alice:one");
        bytes32 cycleId = _fund(PER_PASS);
        address vault = resolver.account(address(edition), 1);
        assertEq(vault.code.length, 0, "counterfactual vault must still credit");

        vm.prank(STRANGER);
        uint256 paid = rewards.claim(cycleId, 1);

        assertEq(paid, PER_PASS);
        assertEq(usdc.balanceOf(vault), PER_PASS);
        assertEq(usdc.balanceOf(STRANGER), 0);
        assertEq(usdc.balanceOf(ALICE), 9 * PRICE); // paid one mint, received no reward
        assertTrue(rewards.isClaimed(cycleId, 1));
        assertEq(rewards.claimableAmount(cycleId, 1), 0);
        assertEq(rewards.escrowedByAsset(address(usdc)), 0);
    }

    function testClaimManySettlesABatch() public {
        _mint(ALICE, 3, "alice:three");
        bytes32 cycleId = _fund(PER_PASS);
        uint256[] memory ids = new uint256[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;

        vm.prank(STRANGER);
        uint256 total = rewards.claimMany(cycleId, ids);

        assertEq(total, 3 * PER_PASS);
        assertEq(usdc.balanceOf(resolver.account(address(edition), 1)), PER_PASS);
        assertEq(usdc.balanceOf(resolver.account(address(edition), 2)), PER_PASS);
        assertEq(usdc.balanceOf(resolver.account(address(edition), 3)), PER_PASS);
        assertEq(rewards.cycleInfo(cycleId).claimedCount, 3);
        assertEq(rewards.unclaimedAmount(cycleId), 0);
    }

    // --------------------------------------------------------------------
    // Follows the Pass
    // --------------------------------------------------------------------

    function testUnclaimedRewardFollowsThePassOnSale() public {
        _mint(ALICE, 1, "alice:sale");
        bytes32 cycleId = _fund(PER_PASS);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(edition.ownerOf(1), BOB);

        rewards.claim(cycleId, 1);
        address vault = resolver.createAccount(address(edition), 1);
        assertEq(usdc.balanceOf(vault), PER_PASS);
        assertEq(NexPassAccount(payable(vault)).owner(), BOB);

        vm.prank(ALICE);
        vm.expectRevert(NexPassAccount.InvalidSigner.selector);
        IERC6551Executable(vault).execute(
            address(usdc), 0, abi.encodeCall(IERC20.transfer, (ALICE, PER_PASS)), 0
        );

        vm.prank(BOB);
        IERC6551Executable(vault).execute(address(usdc), 0, abi.encodeCall(IERC20.transfer, (BOB, PER_PASS)), 0);
        assertEq(usdc.balanceOf(BOB), 10 * PRICE + PER_PASS);
    }

    function testAlreadyClaimedRewardStaysInTheVaultThroughSale() public {
        _mint(ALICE, 1, "alice:held");
        bytes32 cycleId = _fund(PER_PASS);
        rewards.claim(cycleId, 1);
        address vault = resolver.account(address(edition), 1);
        assertEq(usdc.balanceOf(vault), PER_PASS);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);

        assertEq(usdc.balanceOf(vault), PER_PASS, "sale must not move Vault assets");
        assertTrue(rewards.isClaimed(cycleId, 1));
    }

    function testPassMintedAfterFundingIsNotEligible() public {
        _mint(ALICE, 2, "alice:early");
        bytes32 cycleId = _fund(PER_PASS);
        _mint(BOB, 1, "bob:late");

        assertEq(edition.totalMinted(), 3);
        assertEq(rewards.cycleInfo(cycleId).eligibleSupply, 2);
        assertEq(rewards.claimableAmount(cycleId, 3), 0);

        vm.expectRevert(NexRewardDistributor.SerialNotEligible.selector);
        rewards.claim(cycleId, 3);
    }

    // --------------------------------------------------------------------
    // Listing lock
    // --------------------------------------------------------------------

    function testClaimCreditsAListedVaultAndSellerCannotDrainIt() public {
        _mint(ALICE, 1, "alice:listed");
        address vault = resolver.createAccount(address(edition), 1);
        listingLock.setListed(address(edition), 1, true);
        assertTrue(NexPassAccount(payable(vault)).isVaultLocked());

        bytes32 cycleId = _fund(PER_PASS);
        rewards.claim(cycleId, 1);
        assertEq(usdc.balanceOf(vault), PER_PASS);

        vm.prank(ALICE);
        vm.expectRevert(NexPassAccount.PassVaultLockedWhileListed.selector);
        IERC6551Executable(vault).execute(
            address(usdc), 0, abi.encodeCall(IERC20.transfer, (ALICE, PER_PASS)), 0
        );

        listingLock.setListed(address(edition), 1, false);
        vm.prank(ALICE);
        IERC6551Executable(vault).execute(address(usdc), 0, abi.encodeCall(IERC20.transfer, (ALICE, PER_PASS)), 0);
        assertEq(usdc.balanceOf(vault), 0);
    }

    // --------------------------------------------------------------------
    // Negative cases — specific selectors
    // --------------------------------------------------------------------

    function testNonPublisherCannotPublishOrFund() public {
        NexRewardDistributor.PolicyInput memory input = _flexibleOngoing();
        vm.prank(STRANGER);
        vm.expectRevert(NexRewardDistributor.NotEditionPublisher.selector);
        rewards.publishPolicy(address(edition), input);

        _mint(ALICE, 1, "alice:auth");
        bytes32 policyId = _publishFlexibleOngoing();
        vm.prank(STRANGER);
        vm.expectRevert(NexRewardDistributor.NotEditionPublisher.selector);
        rewards.fundCycle(policyId, usdc, PER_PASS);
    }

    function testCannotFundBeforeAnyMint() public {
        bytes32 policyId = _publishFlexibleOngoing();
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.NoEligiblePasses.selector);
        rewards.fundCycle(policyId, usdc, PER_PASS);
    }

    function testCannotDoubleClaim() public {
        _mint(ALICE, 1, "alice:once");
        bytes32 cycleId = _fund(PER_PASS);
        rewards.claim(cycleId, 1);
        vm.expectRevert(NexRewardDistributor.AlreadyClaimed.selector);
        rewards.claim(cycleId, 1);
    }

    function testClaimRejectsTokenIdZeroAndOutOfRange() public {
        _mint(ALICE, 1, "alice:range");
        bytes32 cycleId = _fund(PER_PASS);
        vm.expectRevert(NexRewardDistributor.SerialNotEligible.selector);
        rewards.claim(cycleId, 0);
        vm.expectRevert(NexRewardDistributor.SerialNotEligible.selector);
        rewards.claim(cycleId, 2);
    }

    function testRetiredPolicyCannotFundButExistingCycleStaysClaimable() public {
        _mint(ALICE, 1, "alice:retire");
        bytes32 policyId = _publishFlexibleOngoing();
        vm.prank(PUBLISHER);
        bytes32 cycleId = rewards.fundCycle(policyId, usdc, PER_PASS);

        vm.prank(PUBLISHER);
        rewards.retirePolicy(policyId);
        assertEq(uint8(rewards.policyInfo(policyId).status), uint8(NexRewardDistributor.PolicyStatus.RETIRED));

        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.PolicyNotActive.selector);
        rewards.fundCycle(policyId, usdc, PER_PASS);

        rewards.claim(cycleId, 1);
        assertEq(usdc.balanceOf(resolver.account(address(edition), 1)), PER_PASS);
    }

    function testExpiredPolicyCannotFund() public {
        _mint(ALICE, 1, "alice:exp");
        NexRewardDistributor.PolicyInput memory input = NexRewardDistributor.PolicyInput({
            source: NexRewardDistributor.RewardSource.BUILDER_FUNDED,
            allocationBps: 0,
            rewardAsset: address(0),
            ongoing: false,
            endsAt: uint64(block.timestamp + 1 hours)
        });
        vm.prank(PUBLISHER);
        bytes32 policyId = rewards.publishPolicy(address(edition), input);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.PolicyExpired.selector);
        rewards.fundCycle(policyId, usdc, PER_PASS);
    }

    function testPauseBlocksPublishAndFundButNeverClaim() public {
        _mint(ALICE, 1, "alice:pause");
        bytes32 cycleId = _fund(PER_PASS);

        bytes32 policyId = rewards.policyIdAt(address(edition), 1);
        rewards.pause();
        vm.prank(PUBLISHER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        rewards.publishPolicy(address(edition), _flexibleOngoing());
        vm.prank(PUBLISHER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        rewards.fundCycle(policyId, usdc, PER_PASS);

        rewards.claim(cycleId, 1);
        assertEq(usdc.balanceOf(resolver.account(address(edition), 1)), PER_PASS);
    }

    function testPinnedAssetRejectsADifferentToken() public {
        _mint(ALICE, 1, "alice:pin");
        NexRewardDistributor.PolicyInput memory input = NexRewardDistributor.PolicyInput({
            source: NexRewardDistributor.RewardSource.BUILDER_ROYALTY,
            allocationBps: 3_000,
            rewardAsset: address(usdc),
            ongoing: true,
            endsAt: 0
        });
        vm.prank(PUBLISHER);
        bytes32 policyId = rewards.publishPolicy(address(edition), input);

        RewardUSDC other = new RewardUSDC();
        other.mint(PUBLISHER, PER_PASS);
        vm.prank(PUBLISHER);
        other.approve(address(rewards), type(uint256).max);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.AssetMismatch.selector);
        rewards.fundCycle(policyId, other, PER_PASS);
    }

    function testFeeOnTransferAssetIsRejected() public {
        _mint(ALICE, 1, "alice:fee");
        bytes32 policyId = _publishFlexibleOngoing();
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(PUBLISHER, PER_PASS);
        vm.prank(PUBLISHER);
        feeToken.approve(address(rewards), type(uint256).max);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.UnsupportedTokenBehaviour.selector);
        rewards.fundCycle(policyId, feeToken, PER_PASS);
    }

    function testBuilderFundedPolicyRejectsAnAllocationBps() public {
        NexRewardDistributor.PolicyInput memory input = _flexibleOngoing();
        input.allocationBps = 1_000;
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.UnexpectedAllocation.selector);
        rewards.publishPolicy(address(edition), input);
    }

    function testRoyaltyPolicyRequiresAnAllocationBps() public {
        NexRewardDistributor.PolicyInput memory input = NexRewardDistributor.PolicyInput({
            source: NexRewardDistributor.RewardSource.BUILDER_ROYALTY,
            allocationBps: 0,
            rewardAsset: address(0),
            ongoing: true,
            endsAt: 0
        });
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.AllocationRequired.selector);
        rewards.publishPolicy(address(edition), input);
    }

    function testOngoingPolicyCannotCarryAnEndTime() public {
        NexRewardDistributor.PolicyInput memory input = _flexibleOngoing();
        input.endsAt = uint64(block.timestamp + 30 days);
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.WindowInvalid.selector);
        rewards.publishPolicy(address(edition), input);
    }

    function testZeroAmountPerPassIsRejected() public {
        _mint(ALICE, 1, "alice:zero");
        bytes32 policyId = _publishFlexibleOngoing();
        vm.prank(PUBLISHER);
        vm.expectRevert(NexRewardDistributor.AmountRequired.selector);
        rewards.fundCycle(policyId, usdc, 0);
    }

    function testAllocationBpsIsStoredNotEnforced() public {
        _mint(ALICE, 1, "alice:promise");
        NexRewardDistributor.PolicyInput memory input = NexRewardDistributor.PolicyInput({
            source: NexRewardDistributor.RewardSource.BUILDER_ROYALTY,
            allocationBps: 3_000,
            rewardAsset: address(0),
            ongoing: true,
            endsAt: 0
        });
        vm.prank(PUBLISHER);
        bytes32 policyId = rewards.publishPolicy(address(edition), input);
        // The Builder can fund any per-Pass figure, including zero relationship
        // to 30% of anything. That is the product decision: the percentage is a
        // published commitment, not a mechanism.
        vm.prank(PUBLISHER);
        bytes32 cycleId = rewards.fundCycle(policyId, usdc, 1);
        assertEq(rewards.policyInfo(policyId).allocationBps, 3_000);
        assertEq(rewards.cycleInfo(cycleId).amountPerPass, 1);
    }

    function testFuzzEqualSplitNeverLeavesDust(uint8 minted_, uint64 amountPerPass_) public {
        uint256 minted = bound(minted_, 1, SUPPLY);
        uint256 amountPerPass = bound(amountPerPass_, 1, 1e12);
        _mint(ALICE, minted, "alice:fuzz");
        bytes32 cycleId = _fund(amountPerPass);

        NexRewardDistributor.Cycle memory cycle = rewards.cycleInfo(cycleId);
        assertEq(cycle.fundedAmount, amountPerPass * minted);
        assertEq(cycle.fundedAmount, usdc.balanceOf(address(rewards)));

        for (uint256 tokenId = 1; tokenId <= minted; ++tokenId) {
            rewards.claim(cycleId, tokenId);
        }
        assertEq(rewards.unclaimedAmount(cycleId), 0);
        assertEq(usdc.balanceOf(address(rewards)), 0);
        assertEq(rewards.escrowedByAsset(address(usdc)), 0);
        for (uint256 tokenId = 1; tokenId <= minted; ++tokenId) {
            assertEq(usdc.balanceOf(resolver.account(address(edition), tokenId)), amountPerPass);
        }
    }

    // --------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------

    function _flexibleOngoing() internal pure returns (NexRewardDistributor.PolicyInput memory) {
        return NexRewardDistributor.PolicyInput({
            source: NexRewardDistributor.RewardSource.BUILDER_FUNDED,
            allocationBps: 0,
            rewardAsset: address(0),
            ongoing: true,
            endsAt: 0
        });
    }

    function _publishFlexibleOngoing() internal returns (bytes32 policyId) {
        vm.prank(PUBLISHER);
        policyId = rewards.publishPolicy(address(edition), _flexibleOngoing());
    }

    function _fund(uint256 amountPerPass) internal returns (bytes32 cycleId) {
        bytes32 policyId = _publishFlexibleOngoing();
        vm.prank(PUBLISHER);
        cycleId = rewards.fundCycle(policyId, usdc, amountPerPass);
    }

    function _mint(address to, uint256 quantity, string memory intent) internal {
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: to,
            quantity: quantity,
            intentId: keccak256(bytes(intent)),
            referralHint: address(0),
            advantageConfigs: new NexAdvantageRegistry.AdvantageConfig[](0)
        });
        vm.prank(to);
        mintController.mint(request);
    }
}
