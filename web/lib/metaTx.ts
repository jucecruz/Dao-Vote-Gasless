import { Contract, Signer } from "ethers";
import { CHAIN_ID, FORWARDER_DOMAIN_NAME, FORWARDER_DOMAIN_VERSION, FORWARDER_ADDRESS } from "./config";
import type { VoteType } from "./format";

export interface ForwardRequestJSON {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  data: string;
}

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

const VOTE_GAS_LIMIT = 150_000n;

/** Builds and signs (EIP-712) a gasless ForwardRequest that calls DAOVoting.vote(). */
export async function signVoteRequest(
  signer: Signer,
  daoContract: Contract,
  forwarderContract: Contract,
  proposalId: bigint,
  voteType: VoteType
): Promise<{ request: ForwardRequestJSON; signature: string }> {
  const from = await signer.getAddress();
  const to = await daoContract.getAddress();
  const nonce: bigint = await forwarderContract.getNonce(from);
  const data = daoContract.interface.encodeFunctionData("vote", [proposalId, voteType]);

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
