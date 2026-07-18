"use client";

import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { VoteType } from "@/lib/format";
import { ThumbsUpIcon, ThumbsDownIcon, MinusCircleIcon } from "./icons";

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

  const canVote = !!address && userBalance >= minVoteBalance;

  const handleVote = (voteType: VoteType) => async () => {
    await run(async () => {
      const hash = await voteGasless(proposalId, voteType);
      return `Voto registrado sin gas (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {VOTABLE_TYPES.map((vt) => {
          const { label, Icon, active } = VOTE_CONFIG[vt];
          return (
            <button
              key={vt}
              onClick={handleVote(vt)}
              disabled={!canVote || state === "pending"}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                currentVote === vt
                  ? active
                  : "border border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
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
      {state === "pending" && (
        <p className="mt-1 text-xs text-slate-500">Firmando y enviando al relayer...</p>
      )}
      {state === "success" && <p className="mt-1 text-xs text-emerald-600">{message}</p>}
      {state === "error" && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}
