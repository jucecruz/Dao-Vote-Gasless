"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

export type TxState = "idle" | "pending" | "success" | "error";

/**
 * `resetKey` clears any stale success/error message when it changes — pass
 * the connected wallet address so switching accounts in MetaMask doesn't
 * leave a previous account's "voto registrado" message stuck on screen.
 */
export function useTxStatus(resetKey?: unknown) {
  const [state, setState] = useState<TxState>("idle");
  const [message, setMessage] = useState<string>("");

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [resetKey]);

  const run = useCallback(async (fn: () => Promise<string>) => {
    setState("pending");
    setMessage("");
    try {
      const successMessage = await fn();
      setState("success");
      setMessage(successMessage);
    } catch (err) {
      setState("error");
      setMessage(extractErrorMessage(err));
    }
  }, []);

  return { state, message, run, reset };
}
