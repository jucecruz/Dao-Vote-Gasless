import { ConnectWallet } from "@/components/ConnectWallet";
import { FundingPanel } from "@/components/FundingPanel";
import { CreateProposal } from "@/components/CreateProposal";
import { ProposalList } from "@/components/ProposalList";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">DAO Gasless</h1>
        <ConnectWallet />
      </header>

      <FundingPanel />
      <CreateProposal />
      <ProposalList />
    </div>
  );
}
