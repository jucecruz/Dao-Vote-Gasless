/** Extracts a human-readable message from an ethers error, preferring the on-chain revert reason. */
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { reason?: unknown; shortMessage?: unknown; message?: unknown };
    if (typeof e.reason === "string" && e.reason) return e.reason;
    if (typeof e.shortMessage === "string" && e.shortMessage) return e.shortMessage;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "Error desconocido";
}
