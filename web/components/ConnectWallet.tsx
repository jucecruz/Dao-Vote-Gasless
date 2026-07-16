"use client";

import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { shortenAddress, formatEth } from "@/lib/format";
import { CHAIN_ID } from "@/lib/config";

export function ConnectWallet() {
  const { address, chainId, isCorrectChain, connect, isConnecting, error } = useWallet();
  const { userBalance } = useDao();

  if (!address) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={connect}
          disabled={isConnecting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {isConnecting ? "Conectando..." : "Conectar MetaMask"}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-mono text-sm">{shortenAddress(address)}</span>
      </div>
      <span className="text-xs text-neutral-500">Balance en el DAO: {formatEth(userBalance)}</span>
      {!isCorrectChain && (
        <span className="text-xs text-red-500">
          Red incorrecta (conectado a {chainId}, se espera {CHAIN_ID})
        </span>
      )}
    </div>
  );
}
