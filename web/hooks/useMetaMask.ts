"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

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

  const refresh = useCallback(async (browserProvider: BrowserProvider) => {
    const network = await browserProvider.getNetwork();
    setChainId(Number(network.chainId));

    const accounts = await browserProvider.listAccounts();
    if (accounts.length === 0) {
      setAddress(null);
      setSigner(null);
      return;
    }
    const s = await browserProvider.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
  }, []);

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
