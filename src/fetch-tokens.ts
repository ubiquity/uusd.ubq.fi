// this file fetches token lists accepted by CoW Swap to offer as input options
import axios from 'axios';

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  logoURI: string;
}

export interface TokenList {
  tokens: Token[];
}

const sources = [
  {
    priority: 1,
    source: 'https://files.cow.fi/tokens/CowSwap.json',
  },
  {
    priority: 2,
    source: 'https://files.cow.fi/tokens/CoinGecko.json',
  },
];

const allowedChainIds = [1]; // only ethereum mainnet for now

/**
 * fetches accepted tokens in CoW Swap
 */
export async function fetchTokens(): Promise<Token[]> {
  try {
    const responses = await Promise.all(
      sources.map((source) => axios.get<TokenList>(source.source))
    );

    const cowSwapTokens = responses[0].data.tokens;
    const coinGeckoTokens = responses[1].data.tokens;

    // only store unique tokens, that's why a map
    const tokenMap = new Map<string, Token>();

    cowSwapTokens.forEach((token) => {
      if (allowedChainIds.includes(token.chainId)) {
        tokenMap.set(token.address, token); // map each token by its address if it's on ethereum mainnet
      }
    });

    coinGeckoTokens.forEach((token) => {
      if (allowedChainIds.includes(token.chainId) && !tokenMap.has(token.address)) {
        tokenMap.set(token.address, token)
      }
    });

    return Array.from(tokenMap.values());
  } catch (error) {
    console.error('Error fetching token lists:', error);
    throw new Error('Failed to fetch token lists.');
  }
}