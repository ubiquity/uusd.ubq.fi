import { createAppKit, type AppKit } from "@reown/appkit";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, mainnet, optimism, polygon } from "@reown/appkit/networks";

const rawProjectId = (process.env.REOWN_PROJECT_ID ?? "").trim();
export const reownProjectId = rawProjectId.length > 0 ? rawProjectId : null;

export const networks = [mainnet, arbitrum, polygon, optimism] as const;

// Keep wagmi config available even when no project id is configured.
// In that case, AppKit is disabled and we fall back to the legacy MetaMask flow.
const wagmiAdapter = new WagmiAdapter({
  projectId: reownProjectId ?? "missing-reown-project-id",
  networks: [...networks],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

let appKit: AppKit | null = null;

export function getOrCreateAppKit(): AppKit | null {
  if (!reownProjectId) return null;
  if (appKit) return appKit;

  appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks: [...networks],
    projectId: reownProjectId,
    metadata: {
      name: "UUSD DeFi",
      description: "Ubiquity Dollar Stablecoin Platform",
      url: "https://uusd.ubq.fi",
      icons: ["https://uusd.ubq.fi/icon-192x192.png"],
    },
    features: {
      analytics: true,
      email: false,
      socials: [],
    },
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#3B82F6",
      "--w3m-border-radius-master": "4px",
    },
  });

  return appKit;
}
