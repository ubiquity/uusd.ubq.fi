import "./router";
import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { anvil, mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";
import { setupContracts } from "./contracts";
import { handleRouting } from "./router";
import { renderErrorInModal } from "./common/display-popup-modal";
import { CollateralOption, fetchCollateralOptions, populateCollateralDropdown } from "./common/collateral";

// All unhandled errors are caught and displayed in a modal
window.addEventListener("error", (event: ErrorEvent) => renderErrorInModal(event.error));

// All unhandled promise rejections are caught and displayed in a modal
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  renderErrorInModal(event.reason as Error);
  event.preventDefault();
});

const projectId = "415760038f8e330de4868120be3205b8";

const metadata = {
  name: "UUSD Minting DApp",
  description: "Mint UUSD on Gnosis with Reown AppKit",
  url: "https://uusd.ubq.fi",
  icons: ["https://avatars.githubusercontent.com/u/76412717"],
};

const rpcPerChainId: { [key: string]: string } = {
  "1": "https://eth.llamarpc.com",
  "31337": "http://localhost:8545",
};

export const appState = createAppKit({
  adapters: [new Ethers5Adapter()],
  networks: [mainnet, anvil],
  defaultNetwork: mainnet,
  metadata,
  projectId,
  features: {
    analytics: true,
  },
});

export const getNetworkId = () => appState.getCaipNetworkId()?.toString();

// create provider & signer for Ethereum mainnet
export const provider = () => {
  const networkId = getNetworkId();
  if (!networkId) {
    throw new Error("Network ID not found");
  }
  return new ethers.providers.JsonRpcProvider(rpcPerChainId[networkId]);
};
export let userSigner: ethers.Signer;

// setup contract instances
export const { dollarContract, governanceContract, diamondContract, twapOracleContract, lusdFeedContract } = setupContracts(provider());

async function waitForConnection() {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (appState.getIsConnectedState()) {
        userSigner = provider().getSigner(appState.getAddress());
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
export const dollarTwapPrice: string | null = null;
export let governanceSpotPrice: string | null = null;
export let lusdPrice: string | null = null;

async function updatePrices() {
  try {
    const dollarSpotPriceRaw = await diamondContract.getDollarPriceUsd();
    const governanceSpotPriceRaw = await diamondContract.getGovernancePriceUsd();
    const lusdPriceRaw = await lusdFeedContract.latestAnswer();

    dollarSpotPrice = ethers.utils.formatUnits(dollarSpotPriceRaw, 6);
    governanceSpotPrice = ethers.utils.formatUnits(governanceSpotPriceRaw, 6);
    lusdPrice = ethers.utils.formatUnits(lusdPriceRaw, 8);
  } catch (error) {
    console.error("Error getting prices:", error);
  }
}

export let collateralOptions: CollateralOption[] = [];

export async function mainModule() {
  try {
    console.log("Provider:", provider());

    console.log("Waiting for user connection...");
    void waitForConnection();
    await updatePrices();
    collateralOptions = await fetchCollateralOptions();

    await handleRouting();
  } catch (error) {
    console.error("Error in main:", error);
  }
}

mainModule().catch((error) => {
  console.error("Unhandled error:", error);
});
