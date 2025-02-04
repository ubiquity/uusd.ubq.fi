import "./router";
import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { anvil, AppKitNetwork, mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";
import { setupContracts } from "./contracts";
import { handleRouting } from "./router";
import { renderErrorInModal } from "./common/display-popup-modal";
import { CollateralOption, fetchCollateralOptions } from "./common/collateral";

// All unhandled errors are caught and displayed in a modal
window.addEventListener("error", (event: ErrorEvent) => renderErrorInModal(event.error));

// All unhandled promise rejections are caught and displayed in a modal
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  renderErrorInModal(event.reason as Error);
  event.preventDefault();
});

const projectId = "415760038f8e330de4868120be3205b8";

const metadata = {
  name: "UUSD Pool DApp",
  description: "Mint UUSD or redeem collateral on Gnosis with Reown AppKit",
  url: "https://uusd.ubq.fi",
  icons: ["https://avatars.githubusercontent.com/u/76412717"],
};

export const providersUrl: { [key: string]: string } = {
  1: "https://eth.drpc.org",
  31337: "http://127.0.0.1:8545",
};

export const explorersUrl: { [key: string]: string } = {
  1: "https://etherscan.io",
  31337: "http://127.0.0.1:8545",
};

let networks: [AppKitNetwork, ...AppKitNetwork[]];

if (window.location.hostname === "localhost" || window.location.hostname === "0.0.0.0") {
  console.log("enabling anvil");
  networks = [anvil, mainnet];
} else {
  networks = [mainnet];
}

export const appState = createAppKit({
  adapters: [new Ethers5Adapter()],
  networks: networks,
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
  return new ethers.providers.JsonRpcProvider(providersUrl[networkId]);
};
export let userSigner: ethers.Signer;

function getWeb3Provider() {
  if (window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum);
  }
  throw new Error("No Ethereum provider found");
}

// setup contract instances
export const { dollarContract, governanceContract, diamondContract, twapOracleContract, lusdFeedContract } = setupContracts(provider());

async function waitForConnection() {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (appState.getIsConnectedState()) {
        userSigner = getWeb3Provider().getSigner(appState.getAddress());
        console.log(`User connected: ${appState.getAddress()}`);
        clearInterval(interval);
        resolve();
      } else {
        console.log("Waiting for user to connect...");
      }
    }, 1000);
  });
}

function handleNetworkSwitch() {
  // network change listener
  appState.subscribeCaipNetworkChange(async (newState?: { id: string | number; name: string }) => {
    if (newState) {
      userSigner = getWeb3Provider().getSigner(appState.getAddress());
      console.log(`Network switched to ${newState.name} (${newState.id})`);
    }
  });

  // wallet connection listener
  appState.subscribeWalletInfo(async () => {
    userSigner = getWeb3Provider().getSigner(appState.getAddress());
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
    handleNetworkSwitch();
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
