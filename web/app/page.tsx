import { ConnectWallet } from "@/components/ConnectWallet";
import { HowItWorks } from "@/components/HowItWorks";
import { FundingPanel } from "@/components/FundingPanel";
import { CreateProposal } from "@/components/CreateProposal";
import { ProposalList } from "@/components/ProposalList";
import { ExecutionPanel } from "@/components/ExecutionPanel";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10">
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
