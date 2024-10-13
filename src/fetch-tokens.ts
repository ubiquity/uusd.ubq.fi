import { mainnet, sepolia } from "./constants";
import { Token } from "./types";

const sources = [
  {
    priority: 1,
    source: "https://files.cow.fi/tokens/CowSwap.json",
  },
  {
    priority: 2,
    source: "https://files.cow.fi/tokens/CoinGecko.json",
  },
  {
    priority: 3,
    source: "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/CowSwapSepolia.json",
  },
];

const allowedChainIds = [mainnet, sepolia];
const DB_NAME = "uusd-dapp";
const STORE_NAME = "tokens";
const DB_VERSION = 1;
const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CachedData {
  tokens: Token[];
  timestamp: number;
}

/**
 * Opens IndexedDB and returns a promise with the database instance.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetches tokens from IndexedDB if available and valid.
 */
async function getTokensFromDB(): Promise<Token[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get("tokens");

    request.onsuccess = () => {
      const cachedData: CachedData | null = request.result;
      if (cachedData) {
        const isExpired = Date.now() - cachedData.timestamp > CACHE_EXPIRATION_MS;
        if (!isExpired) {
          console.log("Tokens loaded from IndexedDB");
          return resolve(cachedData.tokens);
        } else {
          console.log("Cache expired, fetching new data...");
        }
      }
      resolve(null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores tokens in IndexedDB with a timestamp.
 */
async function storeTokensInDB(tokens: Token[]): Promise<void> {
  const db = await openDB();
  const cachedData: CachedData = {
    tokens,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(cachedData, "tokens");

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetches accepted tokens in CoW Swap, with fallback to IndexedDB.
 */
export async function fetchTokens(): Promise<Token[]> {
  // Try getting tokens from IndexedDB first
  const cachedTokens = await getTokensFromDB();
  if (cachedTokens) return cachedTokens;

  // Fetch from sources if not in IndexedDB or cache expired
  try {
    const responses = await Promise.all(
      sources.map((source) => fetch(source.source).then((res) => res.json()))
    );

    const cowSwapTokens = responses[0].tokens;
    const coinGeckoTokens = responses[1].tokens;
    const sepoliaTokens = responses[2].tokens;

    const tokenMap = new Map<string, Token>();

    [cowSwapTokens, coinGeckoTokens, sepoliaTokens].forEach((tokenList) => {
      tokenList.forEach((token: Token) => {
        if (allowedChainIds.includes(token.chainId) && !tokenMap.has(token.address)) {
          tokenMap.set(token.address, token);
        }
      });
    });

    const tokens = Array.from(tokenMap.values());

    // Store the fetched tokens in IndexedDB with timestamp
    await storeTokensInDB(tokens);

    console.log("Tokens fetched from sources and stored in IndexedDB");
    return tokens;
  } catch (error) {
    console.error("Error fetching token lists:", error);
    throw new Error("Failed to fetch token lists.");
  }
}