"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { ProposalView, useDao } from "@/context/DaoContext";
import { formatEth, formatDeadline, getProposalStatus, VoteType, ProposalStatus } from "@/lib/format";
import { useTxStatus } from "@/hooks/useTxStatus";
import { VoteButtons } from "./VoteButtons";
import { ThumbsUpIcon, ThumbsDownIcon, MinusCircleIcon, FastForwardIcon } from "./icons";

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Activa: "bg-blue-100 text-blue-700",
  Aprobada: "bg-emerald-100 text-emerald-700",
  Rechazada: "bg-red-100 text-red-700",
  Ejecutada: "bg-slate-800 text-white",
};

const VOTE_LABELS: Record<number, string> = {
  [VoteType.For]: "A favor",
  [VoteType.Against]: "En contra",
  [VoteType.Abstain]: "Abstención",
};

function SkipWaitButton({ proposalId }: { proposalId: bigint }) {
  const { address } = useWallet();
  const { skipWaitPeriod } = useDao();
  const { state, message, run } = useTxStatus(address);

  const handleSkip = async () => {
    await run(async () => {
      await skipWaitPeriod(proposalId);
      return "Tiempo de espera saltado";
    });
  };

  return (
    <div className="mt-2">
      <button
        onClick={handleSkip}
        disabled={state === "pending"}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
        title="Solo funciona en una red de pruebas local (Anvil) — adelanta el reloj de la cadena."
      >
        <FastForwardIcon className="h-3.5 w-3.5" />
        {state === "pending" ? "Saltando..." : "Saltar espera (demo local)"}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const status = getProposalStatus(proposal, now);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Propuesta #{proposal.id.toString()}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </div>
      {proposal.description && (
        <p className="mb-3 text-sm text-slate-700">{proposal.description}</p>
      )}
      <p className="text-sm text-slate-500">
        Beneficiario: <span className="font-mono">{proposal.recipient}</span>
      </p>
      <p className="text-sm text-slate-500">Monto: {formatEth(proposal.amount)}</p>
      <p className="text-sm text-slate-500">Deadline: {formatDeadline(proposal.deadline)}</p>
      <div className="mt-3 flex gap-4 text-sm text-slate-700">
        <span className="flex items-center gap-1">
          <ThumbsUpIcon className="h-4 w-4 text-emerald-600" />
          {proposal.votesFor.toString()}
        </span>
        <span className="flex items-center gap-1">
          <ThumbsDownIcon className="h-4 w-4 text-red-600" />
          {proposal.votesAgainst.toString()}
        </span>
        <span className="flex items-center gap-1">
          <MinusCircleIcon className="h-4 w-4 text-slate-400" />
          {proposal.votesAbstain.toString()}
        </span>
      </div>
      {proposal.userVote !== VoteType.None && (
        <p className="mt-2 text-xs font-medium text-teal-700">Tu voto actual: {VOTE_LABELS[proposal.userVote]}</p>
      )}
      {status === "Activa" && <VoteButtons proposalId={proposal.id} currentVote={proposal.userVote} />}
      {status !== "Ejecutada" && <SkipWaitButton proposalId={proposal.id} />}
    </div>
  );
}
