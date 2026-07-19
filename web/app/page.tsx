// The single-page dashboard. A server component (no "use client") that
// just lays out the client components — all the interactivity/state
// lives inside them and in the providers wrapping this page (see
// app/providers.tsx). Order here is also the visual order: funding and
// proposal creation come first since they're the primary actions, the
// onboarding guide and proposal list come after, and the admin-ish
// execution panel is last since it's collapsed by default.

import { ConnectWallet } from "@/components/ConnectWallet";
import { HowItWorks } from "@/components/HowItWorks";
import { FundingPanel } from "@/components/FundingPanel";
import { CreateProposal } from "@/components/CreateProposal";
import { ProposalList } from "@/components/ProposalList";
import { ExecutionPanel } from "@/components/ExecutionPanel";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Votación de Propuestas DAO</h1>
        <ConnectWallet />
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FundingPanel />
        <CreateProposal />
      </div>

      <HowItWorks />

      <ProposalList />
      <ExecutionPanel />
    </div>
  );
}
