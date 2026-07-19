// Standalone Node process (run with `npm run daemon`, NOT part of the
// Next.js server) that polls the DAO every DAEMON_INTERVAL_SECONDS and
// automatically executes any proposal that's approved and past its
// security delay — see DAOVoting.executeProposal's requirements in
// sc/src/DAOVoting.sol. This is the "automatic" counterpart to the
// manual "Ejecutar ahora" button in the frontend's ExecutionPanel; both
// end up calling the same on-chain function, just from different callers
// (this script's relayer wallet vs. whichever member clicks the button).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const daoAbi = JSON.parse(readFileSync(path.join(__dirname, "../lib/abi/DAOVoting.json"), "utf8"));

const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS;
const INTERVAL_SECONDS = Number(process.env.DAEMON_INTERVAL_SECONDS ?? "15");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

if (!DAO_ADDRESS || !RPC_URL || !RELAYER_PRIVATE_KEY) {
  console.error("Faltan NEXT_PUBLIC_DAO_ADDRESS, RPC_URL o RELAYER_PRIVATE_KEY en el entorno.");
  process.exit(1);
}

// cacheTimeout: -1 disables ethers' default 250ms response cache, which
// otherwise races with fast-mining local chains and returns a stale nonce
// when this same wallet executes several approved proposals in one tick.
const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
const relayerWallet = new Wallet(RELAYER_PRIVATE_KEY, provider);

if (RELAYER_ADDRESS && RELAYER_ADDRESS.toLowerCase() !== relayerWallet.address.toLowerCase()) {
  console.error(
    `RELAYER_ADDRESS (${RELAYER_ADDRESS}) no coincide con la dirección derivada de RELAYER_PRIVATE_KEY (${relayerWallet.address}).`
  );
  process.exit(1);
}

// Two Contract instances against the same address: `daoRead` for free
// view calls (no wallet attached), `daoWrite` for the actual
// executeProposal() transactions, signed by the relayer wallet.
const daoRead = new Contract(DAO_ADDRESS, daoAbi, provider);
const daoWrite = new Contract(DAO_ADDRESS, daoAbi, relayerWallet);

// One polling tick: find every proposal, check which ones are ready, and
// execute those. Mirrors how the frontend lists proposals (DaoContext) —
// there's no "list all proposals" view function on the contract, so this
// scans past ProposalCreated events for their ids instead.
async function checkAndExecute() {
  const events = await daoRead.queryFilter(daoRead.filters.ProposalCreated());
  const ids = [...new Set(events.map((e) => e.args.id))];

  if (ids.length === 0) {
    log("No hay propuestas creadas todavía.");
    return;
  }

  const executionDelay = Number(await daoRead.executionDelay());
  // Anvil only mines a new block (and advances block.timestamp) when a
  // transaction is submitted — with no recent activity "latest" can lag real
  // time by minutes, making this check miss proposals that are actually
  // eligible. Wall-clock time is the right proxy here: worst case we try a
  // moment too early and the contract's own require() rejects it harmlessly,
  // and the next tick retries.
  const now = Math.floor(Date.now() / 1000);
  let eligibleCount = 0;

  for (const id of ids) {
    const p = await daoRead.getProposal(id);
    if (p.executed) continue;

    const isPastDelay = now > Number(p.deadline) + executionDelay;
    const isApproved = p.votesFor > p.votesAgainst;
    if (!isPastDelay || !isApproved) continue;

    eligibleCount++;
    log(`Ejecutando propuesta #${id} (votosFor=${p.votesFor}, votosAgainst=${p.votesAgainst})...`);
    try {
      const tx = await daoWrite.executeProposal(id);
      const receipt = await tx.wait();
      log(`Propuesta #${id} ejecutada. tx=${receipt.hash}`);
    } catch (err) {
      log(`ERROR ejecutando propuesta #${id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (eligibleCount === 0) {
    log(`Revisadas ${ids.length} propuestas, ninguna elegible para ejecución.`);
  }
}

// Infinite poll loop: check, wait, repeat. A failure in one tick (e.g. the
// RPC node being briefly unreachable) is logged and swallowed rather than
// crashing the whole process, so the daemon keeps retrying on the next
// interval instead of needing to be manually restarted.
async function main() {
  log(`Daemon iniciado. Relayer=${relayerWallet.address}. Intervalo=${INTERVAL_SECONDS}s.`);
  for (;;) {
    try {
      await checkAndExecute();
    } catch (err) {
      log(`ERROR en el ciclo de verificación: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_SECONDS * 1000));
  }
}

main();
