"use client";

// Compact reference strip showing the local test chain's own clock
// (Anvil's last mined block timestamp) — this is the clock DAOVoting
// actually checks deadlines against, which can differ from real time
// (e.g. after using "Saltar espera" in ExecutionPanel).

import { useDao } from "@/context/DaoContext";
import { ClockIcon } from "./icons";

export function ChainClock() {
  const { chainTimestamp } = useDao();

  // No data yet (wallet not connected / nothing fetched) — nothing useful
  // to show.
  if (chainTimestamp === 0) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
      <ClockIcon className="h-3.5 w-3.5" />
      Hora de la cadena (Anvil):{" "}
      <span className="font-mono">{new Date(chainTimestamp * 1000).toLocaleString()}</span>
    </div>
  );
}
