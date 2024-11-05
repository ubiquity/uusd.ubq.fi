import { createAppKit } from "@reown/appkit";
import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
import { mainnet, sepolia } from "@reown/appkit/networks";
import { ethers } from "ethers";
import "./router";

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

export const appState = createAppKit({
  adapters: [new Ethers5Adapter()],
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

export async function mainModule() {
  try {
    console.log("Provider:", provider);
    console.log("Signer:", userSigner);

    console.log("Waiting for user connection...");
    await waitForConnection();
  } catch (error) {
    console.error("Error in main:", error);
  }
}

mainModule().catch((error) => {
  console.error("Unhandled error:", error);
});
