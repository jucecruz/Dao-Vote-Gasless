import { formatEther } from "ethers";

export enum VoteType {
  None = 0,
  For = 1,
  Against = 2,
  Abstain = 3,
}

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

export interface ExecutionLogEntry {
  proposalId: bigint;
  recipient: string;
  amount: bigint;
  executor: string;
  isAutomatic: boolean;
  txHash: string;
  timestamp: number;
}

export type ProposalStatus = "Activa" | "Aprobada" | "Rechazada" | "Ejecutada";

export function getProposalStatus(p: Proposal, nowSeconds: number): ProposalStatus {
  if (p.executed) return "Ejecutada";
  if (nowSeconds <= Number(p.deadline)) return "Activa";
  return p.votesFor > p.votesAgainst ? "Aprobada" : "Rechazada";
}

export function formatEth(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

export function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDeadline(deadline: bigint): string {
  return new Date(Number(deadline) * 1000).toLocaleString();
}

export function timeAgo(timestampSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestampSeconds);
  if (diff < 60) return "hace segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s < 60) return `${s} segundos`;
  if (s < 3600) return `${Math.round(s / 60)} minutos`;
  if (s < 86400) return `${Math.round(s / 3600)} horas`;
  return `${Math.round(s / 86400)} días`;
}
