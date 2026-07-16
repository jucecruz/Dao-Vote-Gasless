import { NextRequest, NextResponse } from "next/server";
import { Contract, Interface, JsonRpcProvider, Wallet, isAddress } from "ethers";
import daoAbi from "@/lib/abi/DAOVoting.json";
import forwarderAbi from "@/lib/abi/MinimalForwarder.json";

export const runtime = "nodejs";

const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "";
const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS ?? "";
const RPC_URL = process.env.RPC_URL ?? "";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY ?? "";

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
    const isValid = await forwarderRead.verify(forwardRequest, signature);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Firma o nonce inválidos" }, { status: 400 });
    }

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
