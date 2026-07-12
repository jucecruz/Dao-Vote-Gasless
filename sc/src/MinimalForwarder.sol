// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice EIP-2771 meta-transaction forwarder. Anyone holding a validly
/// signed ForwardRequest can submit it via execute() — the signer decides
/// off-chain whether they relay it themselves or hand it to a third party,
/// the contract does not care who calls execute().
contract MinimalForwarder is EIP712 {
    using ECDSA for bytes32;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        bytes data;
    }

    bytes32 private constant _TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
    );

    mapping(address => uint256) private _nonces;

    constructor() EIP712("MinimalForwarder", "0.0.1") {}

    function getNonce(address from) public view returns (uint256) {
        return _nonces[from];
    }

    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        address signer = _hashTypedDataV4(
            keccak256(
                abi.encode(_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data))
            )
        ).recover(signature);
        return _nonces[req.from] == req.nonce && signer == req.from;
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        require(verify(req, signature), "MinimalForwarder: signature does not match request");
        _nonces[req.from] = req.nonce + 1;

        uint256 gasForCall = req.gas;
        (bool success, bytes memory returndata) =
            req.to.call{gas: gasForCall, value: req.value}(abi.encodePacked(req.data, req.from));

        // Protects against gas griefing: ensure the relayer supplied enough
        // gas for the call to actually run with the requested gas budget.
        assert(gasleft() > gasForCall / 63);

        if (!success) {
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }

        return (success, returndata);
    }
}
