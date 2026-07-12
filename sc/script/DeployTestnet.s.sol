// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MinimalForwarder} from "../src/MinimalForwarder.sol";
import {DAOVoting} from "../src/DAOVoting.sol";

/// @notice Deploys MinimalForwarder + DAOVoting to a testnet.
/// Required env: PRIVATE_KEY, RPC_URL.
/// Optional env: MIN_VOTE_BALANCE (default 0.01 ether), EXECUTION_DELAY (default 1 days).
/// Usage: forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --verify
contract DeployTestnet is Script {
    function run() external returns (MinimalForwarder forwarder, DAOVoting dao) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        uint256 minVoteBalance = vm.envOr("MIN_VOTE_BALANCE", uint256(0.01 ether));
        uint256 executionDelay = vm.envOr("EXECUTION_DELAY", uint256(1 days));

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
