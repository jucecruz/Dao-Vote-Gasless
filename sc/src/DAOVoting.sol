// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/// @notice DAO where governance rights (proposal creation + voting weight)
/// are based on ETH deposited via fundDAO(), not wallet balance. Voting
/// supports EIP-2771 meta-transactions relayed through a trusted forwarder.
contract DAOVoting is ERC2771Context {
    enum VoteType {
        None,
        For,
        Against,
        Abstain
    }

    struct Proposal {
        uint256 id;
        address recipient;
        uint256 amount;
        uint256 deadline;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        bool executed;
        address proposer;
        string description;
    }

    uint256 public immutable minVoteBalance;
    uint256 public immutable executionDelay;

    uint256 private _proposalCounter;
    uint256 private _totalBalance;

    mapping(uint256 => Proposal) private _proposals;
    mapping(address => uint256) private _balances;
    mapping(uint256 => mapping(address => VoteType)) private _votes;

    event Funded(address indexed contributor, uint256 amount);
    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        address recipient,
        uint256 amount,
        uint256 deadline,
        string description
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, VoteType voteType);
    event ProposalExecuted(uint256 indexed id, address indexed recipient, uint256 amount, address indexed executor);

    constructor(address trustedForwarder, uint256 minVoteBalance_, uint256 executionDelay_)
        ERC2771Context(trustedForwarder)
    {
        minVoteBalance = minVoteBalance_;
        executionDelay = executionDelay_;
    }

    function fundDAO() external payable {
        require(msg.value > 0, "DAOVoting: zero funding");
        address sender = _msgSender();
        _balances[sender] += msg.value;
        _totalBalance += msg.value;
        emit Funded(sender, msg.value);
    }

    function createProposal(address recipient, uint256 amount, uint256 deadline, string calldata description)
        external
    {
        require(recipient != address(0), "DAOVoting: invalid recipient");
        require(deadline > block.timestamp, "DAOVoting: deadline in past");
        require(amount > 0 && amount <= _totalBalance, "DAOVoting: invalid amount");

        address proposer = _msgSender();
        require(
            _totalBalance > 0 && _balances[proposer] * 10 >= _totalBalance,
            "DAOVoting: insufficient balance to propose"
        );

        uint256 proposalId = ++_proposalCounter;
        _proposals[proposalId] = Proposal({
            id: proposalId,
            recipient: recipient,
            amount: amount,
            deadline: deadline,
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            executed: false,
            proposer: proposer,
            description: description
        });

        emit ProposalCreated(proposalId, proposer, recipient, amount, deadline, description);
    }

    function vote(uint256 proposalId, VoteType voteType) external {
        require(voteType != VoteType.None, "DAOVoting: invalid vote type");

        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "DAOVoting: proposal does not exist");
        require(block.timestamp <= p.deadline, "DAOVoting: voting closed");

        address voter = _msgSender();
        require(_balances[voter] >= minVoteBalance, "DAOVoting: insufficient balance to vote");

        VoteType previous = _votes[proposalId][voter];
        if (previous == VoteType.For) p.votesFor--;
        else if (previous == VoteType.Against) p.votesAgainst--;
        else if (previous == VoteType.Abstain) p.votesAbstain--;

        if (voteType == VoteType.For) p.votesFor++;
        else if (voteType == VoteType.Against) p.votesAgainst++;
        else p.votesAbstain++;

        _votes[proposalId][voter] = voteType;
        emit VoteCast(proposalId, voter, voteType);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "DAOVoting: proposal does not exist");
        require(!p.executed, "DAOVoting: already executed");
        require(block.timestamp > p.deadline + executionDelay, "DAOVoting: too early to execute");
        require(p.votesFor > p.votesAgainst, "DAOVoting: proposal not approved");
        require(address(this).balance >= p.amount, "DAOVoting: insufficient funds");

        p.executed = true;
        _totalBalance -= p.amount;

        (bool success,) = p.recipient.call{value: p.amount}("");
        require(success, "DAOVoting: transfer failed");

        emit ProposalExecuted(proposalId, p.recipient, p.amount, _msgSender());
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    function getUserBalance(address user) external view returns (uint256) {
        return _balances[user];
    }

    function getUserVote(uint256 proposalId, address user) external view returns (VoteType) {
        return _votes[proposalId][user];
    }

    function getTotalBalance() external view returns (uint256) {
        return _totalBalance;
    }
}
