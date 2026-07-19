// The relayer: this is the server-side half of gasless voting. The
// browser (DaoContext.voteGasless / lib/metaTx.ts) only ever *signs* a
// ForwardRequest — this route is what actually submits it on-chain,
// paying gas from a dedicated relayer wallet (RELAYER_PRIVATE_KEY, a
// server-only env var, never sent to the browser).
//
// This deliberately is NOT a general-purpose "relay anything" endpoint:
// it only forwards requests targeting our own DAO contract's vote()
// function (checked below), so it can't be abused to make the relayer
// pay gas for arbitrary calls to arbitrary contracts.

import { NextRequest, NextResponse } from "next/server";
import { Contract, Interface, JsonRpcProvider, Wallet, isAddress } from "ethers";
import daoAbi from "@/lib/abi/DAOVoting.json";
import forwarderAbi from "@/lib/abi/MinimalForwarder.json";

// Node runtime (not Edge) — needed because ethers' Wallet/signing relies
// on Node's crypto APIs, which aren't available in the Edge runtime.
export const runtime = "nodejs";

const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "";
const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS ?? "";
const RPC_URL = process.env.RPC_URL ?? "";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY ?? "";

// The 4-byte function selector for DAOVoting.vote(uint256,uint8) — used
// below to reject any forwarded call that isn't a vote.
const VOTE_SELECTOR = new Interface(daoAbi).getFunction("vote")?.selector ?? "";

interface RelayRequestBody {
  request: {
    from: string;
    to: string;
    value: string;
    gas: string;
    nonce: string;
    data: string;
  };
  signature: string;
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

// Validates the raw JSON body's shape/types before we trust any of it —
// this runs before the on-chain signature check, so malformed input never
// reaches ethers with unexpected types.
function isValidRequestShape(body: unknown): body is RelayRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.signature !== "string" || !isHex(b.signature)) return false;

  const r = b.request as Record<string, unknown> | undefined;
  if (!r) return false;

  return (
    typeof r.from === "string" &&
    isAddress(r.from) &&
    typeof r.to === "string" &&
    isAddress(r.to) &&
    typeof r.value === "string" &&
    /^\d+$/.test(r.value) &&
    typeof r.gas === "string" &&
    /^\d+$/.test(r.gas) &&
    typeof r.nonce === "string" &&
    /^\d+$/.test(r.nonce) &&
    isHex(r.data)
  );
}

export async function POST(req: NextRequest) {
  if (!DAO_ADDRESS || !FORWARDER_ADDRESS || !RPC_URL || !RELAYER_PRIVATE_KEY) {
    return NextResponse.json(
      { success: false, error: "El relayer no está configurado (revisa .env.local)" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  if (!isValidRequestShape(body)) {
    return NextResponse.json({ success: false, error: "Formato de request inválido" }, { status: 400 });
  }

  const { request, signature } = body;

  // The two checks that keep this from being an open relay: only our DAO
  // contract as the target, and only its vote() function.
  if (request.to.toLowerCase() !== DAO_ADDRESS.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: "Este relayer solo reenvía llamadas al contrato del DAO" },
      { status: 400 }
    );
  }

  if (!request.data.toLowerCase().startsWith(VOTE_SELECTOR.toLowerCase())) {
    return NextResponse.json(
      { success: false, error: "Este relayer solo reenvía llamadas a vote()" },
      { status: 400 }
    );
  }

  // cacheTimeout: -1 disables ethers' default 250ms response cache, which
  // otherwise races with fast-mining local chains and returns stale nonces
  // for the shared relayer wallet when two votes are relayed back-to-back.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
  const forwarderRead = new Contract(FORWARDER_ADDRESS, forwarderAbi, provider);

  const forwardRequest = {
    from: request.from,
    to: request.to,
    value: BigInt(request.value),
    gas: BigInt(request.gas),
    nonce: BigInt(request.nonce),
    data: request.data,
  };

  try {
    // Re-check the signature ourselves before spending gas — verify() is
    // a free read call, so this catches bad/replayed/stale requests
    // cheaply instead of paying for a transaction that would just revert.
    const isValid = await forwarderRead.verify(forwardRequest, signature);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Firma o nonce inválidos" }, { status: 400 });
    }

    // Only from here on does the relayer wallet (and its private key)
    // get involved — everything above is read-only validation.
    const relayerWallet = new Wallet(RELAYER_PRIVATE_KEY, provider);
    const forwarderWrite = new Contract(FORWARDER_ADDRESS, forwarderAbi, relayerWallet);
    const tx = await forwarderWrite.execute(forwardRequest, signature);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      return NextResponse.json(
        { success: false, error: "La meta-transacción revirtió on-chain" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, txHash: receipt.hash });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al reenviar la transacción" },
      { status: 500 }
    );
  }
}
