// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MinimalForwarder} from "../src/MinimalForwarder.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/// @notice Minimal ERC2771 target used to exercise the forwarder end-to-end.
contract ERC2771Target is ERC2771Context {
    address public lastSender;
    uint256 public lastValue;
    uint256 public callCount;

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    function ping() external payable {
        lastSender = _msgSender();
        lastValue = msg.value;
        callCount++;
    }

    function willRevert() external pure {
        revert("ERC2771Target: always reverts");
    }
}

contract MinimalForwarderTest is Test {
    MinimalForwarder internal forwarder;
    ERC2771Target internal target;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;

    address internal relayer = address(0xB0B);

    bytes32 internal constant TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    function setUp() public {
        forwarder = new MinimalForwarder();
        target = new ERC2771Target(address(forwarder));
        signer = vm.addr(signerKey);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("MinimalForwarder")),
                keccak256(bytes("0.0.1")),
                block.chainid,
                address(forwarder)
            )
        );
    }

    function _digest(MinimalForwarder.ForwardRequest memory req) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data))
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _buildRequest(bytes memory data) internal view returns (MinimalForwarder.ForwardRequest memory) {
        return MinimalForwarder.ForwardRequest({
            from: signer,
            to: address(target),
            value: 0,
            gas: 200_000,
            nonce: forwarder.getNonce(signer),
            data: data
        });
    }

    function _signRequest(MinimalForwarder.ForwardRequest memory req) internal view returns (bytes memory) {
        bytes32 digest = _digest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_Verify_ValidSignature() public view {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes memory signature = _signRequest(req);
        assertTrue(forwarder.verify(req, signature));
    }

    function test_Verify_WrongSignerFails() public view {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes32 digest = _digest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, digest);
        bytes memory badSignature = abi.encodePacked(r, s, v);
        assertFalse(forwarder.verify(req, badSignature));
    }

    function test_Verify_TamperedRequestFails() public view {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes memory signature = _signRequest(req);
        req.to = address(0xDEAD);
        assertFalse(forwarder.verify(req, signature));
    }

    function test_Execute_RelayerPaysGas_CallsTargetAsSigner() public {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes memory signature = _signRequest(req);

        vm.prank(relayer);
        forwarder.execute(req, signature);

        assertEq(target.lastSender(), signer);
        assertEq(target.callCount(), 1);
        assertEq(forwarder.getNonce(signer), 1);
    }

    function test_Execute_SignerSelfRelays() public {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes memory signature = _signRequest(req);

        vm.prank(signer);
        forwarder.execute(req, signature);

        assertEq(target.lastSender(), signer);
        assertEq(forwarder.getNonce(signer), 1);
    }

    function test_Execute_RevertsOnReplay() public {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes memory signature = _signRequest(req);

        forwarder.execute(req, signature);

        vm.expectRevert("MinimalForwarder: signature does not match request");
        forwarder.execute(req, signature);
    }

    function test_Execute_RevertsOnInvalidSignature() public {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.ping, ()));
        bytes32 digest = _digest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, digest);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.expectRevert("MinimalForwarder: signature does not match request");
        forwarder.execute(req, badSignature);
    }

    function test_Execute_BubblesTargetRevertReason() public {
        MinimalForwarder.ForwardRequest memory req = _buildRequest(abi.encodeCall(ERC2771Target.willRevert, ()));
        bytes memory signature = _signRequest(req);

        vm.expectRevert("ERC2771Target: always reverts");
        forwarder.execute(req, signature);
    }
}
