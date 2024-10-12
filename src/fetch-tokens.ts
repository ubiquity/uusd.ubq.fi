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
    source: "https://files.cow.fi/tokens/CowSwap.json",
  },
  {
    priority: 2,
    source: "https://files.cow.fi/tokens/CoinGecko.json",
  },
];

const allowedChainIds = [1]; // only ethereum mainnet for now
const DB_NAME = "uusd-dapp";
const STORE_NAME = "tokens";
const DB_VERSION = 1;

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
 * Fetches tokens from IndexedDB if available.
 */
async function getTokensFromDB(): Promise<Token[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get("tokens");

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores tokens in IndexedDB.
 */
async function storeTokensInDB(tokens: Token[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(tokens, "tokens");

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
  if (cachedTokens) {
    console.log("Tokens loaded from IndexedDB");
    return cachedTokens;
  }

  // Fetch from sources if not in IndexedDB
  try {
    const responses = await Promise.all(
      sources.map((source) => fetch(source.source).then((res) => res.json()))
    );

    const cowSwapTokens = responses[0].tokens;
    const coinGeckoTokens = responses[1].tokens;

    const tokenMap = new Map<string, Token>();

    cowSwapTokens.forEach((token: Token) => {
      if (allowedChainIds.includes(token.chainId)) {
        tokenMap.set(token.address, token);
      }
    });

    coinGeckoTokens.forEach((token: Token) => {
      if (allowedChainIds.includes(token.chainId) && !tokenMap.has(token.address)) {
        tokenMap.set(token.address, token);
      }
    });

    const tokens = Array.from(tokenMap.values());

    // Store the fetched tokens in IndexedDB
    await storeTokensInDB(tokens);

    console.log("Tokens fetched from sources and stored in IndexedDB");
    return tokens;
  } catch (error) {
    console.error("Error fetching token lists:", error);
    throw new Error("Failed to fetch token lists.");
  }
}