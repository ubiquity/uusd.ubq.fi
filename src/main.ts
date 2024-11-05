import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";
import "./router";
import { setupContracts } from "./contracts";
import { handleRouting } from "./router";

const projectId = "415760038f8e330de4868120be3205b8";

const metadata = {
  name: "UUSD Minting DApp",
  description: "Mint UUSD on Gnosis with Reown AppKit",
  url: "https://uusd.ubq.fi",
  icons: ["https://avatars.githubusercontent.com/u/76412717"],
};

// create provider & signer for Ethereum mainnet
export const provider = new ethers.providers.JsonRpcProvider("https://eth.llamarpc.com");
export const userSigner = provider.getSigner();

// setup contract instances
export const { dollarContract, governanceContract, diamondContract, twapOracleContract } = setupContracts(provider);

export const appState = createAppKit({
  adapters: [new Ethers5Adapter()],
  networks: [mainnet],
  defaultNetwork: mainnet,
  metadata,
  projectId,
  features: {
    analytics: true,
  },
});

async function waitForConnection() {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (appState.getIsConnectedState()) {
        console.log(`User connected: ${appState.getAddress()}`);
        clearInterval(interval);
        resolve();
      } else {
        console.log("Waiting for user to connect...");
      }
    }, 1000);
  });
}

// global dollar and governance prices
export let dollarSpotPrice: string | null = null;
export let dollarTwapPrice: string | null = null;
export let governancePrice: string | null = null;

async function updatePrices() {
  try {
    const dollarSpotPriceRaw = await diamondContract.getDollarPriceUsd();
    const governancePriceRaw = await diamondContract.getGovernancePriceUsd();

    dollarSpotPrice = ethers.utils.formatUnits(dollarSpotPriceRaw, 6);
    governancePrice = ethers.utils.formatUnits(governancePriceRaw, 6);

  } catch (error) {
    console.error("Error getting prices:", error);
  }
}

export async function mainModule() {
  try {
    console.log("Provider:", provider);
    console.log("Signer:", userSigner);

    console.log("Waiting for user connection...");
    void waitForConnection();

    await updatePrices();

    handleRouting();
  } catch (error) {
    console.error("Error in main:", error);
  }
}

mainModule().catch((error) => {
  console.error("Unhandled error:", error);
});