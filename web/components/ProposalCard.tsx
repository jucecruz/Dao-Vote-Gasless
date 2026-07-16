"use client";

import { useEffect, useState } from "react";
import { ProposalView } from "@/context/DaoContext";
import { formatEth, formatDeadline, getProposalStatus, VoteType, ProposalStatus } from "@/lib/format";
import { VoteButtons } from "./VoteButtons";

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Activa: "bg-blue-500/15 text-blue-400",
  Aprobada: "bg-emerald-500/15 text-emerald-400",
  Rechazada: "bg-red-500/15 text-red-400",
  Ejecutada: "bg-neutral-500/15 text-neutral-300",
};

const VOTE_LABELS: Record<number, string> = {
  [VoteType.For]: "A favor",
  [VoteType.Against]: "En contra",
  [VoteType.Abstain]: "Abstención",
};

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const status = getProposalStatus(proposal, now);

  return (
    <div className="rounded-xl border border-neutral-800 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Propuesta #{proposal.id.toString()}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </div>
      <p className="text-sm text-neutral-400">
        Beneficiario: <span className="font-mono">{proposal.recipient}</span>
      </p>
      <p className="text-sm text-neutral-400">Monto: {formatEth(proposal.amount)}</p>
      <p className="text-sm text-neutral-400">Deadline: {formatDeadline(proposal.deadline)}</p>
      <div className="mt-3 flex gap-4 text-sm">
        <span>A favor: {proposal.votesFor.toString()}</span>
        <span>En contra: {proposal.votesAgainst.toString()}</span>
        <span>Abstención: {proposal.votesAbstain.toString()}</span>
      </div>
      {proposal.userVote !== VoteType.None && (
        <p className="mt-2 text-xs text-indigo-400">Tu voto actual: {VOTE_LABELS[proposal.userVote]}</p>
      )}
      {status === "Activa" && <VoteButtons proposalId={proposal.id} currentVote={proposal.userVote} />}
    </div>
  );
}
