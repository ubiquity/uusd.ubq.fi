import { createPublicClient, getContract, http } from "viem";
import { diamondAddress, ufaucetAbi } from "./constants";
// import { mainnet } from "viem/chains";
import { getConnectedClient } from "./connect-wallet";
import { localhost } from "./custom-chains";

const abi = ufaucetAbi;
const address = diamondAddress;
const publicClient = createPublicClient({
  chain: localhost,
  transport: http(),
});

const CLIENT_OR_ACCOUNT_ERROR = "Client or account not initialized";

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

export async function getCollateralInformation(collateralAddress: `0x${string}`) {
  const contract = getContract({
    abi,
    address,
    client: publicClient,
  });

  try {
    return await contract.read.collateralInformation([collateralAddress]);
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function mintDollar(
  collateralIndex: bigint,
  dollarAmount: bigint,
  dollarOutMin: bigint,
  maxCollateralIn: bigint,
  maxGovernanceIn: bigint,
  isOneToOne: boolean
) {
  const client = getConnectedClient();

  if (client !== null && client.account) {
    try {
      const { request } = await publicClient.simulateContract({
        abi,
        address,
        functionName: "mintDollar",
        args: [collateralIndex, dollarAmount, dollarOutMin, maxCollateralIn, maxGovernanceIn, isOneToOne],
        chain: localhost,
        account: client.account,
      });
      return await client.writeContract(request);
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    return Promise.reject(new Error(CLIENT_OR_ACCOUNT_ERROR));
  }
}

export async function redeemDollar(collateralIndex: bigint, dollarAmount: bigint, governanceOutMin: bigint, collateralOutMin: bigint) {
  const client = getConnectedClient();

  if (client !== null && client.account) {
    try {
      const { request } = await publicClient.simulateContract({
        abi,
        address,
        functionName: "redeemDollar",
        args: [collateralIndex, dollarAmount, governanceOutMin, collateralOutMin],
        chain: localhost,
        account: client.account,
      });
      return await client.writeContract(request);
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    return Promise.reject(new Error(CLIENT_OR_ACCOUNT_ERROR));
  }
}

export async function collectionRedemption(collateralIndex: bigint) {
  const client = getConnectedClient();

  if (client !== null && client.account) {
    try {
      const { request } = await publicClient.simulateContract({
        abi,
        address,
        functionName: "collectRedemption",
        args: [collateralIndex],
        chain: localhost,
        account: client.account,
      });
      return await client.writeContract(request);
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    return Promise.reject(new Error(CLIENT_OR_ACCOUNT_ERROR));
  }
}
