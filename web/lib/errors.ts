/**
 * Extracts a human-readable message from a failed contract call/transaction.
 *
 * ethers throws rich error objects, not plain strings — a reverted call
 * (e.g. hitting one of DAOVoting's `require` checks) typically has a
 * `.reason` set to the exact Solidity revert string ("DAOVoting: deadline
 * in past"), which is far more useful to show the user than the generic
 * wrapper error. We fall back to `.shortMessage` and finally `.message`
 * for errors that don't carry a decoded on-chain reason (network errors,
 * user rejecting a wallet prompt, etc.).
 */
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { reason?: unknown; shortMessage?: unknown; message?: unknown };
    if (typeof e.reason === "string" && e.reason) return e.reason;
    if (typeof e.shortMessage === "string" && e.shortMessage) return e.shortMessage;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "Error desconocido";
}
