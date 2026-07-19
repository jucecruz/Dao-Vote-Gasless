"use client";

// The three vote buttons shown on an active proposal's card. Clicking one
// triggers the *gasless* voting flow (DaoContext.voteGasless): the wallet
// only signs a message, no transaction/gas prompt — see lib/metaTx.ts and
// app/api/relay/route.ts for how that signature turns into an on-chain
// vote without the voter paying anything.

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { VoteType } from "@/lib/format";
import { ThumbsUpIcon, ThumbsDownIcon, MinusCircleIcon, SpinnerIcon } from "./icons";

const VOTE_CONFIG: Record<number, { label: string; Icon: typeof ThumbsUpIcon; active: string }> = {
  [VoteType.For]: { label: "A favor", Icon: ThumbsUpIcon, active: "bg-emerald-600 text-white" },
  [VoteType.Against]: { label: "En contra", Icon: ThumbsDownIcon, active: "bg-red-600 text-white" },
  [VoteType.Abstain]: { label: "Abstención", Icon: MinusCircleIcon, active: "bg-slate-600 text-white" },
};

const VOTABLE_TYPES = [VoteType.For, VoteType.Against, VoteType.Abstain] as const;

export function VoteButtons({
  proposalId,
  currentVote,
}: {
  proposalId: bigint;
  currentVote: VoteType;
}) {
  const { address } = useWallet();
  const { userBalance, minVoteBalance, voteGasless } = useDao();
  const { state, message, run } = useTxStatus(address);
  // Which button was clicked, kept "pending" until the vote it submitted
  // is actually confirmed in `currentVote` — NOT just until the relay
  // request's promise resolves. Those aren't the same moment: the relayer
  // confirming the tx and DaoContext finishing its post-vote refresh are
  // two separate steps, and re-enabling the buttons right after the first
  // (before the second finishes) is exactly what let a user click again
  // while the UI still hadn't caught up.
  const [pendingVote, setPendingVote] = useState<VoteType | null>(null);

  useEffect(() => {
    if (pendingVote !== null && (currentVote === pendingVote || state === "error")) {
      setPendingVote(null);
    }
  }, [currentVote, pendingVote, state]);

  // Mirrors DAOVoting.vote()'s `_balances[voter] >= minVoteBalance` check —
  // again, purely to disable the buttons early; the contract enforces this
  // for real.
  const canVote = !!address && userBalance >= minVoteBalance;
  // Busy = the request itself hasn't settled yet, OR it settled but the
  // displayed vote hasn't caught up to match it yet.
  const isBusy = state === "pending" || pendingVote !== null;

  const handleVote = (voteType: VoteType) => async () => {
    setPendingVote(voteType);
    await run(async () => {
      const hash = await voteGasless(proposalId, voteType);
      return `Voto registrado sin gas (tx ${hash.slice(0, 10)}...)`;
    });
    // Deliberately NOT clearing `pendingVote` here — the effect above is
    // the single source of truth for "done", based on the actual data.
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {VOTABLE_TYPES.map((vt) => {
          const { label, Icon, active } = VOTE_CONFIG[vt];
          const isThisPending = pendingVote === vt;
          return (
            <button
              key={vt}
              onClick={handleVote(vt)}
              disabled={!canVote || isBusy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                isThisPending
                  ? `${active} animate-pulse`
                  : currentVote === vt
                    ? active
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isThisPending ? (
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {label}
            </button>
          );
        })}
      </div>
      {!canVote && address && (
        <p className="mt-1 text-xs text-amber-600">
          Necesitas depositar al menos el balance mínimo para votar.
        </p>
      )}
      {isBusy && (
        <p className="mt-1 text-xs text-slate-500">
          {state === "pending" ? "Firmando y enviando al relayer..." : "Actualizando..."}
        </p>
      )}
      {!isBusy && state === "success" && <p className="mt-1 text-xs text-emerald-600">{message}</p>}
      {state === "error" && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}
