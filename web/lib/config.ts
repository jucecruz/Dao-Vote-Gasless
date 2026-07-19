// Central place for all NEXT_PUBLIC_* env vars used by client-side code.
// Only NEXT_PUBLIC_-prefixed vars are ever sent to the browser by Next.js —
// server-only secrets (RELAYER_PRIVATE_KEY, RPC_URL) are read directly
// where they're needed (app/api/relay/route.ts, scripts/daemon.mjs) and
// must never be imported from a file like this one.
export const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "";
export const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS ?? "";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
// Public address (not the private key) of the relayer wallet the daemon
// and /api/relay use. Safe to expose — it's only used client-side to
// label execution-log entries as "automatic" (this address) vs "manual"
// (any other address) in <ExecutionPanel>.
export const RELAYER_ADDRESS = process.env.NEXT_PUBLIC_RELAYER_ADDRESS ?? "";

// Must match the `name`/`version` MinimalForwarder passes to its EIP712
// constructor (see sc/src/MinimalForwarder.sol) — these values are part of
// the signed typed-data domain, so a mismatch here would make every
// gasless-vote signature invalid (signed for a different "domain").
export const FORWARDER_DOMAIN_NAME = "MinimalForwarder";
export const FORWARDER_DOMAIN_VERSION = "0.0.1";

// Fail loudly (in the browser console) rather than silently if the app was
// started without the contract addresses configured — every on-chain read
// and write in this app depends on them.
if (typeof window !== "undefined" && (!DAO_ADDRESS || !FORWARDER_ADDRESS)) {
  console.warn(
    "Faltan NEXT_PUBLIC_DAO_ADDRESS / NEXT_PUBLIC_FORWARDER_ADDRESS en .env.local"
  );
}
