"use client";

// The app's central hub for everything DAO-related: reading contract
// state (balances, proposals, execution history) and every write action
// a user can take (fund, propose, vote, execute, or the dev-only time
// skip). Every component that touches the DAO goes through `useDao()`
// instead of talking to the contracts directly — that keeps all the
// on-chain read/write logic and polling/refresh behavior in one place.

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

// A Proposal plus "what did *I* (the connected wallet) vote on this one"
// — computed per-proposal per-user, so it's kept separate from the raw
// on-chain Proposal shape.
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

// Shape ethers.js hands back for DAOVoting.getProposal() — matches the
// Solidity `Proposal` struct field-for-field (see sc/src/DAOVoting.sol).
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

// Copies the fields we care about out of ethers' raw decoded result into a
// plain object matching our `Proposal` type (ethers' return value is an
// array-like "Result" object, not a plain object, so spreading it directly
// would carry along numeric-index duplicates of every field).
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

  // Contract instances are rebuilt whenever the connected signer changes
  // (e.g. the user switches accounts in MetaMask) and are `null` while no
  // wallet is connected — every read/write in this file is gated on that,
  // which is why the whole app requires connecting a wallet before showing
  // any DAO data (see the plan's "gate everything behind wallet connection"
  // decision).
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

  // Reads the connected user's balance plus the two DAO-wide constants
  // (minVoteBalance, executionDelay) in one batch of parallel calls.
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

  // The contract has no "list all proposals" view function, so we
  // reconstruct the list by scanning every past `ProposalCreated` event
  // for its id, then fetching each proposal's current (possibly since-
  // updated) state individually via getProposal(). This also picks up
  // each proposal's `userVote` for the connected address.
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

  // Same event-scanning approach as fetchProposals, but for
  // `ProposalExecuted` logs — this builds the "execution log" shown in
  // <ExecutionPanel>. Each event only carries the block number, so we
  // fetch the block itself to get a real timestamp for display.
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
        // Automatic (daemon) executions come from the known relayer
        // wallet; anything else was triggered manually by a member from
        // the UI. See DAOVoting's `ProposalExecuted` event — `executor`
        // is just whichever address happened to call executeProposal().
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

  // Re-fetches everything in parallel. Called after every write action
  // (so the UI reflects the result immediately) and on a polling
  // interval / contract-event listeners below (so it also updates when
  // *other* users' actions change on-chain state).
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchBalances(), fetchProposals(), fetchExecutionLog()]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchBalances, fetchProposals, fetchExecutionLog]);

  // Keeps the UI live without requiring a manual page reload: subscribes
  // to the DAO's events (so an action from *any* user — another tab,
  // another person — triggers a refresh here too) and also polls every 8
  // seconds as a fallback, in case an event notification is ever missed.
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
    // Also re-run on `address` alone (not just `dao`), so switching
    // accounts in MetaMask always tears down the old polling/listeners and
    // immediately re-fetches with the new address — otherwise a stale
    // closure could keep showing the *previous* account's data (e.g. its
    // vote on a proposal) until the next incidental `dao` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dao, address]);

  // Deposits `amountEth` into the DAO. A normal on-chain transaction — the
  // connected wallet pays its own gas and gets a MetaMask confirmation
  // prompt (unlike voting, funding is never gasless).
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

  // Creates a new proposal. Also a normal (non-gasless) transaction — the
  // contract itself enforces the "≥10% of the DAO" eligibility check, this
  // function doesn't duplicate that logic, it just surfaces whatever
  // revert reason comes back if the check fails.
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

  // The gasless voting flow: sign an off-chain meta-transaction (prompts
  // MetaMask's *signature* dialog, not a transaction/gas dialog), then
  // hand it to our own /api/relay endpoint, which submits it on-chain and
  // pays the gas from the relayer wallet. See lib/metaTx.ts and
  // app/api/relay/route.ts for the two halves of this flow.
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

  // Executes an approved proposal directly from the connected wallet
  // (paying its own gas) rather than waiting for the background daemon to
  // pick it up. The contract has no access restriction on who may call
  // executeProposal(), so this works for any member, not just the
  // proposer — see DAOVoting.executeProposal in the contract.
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

  // DEV/DEMO ONLY: fast-forwards the local Anvil chain's clock past a
  // proposal's voting deadline + execution delay, so its full lifecycle
  // can be demoed without waiting in real time. Delegates the actual
  // clock manipulation to a server-side route (app/api/dev/advance-time)
  // since browser wallets don't expose Anvil's special testing RPC
  // methods. Does nothing useful against a real network — see that
  // route's docstring for why.
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

/** Access DAO state and actions from any component. */
export function useDao() {
  const ctx = useContext(DaoContext);
  if (!ctx) throw new Error("useDao debe usarse dentro de <DaoProvider>");
  return ctx;
}
