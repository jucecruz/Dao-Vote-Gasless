"use client";

import { createContext, useContext, ReactNode } from "react";
import { useMetaMask } from "@/hooks/useMetaMask";
import { CHAIN_ID } from "@/lib/config";

type WalletContextValue = ReturnType<typeof useMetaMask> & { isCorrectChain: boolean };

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useMetaMask();
  const isCorrectChain = wallet.chainId === null || wallet.chainId === CHAIN_ID;

  return (
    <WalletContext.Provider value={{ ...wallet, isCorrectChain }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  return ctx;
}
