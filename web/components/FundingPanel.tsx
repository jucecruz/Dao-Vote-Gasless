"use client";

import { useState, FormEvent } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { formatEth } from "@/lib/format";
import { DepositIcon } from "./icons";

export function FundingPanel() {
  const { address } = useWallet();
  const { userBalance, totalBalance, fundDAO } = useDao();
  const [amount, setAmount] = useState("");
  const { state, message, run } = useTxStatus(address);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const hash = await fundDAO(amount);
      setAmount("");
      return `Depósito confirmado (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Financiación de las Propuestas</h2>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Saldo Personal DAO</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{formatEth(userBalance)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Disponible DAO</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{formatEth(totalBalance)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="number"
          step="0.0001"
          min="0"
          required
          placeholder="Cantidad en ETH"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!address || state === "pending"}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          type="submit"
          disabled={!address || state === "pending" || !amount}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          <DepositIcon />
          {state === "pending" ? "Enviando..." : "Depositar"}
        </button>
      </form>
      {state === "success" && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      {state === "error" && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </section>
  );
}
