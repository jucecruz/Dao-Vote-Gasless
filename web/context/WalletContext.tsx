"use client";

// Makes the wallet connection (from useMetaMask) available to every
// component via React Context, instead of each component calling
// useMetaMask() separately — which would each create an independent,
// out-of-sync copy of the connection state. Mounted once in
// app/providers.tsx, wrapping the whole app.

import { createContext, useContext, ReactNode } from "react";
import { useMetaMask } from "@/hooks/useMetaMask";
import { CHAIN_ID } from "@/lib/config";

type WalletContextValue = ReturnType<typeof useMetaMask> & { isCorrectChain: boolean };

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useMetaMask();
  // `chainId === null` means "we don't know yet" (not connected) — treated
  // as "fine" rather than flagging a mismatch before we've even checked.
  const isCorrectChain = wallet.chainId === null || wallet.chainId === CHAIN_ID;

  return (
    <WalletContext.Provider value={{ ...wallet, isCorrectChain }}>
      {children}
    </WalletContext.Provider>
  );
}

/** Access the connected wallet's address/signer/chain from any component. */
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  return ctx;
}
