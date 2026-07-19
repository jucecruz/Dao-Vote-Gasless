"use client";

// Lists every proposal the DAO has ever had (see DaoContext.fetchProposals
// for how that list is assembled from on-chain events), newest first.

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

  // Always newest-first (highest id first), regardless of the order
  // DaoContext happens to fetch them in.
  const sorted = [...proposals].sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Propuestas</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => (
          <ProposalCard key={p.id.toString()} proposal={p} />
        ))}
      </div>
    </section>
  );
}
