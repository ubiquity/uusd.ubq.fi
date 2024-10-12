import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, gnosis} from '@reown/appkit/networks';
import { BrowserProvider } from 'ethers';
import { renderHeader } from './render/render-header';
import { fetchTokens } from './fetch-tokens';

const projectId = '415760038f8e330de4868120be3205b8';

const metadata = {
  name: 'UUSD Minting DApp',
  description: 'Mint UUSD on Gnosis with Reown AppKit',
  url: 'https://uusd.ubq.fi',
  icons: ['https://avatars.githubusercontent.com/u/76412717'],
};

const modal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet, gnosis],
  metadata,
  projectId,
  features: {
    analytics: true,
  },
});

export async function mainModule() {
  try {
    console.log('Initializing Reown AppKit...');
    renderHeader();
    console.log('Fetching tokens...');
    const tokens = await fetchTokens();
    console.log('tokens: ',tokens);
  } catch (error) { 
    console.error('Error in main:', error);
  }
}

mainModule().catch((error) => {
  console.error('Unhandled error:', error);
});