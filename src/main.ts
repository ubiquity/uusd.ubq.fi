import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { mainnet } from "@reown/appkit/networks";
import { renderHeader } from "./render/render-header";
import { fetchTokens } from "./fetch-tokens";
import { quoteSwaps } from "./quote-swaps";
import { executeSwaps } from "./swap";
import { ethers } from "ethers";

const projectId = "415760038f8e330de4868120be3205b8";

const metadata = {
  name: "UUSD Minting DApp",
  description: "Mint UUSD on Gnosis with Reown AppKit",
  url: "https://uusd.ubq.fi",
  icons: ["https://avatars.githubusercontent.com/u/76412717"],
};

// create a default provider & signer for Ethereum mainnet
export const provider = new ethers.providers.JsonRpcProvider("https://eth.llamarpc.com");
export const signer = provider.getSigner();

export const appState = createAppKit({
  adapters: [new EthersAdapter()],
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
    }, 1000); // poll every second
  });
}

export async function mainModule() {
  try {
    console.log("Provider: ", provider);
    console.log("Signer: ", signer);

    console.log("Initializing Reown AppKit...");
    renderHeader();

    console.log("Waiting for user connection...");
    await waitForConnection(); // wait until the user connects

    console.log("Fetching tokens...");
    const tokens = await fetchTokens();
    console.log("Tokens: ", tokens);

    console.log("Quoting swaps...");
    const { quoteLusd, quoteUbq } = await quoteSwaps(tokens[0], 1000000);

    console.log("Executing swaps...");
    executeSwaps(quoteLusd, quoteUbq);
  } catch (error) {
    console.error("Error in main:", error);
  }
}

mainModule().catch((error) => {
  console.error("Unhandled error:", error);
});
