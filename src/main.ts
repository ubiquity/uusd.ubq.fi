import "./router";
import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { anvil, AppKitNetwork, mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";
import { setupContracts } from "./contracts";
import { handleRouting } from "./router";
import { renderErrorInModal } from "./common/display-popup-modal";
import { CollateralOption, fetchCollateralOptions } from "./common/collateral";
import { providersUrl } from "./constants";
import { useRpcHandler } from "./common/use-rpc-handler";

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

// providers and signers
export let provider: ethers.providers.JsonRpcProvider | undefined;
export let userSigner: ethers.Signer | undefined;
let web3Provider: ethers.providers.Web3Provider | undefined;

// setup contract instances
export let dollarContract: ethers.Contract | undefined;
export let governanceContract: ethers.Contract | undefined;
export let diamondContract: ethers.Contract | undefined;
export let twapOracleContract: ethers.Contract | undefined;
export let lusdFeedContract: ethers.Contract | undefined;

async function initializeProviderAndSigner() {
  const networkId = Number(appState.getChainId());
  if (networkId && providersUrl[networkId]) {
    // read-only provider for fetching
    provider = await useRpcHandler(networkId);
  } else {
    console.error("No provider URL found for the current network ID");
    provider = undefined;
  }

  // if user is connected, set up the signer using the injected provider (window.ethereum)
  if (appState.getIsConnectedState() && window.ethereum) {
    const ethereum = window.ethereum as ethers.providers.ExternalProvider;
    if (ethereum.request) {
      await ethereum.request({ method: "eth_requestAccounts" });
    }

    // Create a Web3Provider from window.ethereum
    web3Provider = new ethers.providers.Web3Provider(window.ethereum);

    // web3Provider signer will handle transaction signing
    userSigner = web3Provider.getSigner(appState.getAddress());

    console.log("User address:", await userSigner.getAddress());
  } else {
    userSigner = undefined;
  }

  ({ dollarContract, governanceContract, diamondContract, twapOracleContract, lusdFeedContract } = setupContracts(provider));
}

function handleNetworkSwitch() {
  // network change listener
  appState.subscribeCaipNetworkChange(async (newState?: { id: string | number; name: string }) => {
    if (newState) {
      await initializeProviderAndSigner();
      window.location.reload();
      console.log(`Network switched to ${newState.name} (${newState.id})`);
    }
  });

  // wallet connection listener
  appState.subscribeWalletInfo(async () => {
    await initializeProviderAndSigner();
  });
}

// global dollar and governance prices
export let dollarSpotPrice: string | null = null;
export const dollarTwapPrice: string | null = null;
export let governanceSpotPrice: string | null = null;
export let lusdPrice: string | null = null;

async function updatePrices() {
  try {
    const dollarSpotPriceRaw = await diamondContract?.getDollarPriceUsd();
    const governanceSpotPriceRaw = await diamondContract?.getGovernancePriceUsd();
    const lusdPriceRaw = await lusdFeedContract?.latestAnswer();

    dollarSpotPrice = ethers.utils.formatUnits(dollarSpotPriceRaw, 6);
    governanceSpotPrice = ethers.utils.formatUnits(governanceSpotPriceRaw, 6);
    lusdPrice = ethers.utils.formatUnits(lusdPriceRaw, 8);
  } catch (error) {
    console.error("Error getting prices:", error);
    renderErrorInModal(new Error("Our RPC is very busy, please try again later."));
  }
}

export let collateralOptions: CollateralOption[] = [];

export async function mainModule() {
  try {
    await initializeProviderAndSigner();
    console.log("Provider:", provider);

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
