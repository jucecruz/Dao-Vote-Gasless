// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MinimalForwarder} from "../src/MinimalForwarder.sol";
import {DAOVoting} from "../src/DAOVoting.sol";

contract DAOVotingTest is Test {
    MinimalForwarder internal forwarder;
    DAOVoting internal dao;

    uint256 internal constant MIN_VOTE_BALANCE = 0.5 ether;
    uint256 internal constant EXECUTION_DELAY = 1 days;

    uint256 internal aliceKey = 0xA11CE;
    address internal alice;

    address internal whale = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);
    address internal recipient = address(0x4);
    address internal relayer = address(0x5);

    bytes32 internal constant TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    function setUp() public {
        forwarder = new MinimalForwarder();
        dao = new DAOVoting(address(forwarder), MIN_VOTE_BALANCE, EXECUTION_DELAY);
        alice = vm.addr(aliceKey);

        vm.deal(whale, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        vm.prank(whale);
        dao.fundDAO{value: 9 ether}();
        vm.prank(alice);
        dao.fundDAO{value: 1 ether}();
        vm.prank(bob);
        dao.fundDAO{value: 1 ether}();
        // carol funds nothing: below the voting threshold.
    }

    // --- helpers -----------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("MinimalForwarder")),
                keccak256(bytes("0.0.1")),
                block.chainid,
                address(forwarder)
            )
        );
    }

    function _digest(MinimalForwarder.ForwardRequest memory req) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data))
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _signAliceVote(uint256 proposalId, DAOVoting.VoteType voteType)
        internal
        view
        returns (MinimalForwarder.ForwardRequest memory req, bytes memory signature)
    {
        req = MinimalForwarder.ForwardRequest({
            from: alice,
            to: address(dao),
            value: 0,
            gas: 200_000,
            nonce: forwarder.getNonce(alice),
            data: abi.encodeCall(DAOVoting.vote, (proposalId, voteType))
        });
        bytes32 digest = _digest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _createProposal() internal returns (uint256 id, uint256 deadline) {
        deadline = block.timestamp + 1 days;
        vm.prank(whale);
        dao.createProposal(recipient, 2 ether, deadline);
        id = 1;
    }

    // --- fundDAO -------------------------------------------------------

    function test_FundDAO_UpdatesBalances() public view {
        assertEq(dao.getUserBalance(whale), 9 ether);
        assertEq(dao.getUserBalance(alice), 1 ether);
        assertEq(dao.getTotalBalance(), 11 ether);
    }

    function test_FundDAO_RevertsOnZeroValue() public {
        vm.prank(bob);
        vm.expectRevert("DAOVoting: zero funding");
        dao.fundDAO{value: 0}();
    }

    // --- createProposal --------------------------------------------------

    function test_CreateProposal_Success() public {
        (uint256 id, uint256 deadline) = _createProposal();
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.id, 1);
        assertEq(p.recipient, recipient);
        assertEq(p.amount, 2 ether);
        assertEq(p.deadline, deadline);
        assertEq(p.proposer, whale);
        assertFalse(p.executed);
    }

    function test_CreateProposal_RevertsBelowThreshold() public {
        // alice holds 1 ether out of 11 ether total (~9%), below the 10% bar.
        vm.prank(alice);
        vm.expectRevert("DAOVoting: insufficient balance to propose");
        dao.createProposal(recipient, 1 ether, block.timestamp + 1 days);
    }

    function test_CreateProposal_RevertsPastDeadline() public {
        vm.prank(whale);
        vm.expectRevert("DAOVoting: deadline in past");
        dao.createProposal(recipient, 1 ether, block.timestamp);
    }

    function test_CreateProposal_RevertsAmountExceedsTotalBalance() public {
        vm.prank(whale);
        vm.expectRevert("DAOVoting: invalid amount");
        dao.createProposal(recipient, 100 ether, block.timestamp + 1 days);
    }

    // --- vote --------------------------------------------------------

    function test_Vote_NormalTally() public {
        (uint256 id,) = _createProposal();

        vm.prank(whale);
        dao.vote(id, DAOVoting.VoteType.For);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.Against);
        vm.prank(bob);
        dao.vote(id, DAOVoting.VoteType.Abstain);

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.votesFor, 1);
        assertEq(p.votesAgainst, 1);
        assertEq(p.votesAbstain, 1);
    }

    function test_Vote_ChangeVoteBeforeDeadline() public {
        (uint256 id,) = _createProposal();

        vm.startPrank(alice);
        dao.vote(id, DAOVoting.VoteType.For);
        dao.vote(id, DAOVoting.VoteType.Against);
        vm.stopPrank();

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.votesFor, 0);
        assertEq(p.votesAgainst, 1);
        assertEq(uint8(dao.getUserVote(id, alice)), uint8(DAOVoting.VoteType.Against));
    }

    function test_Vote_SameVoteTwiceIsNoOp() public {
        (uint256 id,) = _createProposal();

        vm.startPrank(alice);
        dao.vote(id, DAOVoting.VoteType.For);
        dao.vote(id, DAOVoting.VoteType.For);
        vm.stopPrank();

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.votesFor, 1);
    }

    function test_Vote_RevertsInsufficientBalance() public {
        (uint256 id,) = _createProposal();

        vm.prank(carol);
        vm.expectRevert("DAOVoting: insufficient balance to vote");
        dao.vote(id, DAOVoting.VoteType.For);
    }

    function test_Vote_RevertsAfterDeadline() public {
        (uint256 id, uint256 deadline) = _createProposal();

        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert("DAOVoting: voting closed");
        dao.vote(id, DAOVoting.VoteType.For);
    }

    function test_Vote_RevertsProposalDoesNotExist() public {
        vm.prank(alice);
        vm.expectRevert("DAOVoting: proposal does not exist");
        dao.vote(42, DAOVoting.VoteType.For);
    }

    // --- gasless voting (EIP-2771 via MinimalForwarder) -----------------

    function test_Vote_Gasless_ThirdPartyPaysGas() public {
        (uint256 id,) = _createProposal();
        (MinimalForwarder.ForwardRequest memory req, bytes memory signature) =
            _signAliceVote(id, DAOVoting.VoteType.For);

        // relayer != alice: alice never sends a transaction herself.
        vm.prank(relayer);
        forwarder.execute(req, signature);

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.votesFor, 1);
        assertEq(uint8(dao.getUserVote(id, alice)), uint8(DAOVoting.VoteType.For));
        assertEq(uint8(dao.getUserVote(id, relayer)), uint8(DAOVoting.VoteType.None));
    }

    function test_Vote_Gasless_SignerPaysOwnGas() public {
        (uint256 id,) = _createProposal();
        (MinimalForwarder.ForwardRequest memory req, bytes memory signature) =
            _signAliceVote(id, DAOVoting.VoteType.For);

        // alice submits her own signed request through the forwarder.
        vm.prank(alice);
        forwarder.execute(req, signature);

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.votesFor, 1);
        assertEq(uint8(dao.getUserVote(id, alice)), uint8(DAOVoting.VoteType.For));
    }

    function test_Vote_Gasless_ReplayReverts() public {
        (uint256 id,) = _createProposal();
        (MinimalForwarder.ForwardRequest memory req, bytes memory signature) =
            _signAliceVote(id, DAOVoting.VoteType.For);

        vm.prank(relayer);
        forwarder.execute(req, signature);

        vm.prank(relayer);
        vm.expectRevert("MinimalForwarder: signature does not match request");
        forwarder.execute(req, signature);
    }

    // --- executeProposal --------------------------------------------------

    function test_ExecuteProposal_Success() public {
        (uint256 id, uint256 deadline) = _createProposal();

        vm.prank(whale);
        dao.vote(id, DAOVoting.VoteType.For);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.For);
        vm.prank(bob);
        dao.vote(id, DAOVoting.VoteType.Against);

        vm.warp(deadline + EXECUTION_DELAY + 1);

        uint256 recipientBalanceBefore = recipient.balance;
        uint256 totalBalanceBefore = dao.getTotalBalance();

        dao.executeProposal(id);

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertTrue(p.executed);
        assertEq(recipient.balance, recipientBalanceBefore + 2 ether);
        assertEq(dao.getTotalBalance(), totalBalanceBefore - 2 ether);
    }

    function test_ExecuteProposal_RevertsBeforeDelayElapsed() public {
        (uint256 id, uint256 deadline) = _createProposal();

        vm.prank(whale);
        dao.vote(id, DAOVoting.VoteType.For);

        vm.warp(deadline + 1); // deadline passed, but executionDelay has not
        vm.expectRevert("DAOVoting: too early to execute");
        dao.executeProposal(id);
    }

    function test_ExecuteProposal_RevertsNotApproved() public {
        (uint256 id, uint256 deadline) = _createProposal();

        vm.prank(whale);
        dao.vote(id, DAOVoting.VoteType.Against);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.For);

        vm.warp(deadline + EXECUTION_DELAY + 1);
        vm.expectRevert("DAOVoting: proposal not approved");
        dao.executeProposal(id);
    }

    function test_ExecuteProposal_RevertsAlreadyExecuted() public {
        (uint256 id, uint256 deadline) = _createProposal();

        vm.prank(whale);
        dao.vote(id, DAOVoting.VoteType.For);

        vm.warp(deadline + EXECUTION_DELAY + 1);
        dao.executeProposal(id);

        vm.expectRevert("DAOVoting: already executed");
        dao.executeProposal(id);
    }

    function test_ExecuteProposal_RevertsProposalDoesNotExist() public {
        vm.expectRevert("DAOVoting: proposal does not exist");
        dao.executeProposal(99);
    }
}
