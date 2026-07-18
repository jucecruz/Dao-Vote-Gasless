"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Contract, parseEther } from "ethers";
import { useWallet } from "./WalletContext";
import { DAO_ADDRESS, FORWARDER_ADDRESS, RELAYER_ADDRESS } from "@/lib/config";
import { signVoteRequest } from "@/lib/metaTx";
import { ExecutionLogEntry, Proposal, VoteType } from "@/lib/format";
import daoAbi from "@/lib/abi/DAOVoting.json";
import forwarderAbi from "@/lib/abi/MinimalForwarder.json";

export interface ProposalView extends Proposal {
  userVote: VoteType;
}

interface DaoContextValue {
  userBalance: bigint;
  totalBalance: bigint;
  minVoteBalance: bigint;
  executionDelay: bigint;
  proposals: ProposalView[];
  executionLog: ExecutionLogEntry[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  fundDAO: (amountEth: string) => Promise<string>;
  createProposal: (
    recipient: string,
    amountEth: string,
    deadlineUnix: number,
    description: string
  ) => Promise<string>;
  voteGasless: (proposalId: bigint, voteType: VoteType) => Promise<string>;
  executeProposalManually: (proposalId: bigint) => Promise<string>;
  skipWaitPeriod: (proposalId: bigint) => Promise<string>;
}

const DaoContext = createContext<DaoContextValue | null>(null);

interface RawProposal {
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

function toProposal(raw: RawProposal): Proposal {
  return {
    id: raw.id,
    recipient: raw.recipient,
    amount: raw.amount,
    deadline: raw.deadline,
    votesFor: raw.votesFor,
    votesAgainst: raw.votesAgainst,
    votesAbstain: raw.votesAbstain,
    executed: raw.executed,
    proposer: raw.proposer,
    description: raw.description,
  };
}

export function DaoProvider({ children }: { children: ReactNode }) {
  const { signer, address } = useWallet();

  const dao = useMemo(() => {
    if (!signer || !DAO_ADDRESS) return null;
    return new Contract(DAO_ADDRESS, daoAbi, signer);
  }, [signer]);

  const forwarder = useMemo(() => {
    if (!signer || !FORWARDER_ADDRESS) return null;
    return new Contract(FORWARDER_ADDRESS, forwarderAbi, signer);
  }, [signer]);

  const [userBalance, setUserBalance] = useState(0n);
  const [totalBalance, setTotalBalance] = useState(0n);
  const [minVoteBalance, setMinVoteBalance] = useState(0n);
  const [executionDelay, setExecutionDelay] = useState(0n);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!dao || !address) return;
    const [ub, tb, mvb, delay] = (await Promise.all([
      dao.getUserBalance(address),
      dao.getTotalBalance(),
      dao.minVoteBalance(),
      dao.executionDelay(),
    ])) as [bigint, bigint, bigint, bigint];
    setUserBalance(ub);
    setTotalBalance(tb);
    setMinVoteBalance(mvb);
    setExecutionDelay(delay);
  }, [dao, address]);

  const fetchProposals = useCallback(async () => {
    if (!dao) return;
    const events = await dao.queryFilter(dao.filters.ProposalCreated());
    const ids = Array.from(
      new Set(
        events.map((e) => {
          const args = (e as unknown as { args: { id: bigint } }).args;
          return args.id;
        })
      )
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const results = await Promise.all(
      ids.map(async (id) => {
        const raw = (await dao.getProposal(id)) as unknown as RawProposal;
        const userVote = address
          ? (Number(await dao.getUserVote(id, address)) as VoteType)
          : VoteType.None;
        return { ...toProposal(raw), userVote };
      })
    );
    setProposals(results);
  }, [dao, address]);

  const fetchExecutionLog = useCallback(async () => {
    if (!dao) return;
    const events = await dao.queryFilter(dao.filters.ProposalExecuted());
    const entries = await Promise.all(
      events.map(async (e) => {
        const args = (
          e as unknown as {
            args: { id: bigint; recipient: string; amount: bigint; executor: string };
          }
        ).args;
        const block = await e.getBlock();
        const isAutomatic = RELAYER_ADDRESS.length > 0 && args.executor.toLowerCase() === RELAYER_ADDRESS.toLowerCase();
        return {
          proposalId: args.id,
          recipient: args.recipient,
          amount: args.amount,
          executor: args.executor,
          isAutomatic,
          txHash: e.transactionHash,
          timestamp: block.timestamp,
        } satisfies ExecutionLogEntry;
      })
    );
    entries.sort((a, b) => b.timestamp - a.timestamp);
    setExecutionLog(entries);
  }, [dao]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchBalances(), fetchProposals(), fetchExecutionLog()]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchBalances, fetchProposals, fetchExecutionLog]);

  useEffect(() => {
    if (!dao) {
      setUserBalance(0n);
      setTotalBalance(0n);
      setMinVoteBalance(0n);
      setExecutionDelay(0n);
      setProposals([]);
      setExecutionLog([]);
      return;
    }
    refresh();

    const onEvent = () => refresh();
    dao.on("Funded", onEvent);
    dao.on("ProposalCreated", onEvent);
    dao.on("VoteCast", onEvent);
    dao.on("ProposalExecuted", onEvent);

    const interval = setInterval(refresh, 8000);

    return () => {
      dao.off("Funded", onEvent);
      dao.off("ProposalCreated", onEvent);
      dao.off("VoteCast", onEvent);
      dao.off("ProposalExecuted", onEvent);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dao]);

  const fundDAO = useCallback(
    async (amountEth: string) => {
      if (!dao) throw new Error("Conecta tu wallet primero");
      const tx = await dao.fundDAO({ value: parseEther(amountEth) });
      const receipt = await tx.wait();
      await refresh();
      return receipt.hash as string;
    },
    [dao, refresh]
  );

  const createProposal = useCallback(
    async (recipient: string, amountEth: string, deadlineUnix: number, description: string) => {
      if (!dao) throw new Error("Conecta tu wallet primero");
      const tx = await dao.createProposal(
        recipient,
        parseEther(amountEth),
        BigInt(deadlineUnix),
        description
      );
      const receipt = await tx.wait();
      await refresh();
      return receipt.hash as string;
    },
    [dao, refresh]
  );

  const voteGasless = useCallback(
    async (proposalId: bigint, voteType: VoteType) => {
      if (!dao || !forwarder || !signer) throw new Error("Conecta tu wallet primero");
      const { request, signature } = await signVoteRequest(signer, dao, forwarder, proposalId, voteType);
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, signature }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "El relayer rechazó la meta-transacción");
      }
      await refresh();
      return body.txHash as string;
    },
    [dao, forwarder, signer, refresh]
  );

  const executeProposalManually = useCallback(
    async (proposalId: bigint) => {
      if (!dao) throw new Error("Conecta tu wallet primero");
      const tx = await dao.executeProposal(proposalId);
      const receipt = await tx.wait();
      await refresh();
      return receipt.hash as string;
    },
    [dao, refresh]
  );

  const skipWaitPeriod = useCallback(
    async (proposalId: bigint) => {
      const res = await fetch("/api/dev/advance-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposalId.toString() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "No se pudo avanzar el tiempo");
      }
      await refresh();
      return body.message as string;
    },
    [refresh]
  );

  const value: DaoContextValue = {
    userBalance,
    totalBalance,
    minVoteBalance,
    executionDelay,
    proposals,
    executionLog,
    isLoading,
    refresh,
    fundDAO,
    createProposal,
    voteGasless,
    executeProposalManually,
    skipWaitPeriod,
  };

  return <DaoContext.Provider value={value}>{children}</DaoContext.Provider>;
}

export function useDao() {
  const ctx = useContext(DaoContext);
  if (!ctx) throw new Error("useDao debe usarse dentro de <DaoProvider>");
  return ctx;
}
