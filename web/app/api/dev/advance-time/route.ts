import { NextRequest, NextResponse } from "next/server";
import { Contract, JsonRpcProvider } from "ethers";
import daoAbi from "@/lib/abi/DAOVoting.json";

export const runtime = "nodejs";

/**
 * DEV/DEMO ONLY. Fast-forwards the local Anvil chain's clock past a
 * proposal's voting deadline + execution delay via evm_setNextBlockTimestamp,
 * so it can be executed immediately instead of waiting in real time.
 *
 * This only works against a local test node — evm_setNextBlockTimestamp is
 * not part of the standard Ethereum JSON-RPC and any real network (testnet
 * or mainnet) will simply reject it, so this is inherently a no-op there.
 */

const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "";
const RPC_URL = process.env.RPC_URL ?? "";

export async function POST(req: NextRequest) {
  if (!DAO_ADDRESS || !RPC_URL) {
    return NextResponse.json(
      { success: false, error: "No configurado (revisa .env.local)" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  const proposalId = (body as { proposalId?: unknown })?.proposalId;
  if (typeof proposalId !== "string" || !/^\d+$/.test(proposalId)) {
    return NextResponse.json({ success: false, error: "proposalId inválido" }, { status: 400 });
  }

  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
  const dao = new Contract(DAO_ADDRESS, daoAbi, provider);

  try {
    const [proposal, executionDelay] = await Promise.all([
      dao.getProposal(BigInt(proposalId)),
      dao.executionDelay(),
    ]);

    if (proposal.id === 0n) {
      return NextResponse.json({ success: false, error: "La propuesta no existe" }, { status: 404 });
    }
    if (proposal.executed) {
      return NextResponse.json({ success: false, error: "La propuesta ya fue ejecutada" }, { status: 400 });
    }

    const target = Number(proposal.deadline) + Number(executionDelay) + 1;
    const latest = await provider.getBlock("latest");

    if (latest && latest.timestamp >= target) {
      return NextResponse.json({
        success: true,
        message: "El tiempo ya estaba avanzado, no hizo falta saltar nada",
      });
    }

    await provider.send("evm_setNextBlockTimestamp", [target]);
    await provider.send("evm_mine", []);

    return NextResponse.json({ success: true, message: "Tiempo de espera saltado" });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Error al avanzar el tiempo (¿es una red real que no soporta esto?)",
      },
      { status: 500 }
    );
  }
}
