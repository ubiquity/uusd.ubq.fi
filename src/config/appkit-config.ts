import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, polygon, optimism } from '@reown/appkit/networks';
import type { AppKit } from '@reown/appkit';

// Get project ID from environment
const projectId = import.meta.env?.REOWN_PROJECT_ID || 
                  (typeof process !== 'undefined' ? process.env.REOWN_PROJECT_ID : undefined);

if (!projectId) {
  console.warn('VITE_REOWN_PROJECT_ID not set - AppKit will not work');
}

// Define supported networks
export const networks = [mainnet, arbitrum, polygon, optimism];

// Configure Wagmi adapter
export const wagmiAdapter = new WagmiAdapter({
  projectId: projectId || '',
  networks,
});

// Define the AppKit instance
export let appKit: AppKit | null = null;

export function initializeAppKit(): AppKit {
  if (appKit) return appKit;

  if (!projectId) {
    throw new Error('Cannot initialize AppKit: VITE_REOWN_PROJECT_ID not set');
  }

  appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata: {
      name: 'UUSD DeFi',
      description: 'Ubiquity Dollar Stablecoin Platform',
      url: 'https://uusd.ubq.fi',
      icons: ['https://uusd.ubq.fi/icon.png'],
    },
    features: {
      analytics: true,
      email: false,
      socials: [],
    },
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#3B82F6',
      '--w3m-border-radius-master': '4px',
    },
  });

  return appKit;
}

export const wagmiConfig = wagmiAdapter.wagmiConfig;