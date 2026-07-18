"use client";

import { useDao } from "@/context/DaoContext";
import { ProposalCard } from "./ProposalCard";

export function ProposalList() {
  const { proposals, isLoading } = useDao();

  if (proposals.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Propuestas</h2>
        <p className="text-sm text-slate-500">
          {isLoading ? "Cargando propuestas..." : "Todavía no hay propuestas."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Propuestas</h2>
      <div className="flex flex-col gap-4">
        {[...proposals].reverse().map((p) => (
          <ProposalCard key={p.id.toString()} proposal={p} />
        ))}
      </div>
    </section>
  );
}
