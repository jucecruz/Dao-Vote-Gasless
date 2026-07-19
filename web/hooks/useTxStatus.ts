"use client";

// Small reusable state machine for "run an async wallet action and show
// its outcome" — used by every button that funds the DAO, creates/votes
// on/executes a proposal, etc. (FundingPanel, CreateProposal, VoteButtons,
// ExecutionPanel, ProposalCard). Keeping this in one hook avoids repeating
// the same pending/success/error + message plumbing in every component.

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

  // Wraps an async action (e.g. "sign and send a vote") with the
  // pending/success/error bookkeeping. `fn` should resolve to the success
  // message to display (e.g. including a shortened tx hash), or throw/
  // reject — the thrown error is passed through extractErrorMessage() to
  // turn ethers' verbose error objects into a readable string.
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
