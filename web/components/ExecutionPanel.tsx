"use client";

// Collapsed-by-default panel (kept out of the way — see the outer
// <details> below) holding everything that isn't part of the core
// "vote on a proposal" flow, so it doesn't confuse users browsing the
// proposal cards:
//  1. Proposals still "Activa", with the dev-only "Saltar espera" button
//     (fast-forwards the local chain's clock — see SkipWaitButton).
//  2. Proposals "Aprobada" but still inside the extra security window,
//     with a live countdown and the same skip button.
//  3. Proposals "Aprobada" and actually executable right now — button to
//     execute directly from the connected wallet.
//  4. A collapsible log of every proposal that's already been executed,
//     labeled "Automática" (the background daemon did it) or "Manual"
//     (a member clicked "Ejecutar ahora" here) based on who called
//     executeProposal() on-chain.

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { formatEth, formatDeadline, getProposalStatus, timeAgo, shortenAddress } from "@/lib/format";
import { PlayIcon, ChevronDownIcon, FastForwardIcon } from "./icons";

// DEV/DEMO ONLY — fast-forwards the local Anvil chain's clock past
// whatever this proposal is currently waiting on (its voting deadline,
// or its post-deadline security window). See DaoContext.skipWaitPeriod
// and app/api/dev/advance-time/route.ts for what this actually does.
// Does nothing useful (and nothing harmful) against a real network.
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
    <div>
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

// A proposal still open for voting — nothing to execute yet, just the
// dev shortcut to jump straight to its deadline.
function ActiveRow({
  proposalId,
  recipient,
  amount,
  deadline,
}: {
  proposalId: bigint;
  recipient: string;
  amount: bigint;
  deadline: bigint;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium text-slate-900">Propuesta #{proposalId.toString()}</p>
        <p className="text-slate-500">
          {formatEth(amount)} → <span className="font-mono">{shortenAddress(recipient)}</span>
        </p>
        <p className="text-slate-400">Deadline: {formatDeadline(deadline)}</p>
      </div>
      <SkipWaitButton proposalId={proposalId} />
    </div>
  );
}

