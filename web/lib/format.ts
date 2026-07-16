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
