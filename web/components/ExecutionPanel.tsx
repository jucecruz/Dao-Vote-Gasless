"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { formatEth, getProposalStatus, timeAgo, shortenAddress } from "@/lib/format";
import { PlayIcon, ChevronDownIcon } from "./icons";

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
      <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
        Disponible en {secondsLeft}s (período de seguridad)
      </span>
    </div>
  );
}

export function ExecutionPanel() {
  const { proposals, executionLog, executionDelay } = useDao();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const approved = proposals.filter((p) => getProposalStatus(p, now) === "Aprobada");
  const executable = approved.filter((p) => now > Number(p.deadline) + Number(executionDelay));
  const waiting = approved.filter((p) => now <= Number(p.deadline) + Number(executionDelay));

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ejecución de propuestas</h2>
          <p className="text-xs text-slate-500">Ejecución manual y log de ejecuciones automáticas/manuales</p>
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
          {executable.length === 0 && waiting.length === 0 ? (
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
            </>
          )}
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Log de ejecuciones</h3>
        {executionLog.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se ejecutó ninguna propuesta.</p>
        ) : (
          <div className="flex flex-col gap-2">
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
