"use client";

import { useState, FormEvent } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";
import { formatEth } from "@/lib/format";

export function FundingPanel() {
  const { address } = useWallet();
  const { userBalance, totalBalance, fundDAO } = useDao();
  const [amount, setAmount] = useState("");
  const { state, message, run } = useTxStatus();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const hash = await fundDAO(amount);
      setAmount("");
      return `Depósito confirmado (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <section className="rounded-xl border border-neutral-800 p-5">
      <h2 className="mb-3 text-lg font-semibold">Financiación del DAO</h2>
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-neutral-500">Tu balance en el DAO</p>
          <p className="font-mono">{formatEth(userBalance)}</p>
        </div>
        <div>
          <p className="text-neutral-500">Balance total del DAO</p>
          <p className="font-mono">{formatEth(totalBalance)}</p>
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
          className="flex-1 rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!address || state === "pending" || !amount}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {state === "pending" ? "Enviando..." : "Depositar"}
        </button>
      </form>
      {state === "success" && <p className="mt-2 text-sm text-emerald-500">{message}</p>}
      {state === "error" && <p className="mt-2 text-sm text-red-500">{message}</p>}
    </section>
  );
}