// One approved-and-executable proposal, with a button to execute it
// directly from the connected wallet (a normal transaction — the caller
// pays their own gas; this bypasses waiting for the daemon's next poll).
function ExecuteRow({
  proposalId,
  recipient,
  amount,
}: {
  proposalId: bigint;
  recipient: string;
  amount: bigint;
}) {
  const { address } = useWallet();
  const { executeProposalManually } = useDao();
  const { state, message, run } = useTxStatus(address);

  const handleExecute = async () => {
    await run(async () => {
      const hash = await executeProposalManually(proposalId);
      return `Ejecutada (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium text-slate-900">Propuesta #{proposalId.toString()}</p>
        <p className="text-slate-500">
          {formatEth(amount)} → <span className="font-mono">{shortenAddress(recipient)}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {state === "error" && <span className="text-xs text-red-600">{message}</span>}
        <button
          onClick={handleExecute}
          disabled={state === "pending"}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          <PlayIcon className="h-3.5 w-3.5" />
          {state === "pending" ? "Ejecutando..." : "Ejecutar ahora"}
        </button>
      </div>
    </div>
  );
}

// An approved proposal that's not executable *yet* — deadline has passed
// but the extra `executionDelay` security window hasn't. Shows a live
// countdown, plus the dev shortcut to skip straight past it.
function WaitingRow({
  proposalId,
  recipient,
  amount,
  availableAt,
  now,
}: {
  proposalId: bigint;
  recipient: string;
  amount: bigint;
  availableAt: number;
  now: number;
}) {
  const secondsLeft = Math.max(0, availableAt - now);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium text-slate-900">Propuesta #{proposalId.toString()}</p>
        <p className="text-slate-500">
          {formatEth(amount)} → <span className="font-mono">{shortenAddress(recipient)}</span>
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
          Disponible en {secondsLeft}s (período de seguridad)
        </span>
        <SkipWaitButton proposalId={proposalId} />
      </div>
    </div>
  );
}

export function ExecutionPanel() {
  const { proposals, executionLog, executionDelay, chainTimestamp } = useDao();
  // See the same max(reloj real, reloj de la cadena) note in ProposalCard —
  // necesario para que "Aprobada"/ejecutable no dependa solo del reloj del
  // navegador, que puede quedar detrás del reloj de la cadena tras usar
  // "Saltar espera" en cualquier propuesta.
  const [now, setNow] = useState(() => Math.max(Math.floor(Date.now() / 1000), chainTimestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.max(Math.floor(Date.now() / 1000), chainTimestamp));
    }, 1000);
    return () => clearInterval(interval);
  }, [chainTimestamp]);

  const active = proposals.filter((p) => getProposalStatus(p, now) === "Activa");

  // "Aprobada" (per getProposalStatus) only means the deadline passed and
  // votesFor > votesAgainst — it does *not* mean executeProposal() would
  // actually succeed yet, since the contract also enforces the extra
  // `executionDelay` window on top of the deadline. Split the approved
  // proposals here so we don't show an "Ejecutar ahora" button that would
  // just revert with "too early to execute".
  const approved = proposals.filter((p) => getProposalStatus(p, now) === "Aprobada");
  const executable = approved.filter((p) => now > Number(p.deadline) + Number(executionDelay));
  const waiting = approved.filter((p) => now <= Number(p.deadline) + Number(executionDelay));

  const nothingPending = active.length === 0 && executable.length === 0 && waiting.length === 0;

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ejecución de propuestas</h2>
          <p className="text-xs text-slate-500">
            Ejecución manual, atajos de demo y log de ejecuciones automáticas/manuales
          </p>
        </div>
        <div className="flex items-center gap-2">
          {executable.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {executable.length} pendiente{executable.length > 1 ? "s" : ""}
            </span>
          )}
          <ChevronDownIcon className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-slate-200 p-6">
        <div className="flex flex-col gap-2">
          {nothingPending ? (
            <p className="text-sm text-slate-500">No hay propuestas pendientes de ejecución.</p>
          ) : (
            <>
              {executable.map((p) => (
                <ExecuteRow key={p.id.toString()} proposalId={p.id} recipient={p.recipient} amount={p.amount} />
              ))}
              {waiting.map((p) => (
                <WaitingRow
                  key={p.id.toString()}
                  proposalId={p.id}
                  recipient={p.recipient}
                  amount={p.amount}
                  availableAt={Number(p.deadline) + Number(executionDelay)}
                  now={now}
                />
              ))}
              {active.map((p) => (
                <ActiveRow
                  key={p.id.toString()}
                  proposalId={p.id}
                  recipient={p.recipient}
                  amount={p.amount}
                  deadline={p.deadline}
                />
              ))}
            </>
          )}
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Log de ejecuciones</h3>
        {executionLog.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se ejecutó ninguna propuesta.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Each entry is its own collapsible <details>, nested inside
                the panel's outer <details>. It's named "group/entry"
                (rather than the outer's plain "group") so its own chevron
                only reacts to *this* entry expanding, not to the whole
                panel opening — Tailwind's `group-open/entry:` scopes the
                variant to the nearest ancestor named "entry". */}
            {executionLog.map((entry) => (
              <details key={entry.txHash} className="group/entry rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm marker:content-none">
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.isAutomatic ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.isAutomatic ? "Automática" : "Manual"}
                    </span>
                    <span className="font-medium text-slate-900">Propuesta #{entry.proposalId.toString()}</span>
                    <span className="text-slate-500">{formatEth(entry.amount)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-slate-400">
                    {timeAgo(entry.timestamp)}
                    <ChevronDownIcon className="h-4 w-4 transition-transform group-open/entry:rotate-180" />
                  </span>
                </summary>
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
                  <p>
                    Beneficiario: <span className="font-mono">{entry.recipient}</span>
                  </p>
                  <p>
                    Ejecutor: <span className="font-mono">{entry.executor}</span>
                  </p>
                  <p>
                    Tx: <span className="font-mono">{entry.txHash}</span>
                  </p>
                  <p>{new Date(entry.timestamp * 1000).toLocaleString()}</p>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
