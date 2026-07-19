// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/// @title DAOVoting
/// @notice A simple DAO: members deposit ETH, that deposit becomes their
/// voting power, and they use it to propose and vote on sending DAO funds
/// to a recipient.
///
/// @dev Two design choices that aren't obvious from the code alone:
///
/// 1. Governance weight = ETH ever deposited via `fundDAO`, tracked in
///    `_balances`. It is a *historical* running total: it never goes down,
///    even after a proposal spends part of the DAO's real balance. This
///    means voting power reflects "how much you've ever contributed," not
///    "your share of what's left in the pot right now." `_totalBalance` is
///    the separate, current-and-shrinking figure used for accounting.
///
/// 2. This contract inherits `ERC2771Context` (EIP-2771 meta-transactions),
///    so every function uses `_msgSender()` instead of the usual `msg.sender`.
///    When a user calls a function directly, `_msgSender()` behaves exactly
///    like `msg.sender`. But this contract also accepts calls relayed by a
///    trusted `MinimalForwarder`: someone else (a "relayer") pays the gas
///    and submits the transaction on the user's behalf, while `_msgSender()`
///    still resolves to the original user who signed the request off-chain.
///    That's what makes gasless voting possible — see `MinimalForwarder.sol`.
contract DAOVoting is ERC2771Context {
    /// @notice The three ways a member can vote on a proposal.
    /// `None` is the default (zero) value and is only used internally to
    /// detect "this address hasn't voted yet" — it can't be cast as a vote.
    enum VoteType {
        None,
        For,
        Against,
        Abstain
    }

    /// @notice Everything the contract stores about a single proposal.
    struct Proposal {
        // Same value as this proposal's key in the `_proposals` mapping,
        // duplicated here so a `Proposal` struct is self-describing once
        // it's been read out of storage (e.g. by the frontend). A freshly
        // zero-initialized struct (i.e. an id nobody created yet) will have
        // id == 0, which is how `id != 0` works as an "does this exist?"
        // check throughout this contract.
        uint256 id;
        // Who receives the funds if the proposal passes and is executed.
        address recipient;
        // How much ETH (in wei) to send to `recipient`.
        uint256 amount;
        // Unix timestamp after which no more votes are accepted.
        uint256 deadline;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        // Flips to true the moment the proposal's funds are transferred;
        // used both to show status and to block double-execution.
        bool executed;
        // Who created the proposal (informational; not used in any check).
        address proposer;
        // Free-text explanation of what the funds are for. Stored on-chain
        // (not just emitted in an event) so every voter can read it by
        // calling `getProposal`, not only by scanning past event logs.
        string description;
    }

    /// @notice Minimum amount a member must have deposited (see `_balances`)
    /// before they're allowed to cast a vote. Set once at deployment.
    uint256 public immutable minVoteBalance;

    /// @notice Extra waiting period, in seconds, required *after* a
    /// proposal's voting `deadline` before it can be executed. This is a
    /// safety window (e.g. giving members time to notice a bad outcome)
    /// separate from the voting period itself. Set once at deployment.
    uint256 public immutable executionDelay;

    // Sequential proposal id generator: the next proposal created gets
    // ++_proposalCounter, so ids start at 1 (never 0 — see the `id` field
    // comment above on why 0 is reserved to mean "doesn't exist").
    uint256 private _proposalCounter;

    // Sum of all ETH currently attributable to the DAO's funding pool.
    // Increases on `fundDAO`, decreases on `executeProposal`. Unlike the
    // per-user `_balances`, this number *does* shrink as proposals spend
    // funds — it represents "funds available to be proposed/spent," while
    // `_balances` represents "historical voting power."
    uint256 private _totalBalance;

    mapping(uint256 => Proposal) private _proposals;

    // Cumulative ETH each address has ever deposited via `fundDAO`. This
    // doubles as each member's voting power and their eligibility to
    // create proposals (see the 10% check in `createProposal`).
    mapping(address => uint256) private _balances;

    // proposalId => voter => what they voted. Recording this (rather than
    // just incrementing counters) is what lets `vote()` detect and undo a
    // member's previous vote when they change their mind.
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
    // `executor` records who actually called `executeProposal` — since
    // that function has no access restriction, this can be the automated
    // daemon's relayer address or any member executing manually. The
    // frontend uses this to label log entries "automatic" vs "manual".
    event ProposalExecuted(uint256 indexed id, address indexed recipient, uint256 amount, address indexed executor);

    /// @param trustedForwarder Address of the `MinimalForwarder` this
    /// contract will accept relayed (gasless) meta-transactions from. Any
    /// call whose outer `msg.sender` is this address is treated specially
    /// by `_msgSender()` (see the EIP-2771 note on the contract docstring).
    /// @param minVoteBalance_ Sets `minVoteBalance` (see above).
    /// @param executionDelay_ Sets `executionDelay` (see above).
    constructor(address trustedForwarder, uint256 minVoteBalance_, uint256 executionDelay_)
        ERC2771Context(trustedForwarder)
    {
        minVoteBalance = minVoteBalance_;
        executionDelay = executionDelay_;
    }

    /// @notice Deposit ETH into the DAO. This both funds the pool that
    /// proposals can spend from and increases the caller's voting power.
    /// @dev Payable — send ETH along with this call (`msg.value`).
    function fundDAO() external payable {
        require(msg.value > 0, "DAOVoting: zero funding");
        address sender = _msgSender();
        _balances[sender] += msg.value;
        _totalBalance += msg.value;
        emit Funded(sender, msg.value);
    }

    /// @notice Create a new proposal to send `amount` wei to `recipient`,
    /// open for voting until `deadline`.
    /// @dev Restricted to members holding at least 10% of `_totalBalance`
    /// (a whale-proofing measure against spammy/trivial proposals). Anyone
    /// who meets the bar can propose — there's no per-address proposal limit.
    /// @param recipient Who would receive the funds if this passes.
    /// @param amount How much ETH (wei) to send; can't exceed what the DAO
    /// currently has available (`_totalBalance`).
    /// @param deadline Unix timestamp; voting closes after this.
    /// @param description Human-readable explanation shown to voters.
    function createProposal(address recipient, uint256 amount, uint256 deadline, string calldata description)
        external
    {
        require(recipient != address(0), "DAOVoting: invalid recipient");
        require(deadline > block.timestamp, "DAOVoting: deadline in past");
        require(amount > 0 && amount <= _totalBalance, "DAOVoting: invalid amount");

        address proposer = _msgSender();
        // proposer must hold >= 10% of the DAO's current pool. Multiplying
        // by 10 instead of dividing avoids rounding/precision loss.
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

    /// @notice Cast (or change) a vote on a proposal that's still open.
    /// @dev A member can call this multiple times before the deadline to
    /// change their mind — each call fully replaces their previous vote
    /// (the old choice's counter is decremented before the new one is
    /// incremented), rather than adding a second vote on top.
    /// @param proposalId Which proposal to vote on.
    /// @param voteType For / Against / Abstain (not None).
    function vote(uint256 proposalId, VoteType voteType) external {
        require(voteType != VoteType.None, "DAOVoting: invalid vote type");

        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "DAOVoting: proposal does not exist");
        require(block.timestamp <= p.deadline, "DAOVoting: voting closed");

        address voter = _msgSender();
        require(_balances[voter] >= minVoteBalance, "DAOVoting: insufficient balance to vote");

        // Undo whatever this voter chose last time (a fresh voter's
        // `previous` is VoteType.None, so none of these branches fire).
        VoteType previous = _votes[proposalId][voter];
        if (previous == VoteType.For) p.votesFor--;
        else if (previous == VoteType.Against) p.votesAgainst--;
        else if (previous == VoteType.Abstain) p.votesAbstain--;

        // Apply the new choice. Voting the same option again is a safe
        // no-op: it gets decremented above and re-incremented here.
        if (voteType == VoteType.For) p.votesFor++;
        else if (voteType == VoteType.Against) p.votesAgainst++;
        else p.votesAbstain++;

        _votes[proposalId][voter] = voteType;
        emit VoteCast(proposalId, voter, voteType);
    }

    /// @notice Execute an approved proposal, transferring its funds to the
    /// recipient. Callable by anyone (not just the proposer) once all the
    /// conditions below are met — in practice this is normally triggered
    /// either by the off-chain daemon or manually from the frontend.
    /// @dev Requires, in order: the proposal exists, hasn't already been
    /// executed, the voting deadline plus the extra `executionDelay`
    /// safety window has passed, strictly more "For" votes than "Against"
    /// (a tie does not pass), and the contract actually holds enough ETH.
    /// @param proposalId Which proposal to execute.
    function executeProposal(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "DAOVoting: proposal does not exist");
        require(!p.executed, "DAOVoting: already executed");
        require(block.timestamp > p.deadline + executionDelay, "DAOVoting: too early to execute");
        require(p.votesFor > p.votesAgainst, "DAOVoting: proposal not approved");
        require(address(this).balance >= p.amount, "DAOVoting: insufficient funds");

        // Mark executed and debit the pool *before* sending ETH out, so a
        // reentrant call back into this function would immediately fail
        // the `!p.executed` check above (checks-effects-interactions).
        p.executed = true;
        _totalBalance -= p.amount;

        (bool success,) = p.recipient.call{value: p.amount}("");
        require(success, "DAOVoting: transfer failed");

        emit ProposalExecuted(proposalId, p.recipient, p.amount, _msgSender());
    }

    /// @notice Read back everything stored about a proposal.
    /// @dev Returns a zeroed-out struct (id == 0) for an id that was never
    /// created — callers should check `.id != 0` before trusting the rest.
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    /// @notice How much ETH `user` has deposited in total (their voting
    /// power / proposal-creation eligibility).
    function getUserBalance(address user) external view returns (uint256) {
        return _balances[user];
    }

    /// @notice What `user` voted on `proposalId`. Returns `VoteType.None`
    /// if they haven't voted (or the proposal doesn't exist).
    function getUserVote(uint256 proposalId, address user) external view returns (VoteType) {
        return _votes[proposalId][user];
    }

    /// @notice The DAO's current spendable balance (see the `_totalBalance`
    /// storage comment for how this differs from any single member's
    /// deposit total).
    function getTotalBalance() external view returns (uint256) {
        return _totalBalance;
    }
}
