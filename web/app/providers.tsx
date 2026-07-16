"use client";

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
