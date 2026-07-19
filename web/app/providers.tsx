"use client";

// Split into its own client component (rather than making app/layout.tsx
// itself a client component) because Next.js's App Router server
// components can't use React Context providers directly — this is the
// standard pattern for wiring up client-side providers under a server
// component root layout. DaoProvider is nested inside WalletProvider
// because it needs the connected wallet's signer/address to build its
// contract instances (see context/DaoContext.tsx).

import { ReactNode } from "react";
import { WalletProvider } from "@/context/WalletContext";
import { DaoProvider } from "@/context/DaoContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <DaoProvider>{children}</DaoProvider>
    </WalletProvider>
  );
}
