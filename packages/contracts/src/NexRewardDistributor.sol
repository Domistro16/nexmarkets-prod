// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {NexLaunchRegistry} from "./NexLaunchRegistry.sol";
import {NexTBAResolver} from "./NexTBAResolver.sol";

interface INexPassEditionRewardView {
    function totalMinted() external view returns (uint256);
}

/// @title NexRewardDistributor
/// @notice Published reward rules per Edition, and funded reward drops that
///         settle into the exact numbered Pass Vault.
/// @dev Separates the two things the product must never conflate: a Policy is a
///      rule ("tokenized stock rewards, ongoing"), a Cycle is money ("20.5 NVDAc
///      per Pass"). No amount exists until a Cycle is funded, which is the
///      distinction the Edition page states to holders.
///
///      Three deliberate design choices, each recorded because each is a
///      product decision rather than a technical inevitability:
///
///      1. **Entitlement is keyed to the tokenId, never to a wallet.** Serials
///         are sequential from 1 and never reused, so a Cycle's eligible set is
///         simply `1..eligibleSupply` captured at funding. There is no holder
///         snapshot, no Merkle tree, and therefore no "the holder sold after the
///         snapshot" case to adjudicate: the entitlement was never attached to a
///         wallet, so it follows the Pass through any number of sales.
///
///      2. **Claims credit the Pass Vault, not the caller,** and are therefore
///         permissionless. Value can only ever land in the Vault of the Pass
///         that earned it, so allowing anyone to push a claim is safe and lets a
///         Builder settle on behalf of holders. Crediting a *listed* Pass is
///         also safe: NexPassAccount gates outbound movement only, so a deposit
///         raises what the buyer receives while the existing lock still stops
///         the seller from draining it.
///
///      3. **A Policy's allocation percentage is a published commitment, not an
///         enforced mechanism.** `allocationBps` records that a Builder said
///         "30% of Builder royalty". Nothing here compels them to fund it:
///         royalties settle into NexRoyaltyVault and are withdrawn manually, and
///         intercepting that flow would mean redeploying the royalty and listing
///         authorities. Treat this field as an indexable promise. Do not render
///         it as though the protocol guarantees it.
contract NexRewardDistributor is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant POLICY_DOMAIN = keccak256("NEXMARKETS_REWARD_POLICY_V1");
    bytes32 public constant CYCLE_DOMAIN = keccak256("NEXMARKETS_REWARD_CYCLE_V1");
    uint16 public constant MAX_ALLOCATION_BPS = 10_000;

    /// @notice Where a Builder says the funding comes from. Declared, not enforced.
    enum RewardSource {
        BUILDER_ROYALTY,
        PRIMARY_SALES,
        OTHER_BUILDER_REVENUE,
        BUILDER_FUNDED
    }

    enum PolicyStatus {
        NONE,
        ACTIVE,
        RETIRED
    }

    struct PolicyInput {
        RewardSource source;
        /// @dev Declared share of `source`. Must be zero for BUILDER_FUNDED,
        ///      which advertises no percentage, and non-zero otherwise.
        uint16 allocationBps;
        /// @dev Fixed reward asset, or the zero address for the product's
        ///      "choose at each funded drop" mode. Each Cycle then names its own.
        address rewardAsset;
        bool ongoing;
        /// @dev Must be zero when `ongoing`, and a future timestamp otherwise.
        uint64 endsAt;
    }

    struct Policy {
        address edition;
        RewardSource source;
        uint16 allocationBps;
        address rewardAsset;
        bool ongoing;
        uint64 endsAt;
        PolicyStatus status;
        uint64 publishedAt;
        uint32 cycleCount;
    }

    struct Cycle {
        bytes32 policyId;
        address edition;
        IERC20 asset;
        /// @notice Exact per-Pass entitlement in the asset's own base units.
        uint256 amountPerPass;
        /// @notice Eligible serials are `1..eligibleSupply`, fixed at funding.
        uint256 eligibleSupply;
        uint256 fundedAmount;
        uint256 claimedAmount;
        uint64 snapshotBlock;
        uint64 fundedAt;
        uint256 claimedCount;
    }

    NexLaunchRegistry public immutable launchRegistry;
    NexTBAResolver public immutable tbaResolver;

    /// @notice Total owed to unclaimed entitlements, per asset. Never withdrawable.
    mapping(address => uint256) public escrowedByAsset;

    mapping(address => uint32) private _policyCountByEdition;
    mapping(bytes32 => Policy) private _policies;
    mapping(bytes32 => Cycle) private _cycles;
    mapping(bytes32 => mapping(uint256 => bool)) private _claimed;

    error AddressRequired();
    error AllocationRequired();
    error AlreadyClaimed();
    error AmountRequired();
    error AssetMismatch();
    error AssetMustBeContract();
    error CycleNotFound();
    error EditionDisabled();
    error EditionNotRegistered();
    error InsufficientBacking();
    error NoEligiblePasses();
    error NotEditionPublisher();
    error PolicyExpired();
    error PolicyNotActive();
    error PolicyNotFound();
    error SerialNotEligible();
    error UnexpectedAllocation();
    error UnsupportedTokenBehaviour();
    error WindowInvalid();

    event RewardPolicyPublished(
        bytes32 indexed policyId,
        address indexed edition,
        address indexed publisher,
        uint8 source,
        uint16 allocationBps,
        address rewardAsset,
        bool ongoing,
        uint64 endsAt
    );
    event RewardPolicyRetired(bytes32 indexed policyId, address indexed edition);
    event RewardCycleFunded(
        bytes32 indexed cycleId,
        bytes32 indexed policyId,
        address indexed edition,
        address asset,
        uint256 amountPerPass,
        uint256 eligibleSupply,
        uint256 fundedAmount,
        uint64 snapshotBlock
    );
    event RewardClaimed(
        bytes32 indexed cycleId,
        address indexed edition,
        uint256 indexed tokenId,
        address passVault,
        address asset,
        uint256 amount
    );

    /// @dev Reads the publisher of record from the launch authority rather than
    ///      keeping a second copy, so a disabled Edition loses reward authority
    ///      at the same instant it loses every other kind.
    modifier onlyEditionPublisher(address edition) {
        NexLaunchRegistry.EditionRecord memory record = launchRegistry.editionInfo(edition);
        if (!record.registered) revert EditionNotRegistered();
        if (record.disabled) revert EditionDisabled();
        if (msg.sender != record.publisher) revert NotEditionPublisher();
        _;
    }

    constructor(address initialOwner, NexLaunchRegistry launchRegistry_, NexTBAResolver tbaResolver_)
        Ownable(initialOwner)
    {
        if (initialOwner == address(0) || address(launchRegistry_) == address(0) || address(tbaResolver_) == address(0))
        {
            revert AddressRequired();
        }
        if (address(launchRegistry_).code.length == 0 || address(tbaResolver_).code.length == 0) {
            revert AddressRequired();
        }
        if (launchRegistry_.owner() != initialOwner) revert AddressRequired();

        launchRegistry = launchRegistry_;
        tbaResolver = tbaResolver_;
    }

    /// @notice Publish a reward rule for an Edition. Commits no funds.
    function publishPolicy(address edition, PolicyInput calldata input)
        external
        whenNotPaused
        onlyEditionPublisher(edition)
        returns (bytes32 policyId)
    {
        if (input.source == RewardSource.BUILDER_FUNDED) {
            if (input.allocationBps != 0) revert UnexpectedAllocation();
        } else {
            if (input.allocationBps == 0 || input.allocationBps > MAX_ALLOCATION_BPS) revert AllocationRequired();
        }
        if (input.ongoing) {
            if (input.endsAt != 0) revert WindowInvalid();
        } else {
            if (input.endsAt <= block.timestamp) revert WindowInvalid();
        }
        if (input.rewardAsset != address(0) && input.rewardAsset.code.length == 0) revert AssetMustBeContract();

        uint32 index = _policyCountByEdition[edition] + 1;
        _policyCountByEdition[edition] = index;
        policyId = keccak256(abi.encode(POLICY_DOMAIN, block.chainid, edition, index));

        _policies[policyId] = Policy({
            edition: edition,
            source: input.source,
            allocationBps: input.allocationBps,
            rewardAsset: input.rewardAsset,
            ongoing: input.ongoing,
            endsAt: input.endsAt,
            status: PolicyStatus.ACTIVE,
            publishedAt: uint64(block.timestamp),
            cycleCount: 0
        });

        _emitPolicyPublished(policyId, edition, input);
    }

    /// @dev Kept in its own frame so the non-viaIR production compiler does not
    ///      run out of stack slots, matching NexLaunchRegistry.
    function _emitPolicyPublished(bytes32 policyId, address edition, PolicyInput calldata input) private {
        emit RewardPolicyPublished(
            policyId,
            edition,
            msg.sender,
            uint8(input.source),
            input.allocationBps,
            input.rewardAsset,
            input.ongoing,
            input.endsAt
        );
    }

    /// @notice Stop new Cycles under a rule. Already-funded Cycles stay claimable.
    function retirePolicy(bytes32 policyId) external {
        Policy storage policy = _policies[policyId];
        if (policy.status == PolicyStatus.NONE) revert PolicyNotFound();
        if (policy.status != PolicyStatus.ACTIVE) revert PolicyNotActive();
        _requirePublisher(policy.edition);

        policy.status = PolicyStatus.RETIRED;
        emit RewardPolicyRetired(policyId, policy.edition);
    }

    /// @notice Fund one reward drop: every serial minted so far receives
    ///         `amountPerPass`, claimable into its own Pass Vault.
    /// @dev The Cycle escrows exactly `amountPerPass * eligibleSupply`, so no
    ///      rounding dust is ever taken from the Builder and no entitlement is
    ///      ever unbacked. The caller keeps any remainder by choosing the
    ///      per-Pass figure rather than a total to divide.
    function fundCycle(bytes32 policyId, IERC20 asset, uint256 amountPerPass)
        external
        whenNotPaused
        nonReentrant
        returns (bytes32 cycleId)
    {
        Policy storage policy = _policies[policyId];
        if (policy.status == PolicyStatus.NONE) revert PolicyNotFound();
        if (policy.status != PolicyStatus.ACTIVE) revert PolicyNotActive();
        if (!policy.ongoing && block.timestamp > policy.endsAt) revert PolicyExpired();
        address edition = policy.edition;
        _requirePublisher(edition);

        if (amountPerPass == 0) revert AmountRequired();
        if (address(asset) == address(0) || address(asset).code.length == 0) revert AssetMustBeContract();
        if (policy.rewardAsset != address(0) && policy.rewardAsset != address(asset)) revert AssetMismatch();

        uint256 eligibleSupply = INexPassEditionRewardView(edition).totalMinted();
        if (eligibleSupply == 0) revert NoEligiblePasses();

        uint256 fundedAmount = amountPerPass * eligibleSupply;

        uint32 cycleIndex = policy.cycleCount + 1;
        policy.cycleCount = cycleIndex;
        cycleId = keccak256(abi.encode(CYCLE_DOMAIN, block.chainid, policyId, cycleIndex));

        // Measure what actually arrived. A fee-on-transfer or rebasing asset
        // would leave entitlements unbacked, so this fails closed rather than
        // silently under-funding every holder.
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), fundedAmount);
        uint256 received = asset.balanceOf(address(this)) - balanceBefore;
        if (received != fundedAmount) revert UnsupportedTokenBehaviour();

        uint256 escrowed = escrowedByAsset[address(asset)] + fundedAmount;
        if (asset.balanceOf(address(this)) < escrowed) revert InsufficientBacking();
        escrowedByAsset[address(asset)] = escrowed;

        _cycles[cycleId] = Cycle({
            policyId: policyId,
            edition: edition,
            asset: asset,
            amountPerPass: amountPerPass,
            eligibleSupply: eligibleSupply,
            fundedAmount: fundedAmount,
            claimedAmount: 0,
            snapshotBlock: uint64(block.number),
            fundedAt: uint64(block.timestamp),
            claimedCount: 0
        });

        _emitCycleFunded(cycleId, policyId, edition, asset, amountPerPass, eligibleSupply, fundedAmount);
    }

    function _emitCycleFunded(
        bytes32 cycleId,
        bytes32 policyId,
        address edition,
        IERC20 asset,
        uint256 amountPerPass,
        uint256 eligibleSupply,
        uint256 fundedAmount
    ) private {
        emit RewardCycleFunded(
            cycleId,
            policyId,
            edition,
            address(asset),
            amountPerPass,
            eligibleSupply,
            fundedAmount,
            uint64(block.number)
        );
    }

    /// @notice Settle one serial's entitlement into that serial's Pass Vault.
    /// @dev Permissionless by design: the destination is derived from the
    ///      tokenId, so the caller cannot redirect value and a Builder may
    ///      settle for holders. Deliberately callable while paused — a protocol
    ///      pause must never strand an entitlement that is already funded.
    function claim(bytes32 cycleId, uint256 tokenId) external nonReentrant returns (uint256 amount) {
        return _claim(cycleId, tokenId);
    }

    /// @notice Settle many serials of one Cycle in a single transaction.
    function claimMany(bytes32 cycleId, uint256[] calldata tokenIds) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < tokenIds.length; ++i) {
            total += _claim(cycleId, tokenIds[i]);
        }
    }

    function _claim(bytes32 cycleId, uint256 tokenId) private returns (uint256 amount) {
        Cycle storage cycle = _cycles[cycleId];
        if (cycle.amountPerPass == 0) revert CycleNotFound();
        if (tokenId == 0 || tokenId > cycle.eligibleSupply) revert SerialNotEligible();
        if (_claimed[cycleId][tokenId]) revert AlreadyClaimed();

        _claimed[cycleId][tokenId] = true;
        amount = cycle.amountPerPass;
        cycle.claimedAmount += amount;
        cycle.claimedCount += 1;

        address asset = address(cycle.asset);
        escrowedByAsset[asset] -= amount;

        // Reverts for anything the Pass Factory does not recognise, so a claim
        // can never be pointed at an address this protocol did not derive.
        address passVault = tbaResolver.account(cycle.edition, tokenId);

        cycle.asset.safeTransfer(passVault, amount);
        emit RewardClaimed(cycleId, cycle.edition, tokenId, passVault, asset, amount);
    }

    /// @notice Pause new rules and new funding. Never blocks claims.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _requirePublisher(address edition) private view {
        NexLaunchRegistry.EditionRecord memory record = launchRegistry.editionInfo(edition);
        if (!record.registered) revert EditionNotRegistered();
        if (record.disabled) revert EditionDisabled();
        if (msg.sender != record.publisher) revert NotEditionPublisher();
    }

    function policyInfo(bytes32 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function cycleInfo(bytes32 cycleId) external view returns (Cycle memory) {
        return _cycles[cycleId];
    }

    function policyCount(address edition) external view returns (uint32) {
        return _policyCountByEdition[edition];
    }

    function policyIdAt(address edition, uint32 index) external view returns (bytes32) {
        return keccak256(abi.encode(POLICY_DOMAIN, block.chainid, edition, index));
    }

    function cycleIdAt(bytes32 policyId, uint32 index) external view returns (bytes32) {
        return keccak256(abi.encode(CYCLE_DOMAIN, block.chainid, policyId, index));
    }

    function isClaimed(bytes32 cycleId, uint256 tokenId) external view returns (bool) {
        return _claimed[cycleId][tokenId];
    }

    /// @notice What this serial can still take from this Cycle, in base units.
    function claimableAmount(bytes32 cycleId, uint256 tokenId) external view returns (uint256) {
        Cycle memory cycle = _cycles[cycleId];
        if (cycle.amountPerPass == 0 || tokenId == 0 || tokenId > cycle.eligibleSupply) return 0;
        if (_claimed[cycleId][tokenId]) return 0;
        return cycle.amountPerPass;
    }

    function unclaimedAmount(bytes32 cycleId) external view returns (uint256) {
        Cycle memory cycle = _cycles[cycleId];
        return cycle.fundedAmount - cycle.claimedAmount;
    }

    /// @notice Where a claim for this serial will settle.
    function passVaultFor(address edition, uint256 tokenId) external view returns (address) {
        return tbaResolver.account(edition, tokenId);
    }
}
