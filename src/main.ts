import "./router.ts";
import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { AppKitNetwork, mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";
import { setupContracts } from "./contracts.ts";
import { handleRouting } from "./router.ts";
import { renderErrorInModal } from "./common/display-popup-modal.ts";
import { CollateralOption, fetchCollateralOptions } from "./common/collateral.ts";
import { useRpcHandler } from "./common/use-rpc-handler.ts";

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

// Initialize with mainnet only - production-ready default
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet];

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
  const detectedNetworkId = Number(appState.getChainId());
  console.log("Detected network ID:", detectedNetworkId);

  // Production-ready: Always use mainnet (1) for provider and contracts
  // This DApp is configured for mainnet-only operation
  const mainnetId = 1;
  console.log("Using mainnet provider for contracts and data fetching");
  provider = await useRpcHandler(mainnetId);

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
    // Try to get dollar price with fallback options
    dollarSpotPrice = await fetchDollarPrice();

    // Try to get governance price with fallback options
    governanceSpotPrice = await fetchGovernancePrice();

    // Try to get LUSD price with fallback options
    lusdPrice = await fetchLusdPrice();

    console.log("Successfully fetched prices:", { dollarSpotPrice, governanceSpotPrice, lusdPrice });
  } catch (error) {
    console.error("Error getting prices:", error);
    renderErrorInModal(new Error("Price data temporarily unavailable. The oracle may need updating."));
  }
}

async function fetchDollarPrice(): Promise<string> {
  try {
    // Primary: Try the main contract method
    const dollarSpotPriceRaw = await diamondContract?.getDollarPriceUsd();
    return ethers.utils.formatUnits(dollarSpotPriceRaw, 6);
  } catch (error) {
    console.warn("Primary dollar price fetch failed, trying TWAP oracle:", error);

    try {
      // Fallback: Try TWAP oracle
      const twapPrice = await twapOracleContract?.price0Average();
      if (twapPrice && !twapPrice.isZero()) {
        console.log("Using TWAP oracle for dollar price");
        return ethers.utils.formatUnits(twapPrice, 18); // TWAP typically uses 18 decimals
      }
    } catch (twapError) {
      console.warn("TWAP oracle also failed:", twapError);
    }

    // No fake data - throw error when all legitimate sources fail
    throw new Error("All dollar price sources failed - price data unavailable");
  }
}

async function fetchGovernancePrice(): Promise<string> {
  try {
    // Primary: Try the main contract method
    const governanceSpotPriceRaw = await diamondContract?.getGovernancePriceUsd();
    return ethers.utils.formatUnits(governanceSpotPriceRaw, 6);
  } catch (error) {
    console.warn("Primary governance price fetch failed, trying TWAP oracle:", error);

    try {
      // Fallback: Try TWAP oracle for governance token
      const twapPrice = await twapOracleContract?.price1Average();
      if (twapPrice && !twapPrice.isZero()) {
        console.log("Using TWAP oracle for governance price");
        return ethers.utils.formatUnits(twapPrice, 18);
      }
    } catch (twapError) {
      console.warn("TWAP oracle also failed:", twapError);
    }

    // No fake data - throw error when all legitimate sources fail
    throw new Error("All governance price sources failed - price data unavailable");
  }
}

async function fetchLusdPrice(): Promise<string> {
  try {
    // Primary: Try direct Chainlink feed
    const lusdPriceRaw = await lusdFeedContract?.latestAnswer();
    return ethers.utils.formatUnits(lusdPriceRaw, 8);
  } catch (error) {
    console.warn("LUSD price fetch failed:", error);

    // No fake data - throw error when legitimate source fails
    throw new Error("LUSD price source failed - price data unavailable");
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
