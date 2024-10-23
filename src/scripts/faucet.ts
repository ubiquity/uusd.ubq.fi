import { createPublicClient, getContract, http } from "viem";
import { uFaucetAddress, ufaucetAbi } from "./constants";
// import { getConnectedClient } from "./connect-wallet";
import { mainnet } from "viem/chains";
import { getConnectedClient } from "./connect-wallet";

const abi = ufaucetAbi;
const address = uFaucetAddress;
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export async function getAllCollaterals() {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.allCollaterals();
  } catch (error) {
    return [];
  }
}

export async function getCollateralUsdBalance() {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.collateralUsdBalance();
  } catch (error) {
    return BigInt(0);
  }
}

export async function getGovernancePriceUsd() {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.getGovernancePriceUsd();
  } catch (error) {
    return BigInt(0);
  }
}

export async function getDollarPriceUsd() {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.getDollarPriceUsd();
  } catch (error) {
    return BigInt(0);
  }
}

export async function getCollateralInformation(address: `0x${string}`) {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.collateralInformation([address]);
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function mintDollar(collateralIndex: bigint, dollarAmount: bigint, maxCollateralIn: bigint, maxGovernanceIn: bigint, isOneToOne: boolean) {
  const client = getConnectedClient();

  if (client !== null && client.account) {
    try {
      return await client.writeContract({
        abi,
        address,
        functionName: "mintDollar",
        args: [collateralIndex, dollarAmount, BigInt(0), maxCollateralIn, maxGovernanceIn, isOneToOne],
        chain: mainnet,
        account: client.account,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    return Promise.reject(new Error("Client or account not initialized"));
  }
}
