// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title MinimalForwarder
/// @notice Generic EIP-2771 meta-transaction forwarder: lets a user sign a
/// message *off-chain* describing a call they want made, and lets anyone
/// else submit that signed message as an on-chain transaction — paying the
/// gas — on the user's behalf. This is the mechanism gasless voting relies
/// on: the voter never sends a transaction or spends gas themselves.
///
/// @dev How it fits together with a "trusting" contract like `DAOVoting`:
/// 1. Off-chain, a user signs a `ForwardRequest` (EIP-712 typed data) that
///    describes exactly which contract/function/args they want called.
/// 2. Anyone (a "relayer") calls `execute()` on this contract with that
///    request + signature. This contract checks the signature, then makes
///    the actual call to the target contract itself — but appends the
///    original signer's address to the end of the calldata.
/// 3. The target contract (e.g. `DAOVoting`, which extends OpenZeppelin's
///    `ERC2771Context` and is configured to trust this forwarder) strips
///    that appended address back off and returns it from `_msgSender()`,
///    instead of the forwarder's own address. From the target contract's
///    point of view, it looks exactly as if the original signer called it
///    directly — except the relayer paid the gas.
///
/// Nothing in this contract restricts who may call `execute()`: the signer
/// themselves can call it (paying their own gas, but still going through
/// this replay-protected flow), or hand the signed request to a completely
/// separate relayer account. Neither the forwarder nor the target contract
/// need to know or care which case applies.
contract MinimalForwarder is EIP712 {
    using ECDSA for bytes32;

    /// @notice The off-chain-signed description of a call to make on
    /// someone's behalf.
    struct ForwardRequest {
        // Whoever signed this request — the address the target contract
        // will see as `_msgSender()`.
        address from;
        // The contract to call.
        address to;
        // ETH (wei) to forward with the call. Usually 0 for this project.
        uint256 value;
        // Gas budget to give the inner call.
        uint256 gas;
        // Must equal `_nonces[from]` at execution time — see `verify()`.
        uint256 nonce;
        // ABI-encoded function selector + arguments to call `to` with.
        bytes data;
    }

    // EIP-712 type hash identifying the `ForwardRequest` struct shape.
    // Used to build the typed-data digest that must match what the user
    // actually signed off-chain.
    bytes32 private constant _TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
    );

    // Next expected nonce per signer. Incremented on every successful
    // `execute()`, which is what stops a captured (request, signature)
    // pair from being replayed a second time — see `verify()`.
    mapping(address => uint256) private _nonces;

    constructor() EIP712("MinimalForwarder", "0.0.1") {}

    /// @notice The nonce `from` must use in their *next* `ForwardRequest`.
    function getNonce(address from) public view returns (uint256) {
        return _nonces[from];
    }

    /// @notice Check whether `signature` is a valid EIP-712 signature of
    /// `req`, made by `req.from`, with a nonce that hasn't been used yet.
    /// @dev Rebuilds the same typed-data digest the user's wallet would
    /// have produced when signing, recovers the signer's address from the
    /// signature, and requires it to match `req.from` *and* the nonce to
    /// match what's currently expected. A previously-used nonce means the
    /// signature is stale (already executed, or superseded).
    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        address signer = _hashTypedDataV4(
            keccak256(
                abi.encode(_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data))
            )
        ).recover(signature);
        return _nonces[req.from] == req.nonce && signer == req.from;
    }

    /// @notice Verify `req`/`signature`, then perform the call it
    /// describes, on behalf of `req.from`, forwarding it to `req.to`.
    /// @dev Whoever calls this function (the "relayer") pays the gas for
    /// this transaction, regardless of who `req.from` is. The forwarder
    /// itself never holds funds or decides *what* gets called — it only
    /// authenticates the request and passes it through.
    ///
    /// `req.from` is appended to the raw calldata sent to `req.to`
    /// (`abi.encodePacked(req.data, req.from)`). A target contract using
    /// OpenZeppelin's `ERC2771Context` (and configured to trust this
    /// forwarder) knows to read that trailing address back out as the
    /// "real" sender — see the contract-level docstring above.
    /// @return success Whether the forwarded call succeeded.
    /// @return returndata Raw return data from the forwarded call.
    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        require(verify(req, signature), "MinimalForwarder: signature does not match request");
        // Consume the nonce before making the external call, so this
        // exact (request, signature) pair can never be replayed even if
        // the call below were to somehow re-enter `execute()`.
        _nonces[req.from] = req.nonce + 1;

        uint256 gasForCall = req.gas;
        (bool success, bytes memory returndata) =
            req.to.call{gas: gasForCall, value: req.value}(abi.encodePacked(req.data, req.from));

        // Gas-griefing guard: a malicious relayer could call this with far
        // less gas than `req.gas` and let the inner call fail/run out of
        // gas cheaply, wasting the signer's intent. EIP-150 guarantees
        // whoever calls this function still has at least 1/64th of the
        // gas left after the inner call returns; if that remainder is too
        // small relative to what was requested, the relayer likely under-
        // supplied gas on purpose, so we abort loudly instead of silently
        // reporting failure.
        assert(gasleft() > gasForCall / 63);

        if (!success) {
            // Re-throw the inner call's exact revert reason instead of a
            // generic "call failed", so errors from the target contract
            // (e.g. DAOVoting's require messages) surface unchanged.
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }

        return (success, returndata);
    }
}
