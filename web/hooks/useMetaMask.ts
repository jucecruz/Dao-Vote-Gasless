"use client";

// Low-level MetaMask connection hook: wraps the browser's injected
// `window.ethereum` provider (EIP-1193) with ethers.js and exposes plain
// React state. `context/WalletContext.tsx` wraps this in a Context so any
// component in the tree can read the connected wallet via `useWallet()`.

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

// Minimal typing for the object MetaMask (and other wallets) inject as
// `window.ethereum`. We only declare the methods this hook actually uses.
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function useMetaMask() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-reads the current network + account from an existing provider and
  // updates state. Called both right after connecting and whenever
  // MetaMask reports the account/network changed underneath us.
  const refresh = useCallback(async (browserProvider: BrowserProvider) => {
    const network = await browserProvider.getNetwork();
    setChainId(Number(network.chainId));

    const accounts = await browserProvider.listAccounts();
    if (accounts.length === 0) {
      // Wallet installed but not connected/authorized for this site.
      setAddress(null);
      setSigner(null);
      return;
    }
    const s = await browserProvider.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
  }, []);

  // Triggers MetaMask's "connect" popup. Only needs to be called once per
  // browser session — after the user approves, `window.ethereum` remembers
  // the authorization and the effect below reconnects silently on reload.
  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask no está instalado");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      setProvider(browserProvider);
      await refresh(browserProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar la wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const ethereum = window.ethereum;

    // Reconnect silently if the site is already authorized from a previous session.
    const initialProvider = new BrowserProvider(ethereum);
    initialProvider.listAccounts().then((accounts) => {
      if (accounts.length > 0) {
        setProvider(initialProvider);
        refresh(initialProvider);
      }
    });

    // MetaMask fires these events when the user switches accounts or
    // networks in the extension UI, *without* reloading the page — without
    // this listener the app would keep showing stale wallet/chain info
    // until a manual refresh.
    const handleChange = () => {
      const p = new BrowserProvider(ethereum);
      setProvider(p);
      refresh(p);
    };

    ethereum.on("accountsChanged", handleChange);
    ethereum.on("chainChanged", handleChange);

    return () => {
      ethereum.removeListener("accountsChanged", handleChange);
      ethereum.removeListener("chainChanged", handleChange);
    };
  }, [refresh]);

  return { address, chainId, provider, signer, connect, isConnecting, error };
}
