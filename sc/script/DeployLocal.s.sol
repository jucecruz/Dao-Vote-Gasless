// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MinimalForwarder} from "../src/MinimalForwarder.sol";
import {DAOVoting} from "../src/DAOVoting.sol";

/// @notice Deploys MinimalForwarder + DAOVoting to a local Anvil node.
/// Usage: forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract DeployLocal is Script {
    // Anvil's default account #0 private key, used when PRIVATE_KEY is not set.
    uint256 internal constant ANVIL_DEFAULT_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external returns (MinimalForwarder forwarder, DAOVoting dao) {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", ANVIL_DEFAULT_KEY);
        uint256 minVoteBalance = vm.envOr("MIN_VOTE_BALANCE", uint256(0.01 ether));
        uint256 executionDelay = vm.envOr("EXECUTION_DELAY", uint256(1 hours));

        vm.startBroadcast(deployerKey);

        forwarder = new MinimalForwarder();
        dao = new DAOVoting(address(forwarder), minVoteBalance, executionDelay);

        vm.stopBroadcast();

        console.log("MinimalForwarder deployed at:", address(forwarder));
        console.log("DAOVoting deployed at:", address(dao));
        console.log("minVoteBalance:", minVoteBalance);
        console.log("executionDelay (seconds):", executionDelay);
    }
}
