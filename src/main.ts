import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { mainnet, sepolia } from "@reown/appkit/networks";
import { renderHeader } from "./render/render-header";
import { fetchTokens } from "./fetch-tokens";
import { quoteSwaps } from "./quote-swaps";
import { executeSwaps } from "./swap";
import { ethers } from "ethers";

declare const BACKEND_PRIVATE_KEY: string; // @DEV: passed in at build time

const projectId = "415760038f8e330de4868120be3205b8";

const metadata = {
  name: "UUSD Minting DApp",
  description: "Mint UUSD on Gnosis with Reown AppKit",
  url: "https://uusd.ubq.fi",
  icons: ["https://avatars.githubusercontent.com/u/76412717"],
};

// create provider & signer for Ethereum mainnet
export const provider = new ethers.providers.JsonRpcProvider("https://1rpc.io/sepolia"); // for mainnet https://eth.llamarpc.com
export const userSigner = provider.getSigner();
export const backendSigner = new ethers.Wallet(BACKEND_PRIVATE_KEY!, provider);

export const appState = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet, sepolia],
  defaultNetwork: sepolia,
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

function handleNetworkSwitch() {
  appState.subscribeCaipNetworkChange(async (newNetwork) => {
    console.log("Network changed to:", newNetwork?.id);
    try {
      console.log("Fetching tokens for new network...");
      const tokens = await fetchTokens();
      console.log("Tokens:", tokens);

      let quoteLusd, quoteUbq, feesInInputCurrency;
      if (newNetwork?.id === sepolia.id) {
        ({ quoteLusd, quoteUbq, feesInInputCurrency } = await quoteSwaps(tokens[371], 40)); // Sepolia USDT
      } else {
        ({ quoteLusd, quoteUbq, feesInInputCurrency } = await quoteSwaps(tokens[93], 1)); // Mainnet WETH
      }

      setupExecuteButton(quoteLusd, quoteUbq); // Update button to execute swaps
    } catch (error) {
      console.error("Error handling network switch:", error);
    }
  });
}

function setupExecuteButton(quoteLusd: any, quoteUbq: any) {
  const button = document.createElement("button");
  button.textContent = "Execute Swaps";
  button.style.marginTop = "20px";
  const slippage = appState.getChainId() === sepolia.id ? 0.2 : 0; // sepolia needs slippage to go through
  button.onclick = () => {
    console.log("Executing swaps...");
    executeSwaps(quoteLusd, quoteUbq, slippage);
  };

  const container = document.getElementById("button-container");
  if (container) {
    container.innerHTML = ""; // clear previous button
    container.appendChild(button); // add new button
  }
}

export async function mainModule() {
  try {
    console.log("Provider:", provider);
    console.log("Signer:", userSigner);
    console.log("Backend Signer:", backendSigner);

    console.log("Initializing Reown AppKit...");
    renderHeader();

    console.log("Waiting for user connection...");
    await waitForConnection();

    console.log("Setting up network switch handler...");
    handleNetworkSwitch();

    console.log("Fetching initial tokens...");
    const tokens = await fetchTokens();
    console.log("Tokens:", tokens);

    console.log("Quoting swaps...");
    let quoteLusd, quoteUbq, feesInInputCurrency;
    if ((appState.getChainId() as number) === sepolia.id) {
      ({ quoteLusd, quoteUbq, feesInInputCurrency } = await quoteSwaps(tokens[371], 40)); // sepolia USDT
    } else {
      ({ quoteLusd, quoteUbq, feesInInputCurrency } = await quoteSwaps(tokens[93], 1)); // mainnet WETH
    }

    setupExecuteButton(quoteLusd, quoteUbq); // render the execute button
  } catch (error) {
    console.error("Error in main:", error);
  }
}

mainModule().catch((error) => {
  console.error("Unhandled error:", error);
});
