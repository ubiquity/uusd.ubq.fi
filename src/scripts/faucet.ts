import { getContract } from "viem";
import { mainnet } from "viem/chains";
import { getConnectedClient } from "./connect-wallet";
import { diamondAddress, ufaucetAbi } from "./constants.json";
import { publicClient } from "./shared";

interface CollateralInformation {
  index: bigint;
  symbol: string;
  collateralAddress: `0x${string}`;
  collateralPriceFeedAddress: `0x${string}`;
  collateralPriceFeedStalenessThreshold: bigint;
  isEnabled: boolean;
  missingDecimals: bigint;
  price: bigint;
  poolCeiling: bigint;
  isMintPaused: boolean;
  isRedeemPaused: boolean;
  isBorrowPaused: boolean;
  mintingFee: bigint;
  redemptionFee: bigint;
}

const abi = ufaucetAbi;
const address = diamondAddress as `0x${string}`;

const CLIENT_OR_ACCOUNT_ERROR = "Client or account not initialized";
const contract = getContract({
  abi,
  address,
  client: publicClient,
});

export async function getAllCollaterals() {
  try {
    const collaterals = (await contract.read.allCollaterals()) as `0x${string}`[];
    return collaterals.filter((c): c is `0x${string}` => /^0x[0-9a-fA-F]+$/.test(c));
  } catch (error) {
    return [];
  }
}

export async function getCollateralUsdBalance() {
  try {
    return (await contract.read.collateralUsdBalance()) as bigint;
  } catch (error) {
    return BigInt(0);
  }
}

export async function getGovernancePriceUsd() {
  try {
    return (await contract.read.getGovernancePriceUsd()) as bigint;
  } catch (error) {
    return BigInt(0);
  }
}

export async function getDollarPriceUsd() {
  try {
    return (await contract.read.getDollarPriceUsd()) as bigint;
  } catch (error) {
    return BigInt(0);
  }
}

export async function getCollateralInformation(collateralAddress: `0x${string}`) {
  try {
    return (await contract.read.collateralInformation([collateralAddress])) as CollateralInformation;
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
        chain: mainnet,
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
        chain: mainnet,
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
        chain: mainnet,
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
