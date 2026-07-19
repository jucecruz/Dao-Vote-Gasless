// Builds the EIP-712 "meta-transaction" a user signs in their wallet to
// vote without paying gas. Nothing here sends a transaction — it only
// produces a signed message; DaoContext.voteGasless() is what POSTs the
// result to /api/relay, where a relayer actually submits it on-chain via
// MinimalForwarder.execute() (see sc/src/MinimalForwarder.sol for the
// on-chain half of this flow).

import { Contract, Signer } from "ethers";
import { CHAIN_ID, FORWARDER_DOMAIN_NAME, FORWARDER_DOMAIN_VERSION, FORWARDER_ADDRESS } from "./config";
import type { VoteType } from "./format";

// JSON-safe mirror of MinimalForwarder.ForwardRequest (Solidity struct).
// Numeric fields are strings here because BigInt isn't valid JSON — the
// API route parses them back into bigint before touching the contract.
export interface ForwardRequestJSON {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  data: string;
}

// EIP-712 type description of ForwardRequest. Must exactly match the
// field names/order/types MinimalForwarder hashes in its `_TYPEHASH`
// constant — any mismatch would make the wallet sign a different digest
// than the one the contract recomputes, so `verify()` would always fail.
const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
};

// Gas budget handed to the forwarded call. DAOVoting.vote() is cheap, so a
// generous fixed value is simpler than estimating per-call and still
// comfortably covers it.
const VOTE_GAS_LIMIT = 150_000n;

/**
 * Builds and signs (EIP-712, via the connected wallet) a gasless
 * ForwardRequest that calls `DAOVoting.vote(proposalId, voteType)`.
 *
 * This only prompts the user for a *signature*, not a transaction — no
 * gas is spent and nothing is sent to the network at this point. The
 * caller (DaoContext.voteGasless) is responsible for forwarding the
 * result to a relayer.
 */
export async function signVoteRequest(
  signer: Signer,
  daoContract: Contract,
  forwarderContract: Contract,
  proposalId: bigint,
  voteType: VoteType
): Promise<{ request: ForwardRequestJSON; signature: string }> {
  const from = await signer.getAddress();
  const to = await daoContract.getAddress();
  // Must match MinimalForwarder's current on-chain nonce for this signer,
  // or the contract will reject the request as stale/replayed once it's
  // eventually submitted.
  const nonce: bigint = await forwarderContract.getNonce(from);
  // Encode "call DAOVoting.vote(proposalId, voteType)" the same way it
  // would be encoded for a direct transaction — this is the payload
  // MinimalForwarder will relay to the DAO contract.
  const data = daoContract.interface.encodeFunctionData("vote", [proposalId, voteType]);

  // The EIP-712 "domain" ties this signature to one specific forwarder
  // contract + chain, so it can't be replayed against a different
  // deployment or network.
  const domain = {
    name: FORWARDER_DOMAIN_NAME,
    version: FORWARDER_DOMAIN_VERSION,
    chainId: CHAIN_ID,
    verifyingContract: FORWARDER_ADDRESS,
  };

  const value = {
    from,
    to,
    value: 0n,
    gas: VOTE_GAS_LIMIT,
    nonce,
    data,
  };

  // Prompts the wallet's "sign" UI (not a "confirm transaction" UI) —
  // this is what makes voting feel gasless to the user.
  const signature = await signer.signTypedData(domain, FORWARD_REQUEST_TYPES, value);

  return {
    request: {
      from,
      to,
      value: "0",
      gas: VOTE_GAS_LIMIT.toString(),
      nonce: nonce.toString(),
      data,
    },
    signature,
  };
}
