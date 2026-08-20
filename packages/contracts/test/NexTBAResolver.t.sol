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
import {IERC6551Account, IERC6551Executable, IERC6551Registry} from "../src/erc6551/IERC6551.sol";
import {NexPassAccount} from "../src/erc6551/NexPassAccount.sol";

contract TBAUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TBATarget {
    address public caller;
    uint256 public value;

    function setValue(uint256 value_) external {
        caller = msg.sender;
        value = value_;
    }
}

contract NexTBAResolverTest is Test {
    TBAUSDG internal usdg;
    NexLaunchRegistry internal launchRegistry;
    NexMintController internal mintController;
    NexPassFactory internal factory;
    NexPassEdition internal edition;
    ERC6551Registry internal canonicalRegistry;
    NexPassAccount internal implementation;
    NexTBAResolver internal resolver;

    address internal constant PUBLISHER = address(0xBEEF);
    address internal constant BUILDER = address(0xCAFE);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant PRICE = 1_000_000;

    function setUp() public {
        usdg = new TBAUSDG();
        launchRegistry = new NexLaunchRegistry(address(this), address(usdg));
        mintController = new NexMintController(address(this), launchRegistry, usdg, address(0xFEE));
        factory = new NexPassFactory(address(this), address(this), launchRegistry, mintController);
        launchRegistry.setFactory(address(factory));
        NexPassEdition.EditionConfig memory config = NexPassEdition.EditionConfig({
            name: "TBA Pass",
            symbol: "NEXTBA",
            initialOwner: address(this),
            editionId: keccak256("tba:edition"),
            absoluteSupplyCap: 2,
            artworkCommitment: keccak256("tba:art"),
            baseTokenURI: "ipfs://tba/"
        });
        edition = NexPassEdition(factory.createEdition(config, PUBLISHER, keccak256("tba:salt")));
        uint64 preview = uint64(block.timestamp);
        uint64 mintStart = preview + 1 days;
        NexLaunchRegistry.Terms memory terms = NexLaunchRegistry.Terms({
            activeSupply: 2,
            pricePerPass: PRICE,
            previewStartsAt: preview,
            mintStartsAt: mintStart,
            mintEndsAt: mintStart + 2 days,
            primaryRecipient: BUILDER,
            royaltyReceiver: BUILDER,
            royaltyBps: 0,
            advantagesHash: bytes32(0),
            referralTermsHash: keccak256("tba:referral")
        });
        vm.prank(PUBLISHER);
        bytes32 termsHash = launchRegistry.publishTerms(address(edition), terms);
        usdg.mint(ALICE, 2 * PRICE);
        vm.prank(ALICE);
        usdg.approve(address(mintController), type(uint256).max);
        vm.warp(mintStart);
        NexMintController.MintRequest memory request = NexMintController.MintRequest({
            edition: address(edition),
            termsVersionHash: termsHash,
            recipient: ALICE,
            quantity: 1,
            intentId: keccak256("tba:mint"),
            referralHint: address(0),
            advantageConfigs: new NexAdvantageRegistry.AdvantageConfig[](0)
        });
        vm.prank(ALICE);
        mintController.mint(request);

        canonicalRegistry = new ERC6551Registry();
        implementation = new NexPassAccount();
        resolver = new NexTBAResolver(
            factory,
            canonicalRegistry,
            address(implementation),
            address(canonicalRegistry).codehash,
            address(implementation).codehash
        );
    }

    function testDeterministicAddressAndIdempotentCreation() public {
        address predicted = resolver.account(address(edition), 1);
        address created = resolver.createAccount(address(edition), 1);
        assertEq(created, predicted);
        assertGt(created.code.length, 0);
        uint256 codeLength = created.code.length;
        assertEq(resolver.createAccount(address(edition), 1), created);
        assertEq(created.code.length, codeLength);
        (uint256 chainId, address tokenContract, uint256 tokenId) = IERC6551Account(payable(created)).token();
        assertEq(chainId, block.chainid);
        assertEq(tokenContract, address(edition));
        assertEq(tokenId, 1);
    }

    function testTBAControlFollowsERC721OwnerAfterTransfer() public {
        address account = resolver.createAccount(address(edition), 1);
        assertEq(NexPassAccount(payable(account)).owner(), ALICE);
        assertEq(IERC6551Account(payable(account)).isValidSigner(ALICE, ""), IERC6551Account.isValidSigner.selector);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        assertEq(NexPassAccount(payable(account)).owner(), BOB);
        assertEq(IERC6551Account(payable(account)).isValidSigner(ALICE, ""), bytes4(0));
        assertEq(IERC6551Account(payable(account)).isValidSigner(BOB, ""), IERC6551Account.isValidSigner.selector);
    }

    function testOnlyCurrentOwnerCanExecuteFromAccount() public {
        address account = resolver.createAccount(address(edition), 1);
        TBATarget target = new TBATarget();
        bytes memory callData = abi.encodeCall(TBATarget.setValue, (7));

        vm.prank(ALICE);
        IERC6551Executable(account).execute(address(target), 0, callData, 0);
        assertEq(target.caller(), account);
        assertEq(target.value(), 7);

        vm.prank(ALICE);
        edition.transferFrom(ALICE, BOB, 1);
        vm.prank(ALICE);
        vm.expectRevert(NexPassAccount.InvalidSigner.selector);
        IERC6551Executable(account).execute(address(target), 0, callData, 0);
        vm.prank(BOB);
        IERC6551Executable(account).execute(address(target), 0, abi.encodeCall(TBATarget.setValue, (8)), 0);
        assertEq(target.value(), 8);
    }

    function testTBAHasNoCanonicalNexMarketsAuthority() public {
        address account = resolver.createAccount(address(edition), 1);
        NexLaunchRegistry.Terms memory terms;
        bytes memory callData = abi.encodeCall(NexLaunchRegistry.publishTerms, (address(edition), terms));
        vm.prank(ALICE);
        vm.expectRevert(NexLaunchRegistry.NotEditionPublisher.selector);
        IERC6551Executable(account).execute(address(launchRegistry), 0, callData, 0);
        assertEq(edition.ownerOf(1), ALICE);
        assertEq(edition.totalMinted(), 1);
    }

    function testWrongRegistryOrImplementationHashIsRejected() public {
        TBATarget wrongRegistry = new TBATarget();
        vm.expectRevert(NexTBAResolver.InvalidCodeHash.selector);
        new NexTBAResolver(
            factory,
            IERC6551Registry(address(wrongRegistry)),
            address(implementation),
            address(canonicalRegistry).codehash,
            address(implementation).codehash
        );

        NexPassAccount wrongImplementation = new NexPassAccount();
        vm.expectRevert(NexTBAResolver.InvalidCodeHash.selector);
        new NexTBAResolver(
            factory,
            canonicalRegistry,
            address(wrongImplementation),
            address(canonicalRegistry).codehash,
            bytes32(uint256(1))
        );
    }

    function testUnknownEditionAndUnmintedTokenFailClosed() public {
        vm.expectRevert(NexTBAResolver.InvalidEdition.selector);
        resolver.account(address(0x1234), 1);
        vm.expectRevert(NexTBAResolver.InvalidPass.selector);
        resolver.createAccount(address(edition), 2);
    }
}
