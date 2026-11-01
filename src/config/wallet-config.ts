import { createAppKit } from "@reown/appkit";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { type AppKitNetwork, arbitrum, gnosis, mainnet } from "@reown/appkit/networks";
import { http } from "viem";
import { RPC_URL } from "../../tools/config.ts";

// Injected by tools/build.ts. Only this public identifier is exposed to the browser.
declare const __REOWN_PROJECT_ID__: string;

function createWalletConfig() {
  const projectId = __REOWN_PROJECT_ID__.trim();
  if (!projectId) {
    throw new Error("Wallet connections are unavailable. Set NEXT_PUBLIC_PROJECT_ID and rebuild the app.");
  }

  const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, gnosis, arbitrum];
  const adapter = new WagmiAdapter({
    projectId,
    networks,
    transports: { [mainnet.id]: http(RPC_URL) },
  });
  const appKit = createAppKit({
    adapters: [adapter],
    networks,
    projectId,
    metadata: {
      name: "Ubiquity Dollar",
      description: "Deposit, withdraw and exchange Ubiquity Dollars",
      url: globalThis.location.origin,
      icons: [`${globalThis.location.origin}/icon-192x192.png`],
    },
    features: { analytics: false, email: false, socials: [] },
  });

  return { appKit, wagmiConfig: adapter.wagmiConfig };
}

let walletConfig: ReturnType<typeof createWalletConfig> | undefined;

export function getWalletConfig() {
  // Initialize once, on demand, so missing wallet configuration does not break read-only views.
  return (walletConfig ??= createWalletConfig());
}
