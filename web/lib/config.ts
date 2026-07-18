export const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "";
export const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS ?? "";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
export const RELAYER_ADDRESS = process.env.NEXT_PUBLIC_RELAYER_ADDRESS ?? "";

export const FORWARDER_DOMAIN_NAME = "MinimalForwarder";
export const FORWARDER_DOMAIN_VERSION = "0.0.1";

if (typeof window !== "undefined" && (!DAO_ADDRESS || !FORWARDER_ADDRESS)) {
  console.warn(
    "Faltan NEXT_PUBLIC_DAO_ADDRESS / NEXT_PUBLIC_FORWARDER_ADDRESS en .env.local"
  );
}
