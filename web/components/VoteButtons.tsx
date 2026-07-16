"use client";

import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { VoteType } from "@/lib/format";

const VOTE_LABELS: Record<number, string> = {
  [VoteType.For]: "A favor",
  [VoteType.Against]: "En contra",
  [VoteType.Abstain]: "Abstención",
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
  const { state, message, run } = useTxStatus();

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
        {VOTABLE_TYPES.map((vt) => (
          <button
            key={vt}
            onClick={handleVote(vt)}
            disabled={!canVote || state === "pending"}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              currentVote === vt
                ? "bg-indigo-600 text-white"
                : "border border-neutral-700 hover:bg-neutral-800"
            }`}
          >
            {VOTE_LABELS[vt]}
          </button>
        ))}
      </div>
      {!canVote && address && (
        <p className="mt-1 text-xs text-amber-500">
          Necesitas depositar al menos el balance mínimo para votar.
        </p>
      )}
      {state === "pending" && (
        <p className="mt-1 text-xs text-neutral-400">Firmando y enviando al relayer...</p>
      )}
      {state === "success" && <p className="mt-1 text-xs text-emerald-500">{message}</p>}
      {state === "error" && <p className="mt-1 text-xs text-red-500">{message}</p>}
    </div>
  );
}
