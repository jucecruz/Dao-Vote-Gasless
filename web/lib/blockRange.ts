// Works around a real-world RPC constraint that never shows up on a local
// Anvil chain: most providers (Infura, Alchemy, public endpoints) reject
// eth_getLogs calls whose block range is too wide. DaoContext used to call
// `contract.queryFilter(filter)` with no bounds at all (fromBlock=0,
// toBlock="latest"), which is harmless on Anvil (a handful of blocks) but
// fails hard on any network with real history — see ../../ISSUES.md for
// the full writeup ("range 11315677 exceeds limit of 10000" on Sepolia).

import { Contract, Provider } from "ethers";

// The most commonly cited eth_getLogs limit (Infura's public limit is
// 10,000 blocks per call) — staying comfortably under it so we don't
// bump into slightly-stricter providers either.
const MAX_BLOCK_RANGE = 9_000;

// Binary-searching for a contract's deployment block is a handful of
// eth_getCode calls (~O(log latestBlock), ~24 calls even on a chain with
// tens of millions of blocks) — cheap enough to do once, but not cheap
// enough to redo on every refresh, so we cache the result per address for
// the lifetime of the page.
const deploymentBlockCache = new Map<string, number>();

/**
 * Finds the block a contract was first deployed at, via binary search on
 * `eth_getCode` (empty before deployment, non-empty from that block on).
 * Lets callers query event logs starting from a contract's actual
 * lifetime instead of from block 0, which is what keeps the *effective*
 * range small enough to matter for `queryFilterPaginated` below — a
 * contract deployed a few hundred blocks ago needs one `eth_getLogs`
 * call either way, but starting from 0 on a network with millions of
 * blocks of history would mean hundreds of needless calls.
 */
export async function getDeploymentBlock(provider: Provider, address: string): Promise<number> {
  const cached = deploymentBlockCache.get(address);
  if (cached !== undefined) return cached;

  const latest = await provider.getBlockNumber();

  // Guards against the (very unlikely) case of a chain whose genesis
  // block already has this contract's code — a plain binary search would
  // never terminate correctly if `lo` itself is already a valid answer.
  if ((await provider.getCode(address, 0)) !== "0x") {
    deploymentBlockCache.set(address, 0);
    return 0;
  }

  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code === "0x") {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  deploymentBlockCache.set(address, lo);
  return lo;
}

/**
 * Same as `contract.queryFilter(filter, fromBlock, toBlock)`, but split
 * into chunks no wider than MAX_BLOCK_RANGE and concatenated — so it
 * works against RPC providers that cap how many blocks a single
 * eth_getLogs call may span.
 */
export async function queryFilterPaginated(
  contract: Contract,
  filter: Parameters<Contract["queryFilter"]>[0],
  fromBlock: number,
  toBlock: number
) {
  const results: Awaited<ReturnType<Contract["queryFilter"]>> = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE + 1) {
    const end = Math.min(start + MAX_BLOCK_RANGE, toBlock);
    const chunk = await contract.queryFilter(filter, start, end);
    results.push(...chunk);
  }
  return results;
}
