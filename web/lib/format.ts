// Shared TypeScript types and formatting/display helpers used across the
// whole frontend — the single source of truth for "what a Proposal looks
// like on this side of the app" and how we turn raw on-chain values
// (bigints, unix timestamps, wei) into readable text.

import { formatEther } from "ethers";

// Mirrors the `VoteType` enum in sc/src/DAOVoting.sol exactly — the
// numeric values must match, since this is what actually gets sent
// on-chain when voting and what comes back from getUserVote/getProposal.
export enum VoteType {
  None = 0,
  For = 1,
  Against = 2,
  Abstain = 3,
}

// Mirrors the `Proposal` struct returned by DAOVoting.getProposal(). Note
// all numeric fields are `bigint` — that's how ethers v6 decodes Solidity
// uint256 values in JavaScript (they don't fit safely in `number`).
export interface Proposal {
  id: bigint;
  recipient: string;
  amount: bigint;
  deadline: bigint;
  votesFor: bigint;
  votesAgainst: bigint;
  votesAbstain: bigint;
  executed: boolean;
  proposer: string;
  description: string;
}

// One row of the "execution log" shown in <ExecutionPanel>, built from
// ProposalExecuted events (see DaoContext's fetchExecutionLog).
export interface ExecutionLogEntry {
  proposalId: bigint;
  recipient: string;
  amount: bigint;
  executor: string;
  // True when `executor` matches the known relayer address (the daemon
  // executed it automatically); false means a member executed it manually
  // from the UI.
  isAutomatic: boolean;
  txHash: string;
  timestamp: number;
}

// The four states a proposal can be in from the UI's point of view. Note
// this is a *derived* value, not something read directly from the chain —
// see getProposalStatus below for how it's computed.
export type ProposalStatus = "Activa" | "Aprobada" | "Rechazada" | "Ejecutada";

/**
 * Figures out a proposal's display status from its raw on-chain fields
 * plus the current time. The contract itself has no "status" field — this
 * is purely derived, and must be recomputed whenever `nowSeconds` ticks
 * forward (e.g. a proposal flips from "Activa" to "Aprobada"/"Rechazada"
 * automatically the instant its deadline passes, without any transaction).
 *
 * Note this only checks `deadline`, not `deadline + executionDelay` — a
 * proposal already shows as "Aprobada" during the extra safety window,
 * before it's actually executable. Components that need to know whether
 * it can be executed *right now* also compare against `executionDelay`
 * separately (see ExecutionPanel.tsx).
 */
export function getProposalStatus(p: Proposal, nowSeconds: number): ProposalStatus {
  if (p.executed) return "Ejecutada";
  if (nowSeconds <= Number(p.deadline)) return "Activa";
  return p.votesFor > p.votesAgainst ? "Aprobada" : "Rechazada";
}

/** Formats a wei amount (bigint) as a human-readable ETH string. */
export function formatEth(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

/** "0x1234...abcd" — shortens a full 42-char address for compact display. */
export function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Converts a proposal's unix-timestamp deadline into a local date string. */
export function formatDeadline(deadline: bigint): string {
  return new Date(Number(deadline) * 1000).toLocaleString();
}

/** Relative time string ("hace 5 min") for execution-log timestamps. */
export function timeAgo(timestampSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestampSeconds);
  if (diff < 60) return "hace segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

/** Turns a duration in seconds (e.g. `executionDelay`) into readable text. */
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s < 60) return `${s} segundos`;
  if (s < 3600) return `${Math.round(s / 60)} minutos`;
  if (s < 86400) return `${Math.round(s / 3600)} horas`;
  return `${Math.round(s / 86400)} días`;
}
