"use client";

import { useState, FormEvent } from "react";
import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { useTxStatus } from "@/hooks/useTxStatus";

export function CreateProposal() {
  const { address } = useWallet();
  const { userBalance, totalBalance, createProposal } = useDao();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const { state, message, run } = useTxStatus(address);

  const meetsThreshold = totalBalance > 0n && userBalance * 10n >= totalBalance;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const deadlineUnix = Math.floor(new Date(deadline).getTime() / 1000);
      const hash = await createProposal(recipient, amount, deadlineUnix, description);
      setRecipient("");
      setAmount("");
      setDeadline("");
      setDescription("");
      return `Propuesta creada (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Crear propuesta</h2>
      {!meetsThreshold && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Necesitas al menos el 10% del balance total del DAO para crear una propuesta.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="recipient" className="mb-1 block text-xs font-medium text-slate-600">
            Dirección del beneficiario
          </label>
          <input
            id="recipient"
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            required
            pattern="^0x[a-fA-F0-9]{40}$"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label htmlFor="amount" className="mb-1 block text-xs font-medium text-slate-600">
            Cantidad en ETH
          </label>
          <input
            id="amount"
            type="number"
            step="0.0001"
            min="0"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label htmlFor="deadline" className="mb-1 block text-xs font-medium text-slate-600">
            Fecha límite de votación
          </label>
          <input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-xs font-medium text-slate-600">
            Descripción de la propuesta
          </label>
          <textarea
            id="description"
            placeholder="Explica para qué se usarán los fondos..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <button
          type="submit"
          disabled={!address || !meetsThreshold || state === "pending"}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {state === "pending" ? "Creando..." : "Crear propuesta"}
        </button>
      </form>
      {state === "success" && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      {state === "error" && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </section>
  );
}
