import { getContract } from "viem";
import { erc20Abi } from "./constants";
import { mainnet } from "viem/chains";
import { getConnectedClient } from "./connect-wallet";
import { publicClient } from "./shared";

const abi = erc20Abi;

export async function getTokenDecimals(address: `0x${string}`) {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.decimals();
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function getAllowance(address: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`) {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.allowance([owner, spender]);
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function approveToSpend(address: `0x${string}`, spender: `0x${string}`, amount: bigint) {
  const client = getConnectedClient();

  if (client !== null && client.account) {
    try {
      const { request } = await publicClient.simulateContract({
        abi,
        address,
        functionName: "approve",
        args: [spender, amount],
        chain: mainnet,
        account: client.account,
      });
      return await client.writeContract(request);
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    return Promise.reject(new Error("Client or account not initialized"));
  }
}
