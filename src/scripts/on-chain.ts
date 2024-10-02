import { createPublicClient, getContract, http } from "viem";
import { uFaucetAddress, ufaucetAbi } from "./constants";
// import { getConnectedClient } from "./connect-wallet";
import { mainnet } from "viem/chains";

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
