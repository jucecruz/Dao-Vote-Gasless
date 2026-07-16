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
  const { state, message, run } = useTxStatus();

  const meetsThreshold = totalBalance > 0n && userBalance * 10n >= totalBalance;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const deadlineUnix = Math.floor(new Date(deadline).getTime() / 1000);
      const hash = await createProposal(recipient, amount, deadlineUnix);
      setRecipient("");
      setAmount("");
      setDeadline("");
      return `Propuesta creada (tx ${hash.slice(0, 10)}...)`;
    });
  };

  return (
    <section className="rounded-xl border border-neutral-800 p-5">
      <h2 className="mb-3 text-lg font-semibold">Crear propuesta</h2>
      {!meetsThreshold && (
        <p className="mb-3 text-sm text-amber-500">
          Necesitas al menos el 10% del balance total del DAO para crear una propuesta.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Dirección del beneficiario (0x...)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
          pattern="^0x[a-fA-F0-9]{40}$"
          className="rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.0001"
          min="0"
          placeholder="Cantidad en ETH"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!address || !meetsThreshold || state === "pending"}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {state === "pending" ? "Creando..." : "Crear propuesta"}
        </button>
      </form>
      {state === "success" && <p className="mt-2 text-sm text-emerald-500">{message}</p>}
      {state === "error" && <p className="mt-2 text-sm text-red-500">{message}</p>}
    </section>
  );
}
