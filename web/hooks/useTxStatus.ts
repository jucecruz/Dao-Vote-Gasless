"use client";

import { useCallback, useState } from "react";

export type TxState = "idle" | "pending" | "success" | "error";

export function useTxStatus() {
  const [state, setState] = useState<TxState>("idle");
  const [message, setMessage] = useState<string>("");

  const run = useCallback(async (fn: () => Promise<string>) => {
    setState("pending");
    setMessage("");
    try {
      const successMessage = await fn();
      setState("success");
      setMessage(successMessage);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Error desconocido");
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  return { state, message, run, reset };
}
