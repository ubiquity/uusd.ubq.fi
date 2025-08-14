import type { Address, PublicClient } from "viem";
import { formatUnits } from "viem";
import type { WalletService } from "./wallet-service.ts";
import type { ContractService } from "./contract-service.ts";
import type { PriceService } from "./price-service.ts";
import { batchFetchTokenBalances, type TokenBalanceBatchResult } from "../utils/batch-request-utils.ts";
import { INVENTORY_TOKENS } from "../types/inventory.types.ts";
import type { TokenBalance } from "../types/inventory.types.ts";
import { ADDRESSES, DIAMOND_ABI } from "../contracts/constants.ts";

/**
 * Centralized data that gets refreshed every 15 seconds
 */
export interface RefreshData {
  // Price data
  uusdPrice: string;
  lusdPrice: bigint;
  ubqPrice: bigint;

  // Token balances (only if wallet connected)
  tokenBalances: TokenBalance[] | null;

  // Protocol data
  collateralRatio: bigint;
  allCollaterals: readonly Address[];

  // Thresholds
  mintThreshold: bigint;
  redeemThreshold: bigint;

  // Curve data
  curveExchangeRate: bigint;
  
  // Protocol status
  isMintingAllowed: boolean;
  isRedeemingAllowed: boolean;
  twapPrice: bigint;
}

/**
 * Callback type for refresh data updates
 */
export type RefreshDataCallback = (data: RefreshData) => void;

/**
 * Service dependencies
 */
export interface RefreshServiceDependencies {
  walletService: WalletService;
  contractService: ContractService;
  priceService: PriceService;
}

/**
 * Centralized refresh service that batches all periodic RPC calls
 * Reduces ~13-15 individual calls to 2-3 efficient batch calls
 */
export class CentralizedRefreshService {
  private _services: RefreshServiceDependencies;
  private _refreshInterval: number | null = null;
  private _callbacks: RefreshDataCallback[] = [];
  private _lastData: RefreshData | null = null;
  private readonly _intervalMs = 15000; // 15 seconds - aligned with Ethereum block time
  private readonly _localStorageKey = "ubiquity_refresh_data";

  // Cache last successful price values
  private _lastGoodPrices: {
    lusdPrice: bigint | null;
    ubqPrice: bigint | null;
    uusdPrice: string | null;
  } = {
    lusdPrice: null,
    ubqPrice: null,
    uusdPrice: null,
  };

  constructor(services: RefreshServiceDependencies) {
    this._services = services;
  }

  /**
   * Start the centralized refresh cycle
   */
  public start(): void {
    this.stop(); // Clear any existing interval

    // Load cached data immediately for instant UI
    const cachedData = this._loadFromLocalStorage();
    if (cachedData) {
      this._lastData = cachedData;
      this._notifyCallbacks(cachedData);
      console.log("📦 Loaded cached data from localStorage");
    }

    // Initial refresh (will update with fresh data)
    this._performRefresh().catch((error) => {
      console.warn("Initial centralized refresh failed:", error);
    });

    // Set up periodic refresh
    this._refreshInterval = window.setInterval(() => {
      this._performRefresh().catch((error) => {
        console.warn("Centralized refresh failed:", error);
      });
    }, this._intervalMs);

    console.log("🔄 Centralized refresh service started (15s intervals)");
  }

  /**
   * Stop the refresh cycle
   */
  public stop(): void {
    if (this._refreshInterval) {
      window.clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  /**
   * Subscribe to refresh data updates
   */
  public subscribe(callback: RefreshDataCallback): void {
    this._callbacks.push(callback);

    // If we have cached data, call immediately
    if (this._lastData) {
      try {
        callback(this._lastData);
      } catch (error) {
        console.error("Error in refresh callback:", error);
      }
    }
  }

  /**
   * Unsubscribe from refresh data updates
   */
  public unsubscribe(callback: RefreshDataCallback): void {
    const index = this._callbacks.indexOf(callback);
    if (index > -1) {
      this._callbacks.splice(index, 1);
    }
  }

  /**
   * Get the last refreshed data (cached)
   */
  public getLastData(): RefreshData | null {
    return this._lastData;
  }

  /**
   * Perform the centralized refresh with batched RPC calls
   */
  private async _performRefresh(): Promise<void> {
    try {
      const publicClient = this._services.walletService.getPublicClient();
      const account = this._services.walletService.getAccount();

      // BATCH 1: Diamond contract multicall (most efficient)
      const diamondMulticallData = await this._fetchDiamondData(publicClient);

      // BATCH 2: Token balances (only if wallet connected)
      const tokenBalancesData = account ? await this._fetchTokenBalances(publicClient, account) : null;

      // BATCH 3: External data (storage reads only - use price service for Curve data)
      const externalData = await this._fetchExternalData(publicClient);

      // Get current UUSD price from price service - no fallbacks
      const uusdPrice = await this._services.priceService.getCurrentUUSDPrice();
      this._lastGoodPrices.uusdPrice = uusdPrice;

      // Calculate USD values for token balances before creating final data
      const tokenBalancesWithUSD = tokenBalancesData && tokenBalancesData.length > 0 
        ? this._calculateTokenUSDValues(tokenBalancesData, diamondMulticallData.lusdPrice, diamondMulticallData.ubqPrice, uusdPrice)
        : tokenBalancesData;

      // Calculate minting/redeeming status based on TWAP vs thresholds
      const isMintingAllowed = diamondMulticallData.twapPrice >= externalData.mintThreshold;
      const isRedeemingAllowed = diamondMulticallData.twapPrice <= externalData.redeemThreshold;

      // Compile all data
      const refreshData: RefreshData = {
        uusdPrice,
        lusdPrice: diamondMulticallData.lusdPrice,
        ubqPrice: diamondMulticallData.ubqPrice,
        tokenBalances: tokenBalancesWithUSD,
        collateralRatio: diamondMulticallData.collateralRatio,
        allCollaterals: diamondMulticallData.allCollaterals,
        mintThreshold: externalData.mintThreshold,
        redeemThreshold: externalData.redeemThreshold,
        curveExchangeRate: 0n, // Not needed since we use price service
        isMintingAllowed,
        isRedeemingAllowed,
        twapPrice: diamondMulticallData.twapPrice,
      };

      // Cache and notify
      this._lastData = refreshData;
      this._saveToLocalStorage(refreshData);
      this._notifyCallbacks(refreshData);
    } catch (error) {
      console.error("Centralized refresh failed:", error);
      // Continue with stale data - don't break the refresh cycle
    }
  }

  /**
   * BATCH 1: Fetch all Diamond contract data in single multicall
   */
  private async _fetchDiamondData(publicClient: PublicClient) {
    const diamondAddress = ADDRESSES.DIAMOND;

    // Single multicall with all Diamond contract reads
    const multicallResults = await publicClient.multicall({
      contracts: [
        {
          address: diamondAddress,
          abi: DIAMOND_ABI,
          functionName: "collateralRatio",
        },
        {
          address: diamondAddress,
          abi: DIAMOND_ABI,
          functionName: "getDollarPriceUsd",
        },
        {
          address: diamondAddress,
          abi: DIAMOND_ABI,
          functionName: "getGovernancePriceUsd",
        },
        {
          address: diamondAddress,
          abi: DIAMOND_ABI,
          functionName: "allCollaterals",
        },
        {
          address: diamondAddress,
          abi: DIAMOND_ABI,
          functionName: "getTwapOracleCollateralPrice",
          args: [0], // LUSD collateral index
        },
      ],
    });

    // Extract prices - throw error if critical data missing
    if (!multicallResults || multicallResults.length < 5) {
      throw new Error(`Insufficient multicall results: expected 5, got ${multicallResults?.length || 0}`);
    }

    if (multicallResults[1].status !== "success") {
      throw new Error("Failed to fetch LUSD price from Diamond contract");
    }
    const lusdPrice = multicallResults[1].result as bigint;
    this._lastGoodPrices.lusdPrice = lusdPrice;

    if (multicallResults[2].status !== "success") {
      throw new Error("Failed to fetch UBQ price from Diamond contract");
    }
    const ubqPrice = multicallResults[2].result as bigint;
    this._lastGoodPrices.ubqPrice = ubqPrice;

    const twapPrice = multicallResults[4].status === "success" ? (multicallResults[4].result as bigint) : 0n;

    return {
      collateralRatio: multicallResults[0].status === "success" ? (multicallResults[0].result as bigint) : 0n,
      lusdPrice,
      ubqPrice,
      allCollaterals: multicallResults[3].status === "success" ? (multicallResults[3].result as readonly Address[]) : [],
      twapPrice,
    };
  }

  /**
   * BATCH 2: Fetch token balances for connected wallet
   */
  private async _fetchTokenBalances(publicClient: PublicClient, account: Address): Promise<TokenBalance[]> {
    // Prepare tokens for batch request
    const tokens = Object.values(INVENTORY_TOKENS).map((token) => ({
      address: token.address,
      symbol: token.symbol,
    }));

    // Execute batch request for all token balances
    const batchResults = await batchFetchTokenBalances(publicClient, tokens, account);

    // Convert to TokenBalance format (USD values will be calculated from cached price data)
    return batchResults.map((result: TokenBalanceBatchResult): TokenBalance => {
      const tokenMetadata = INVENTORY_TOKENS[result.symbol];
      return {
        symbol: result.symbol,
        address: result.tokenAddress,
        balance: result.balance,
        decimals: tokenMetadata.decimals,
        usdValue: 0, // Will be calculated after we have all price data
      };
    });
  }

  /**
   * BATCH 3: Fetch external data (Curve + storage reads) using single batched RPC request
   */
  private async _fetchExternalData(publicClient: PublicClient) {
    const diamondAddress = ADDRESSES.DIAMOND;

    // Get storage data (no multicall needed since it's just storage reads)
    const [mintThreshold, redeemThreshold] = await Promise.all([
      publicClient.getStorageAt({ address: diamondAddress, slot: "0x0c" }), // slot 12
      publicClient.getStorageAt({ address: diamondAddress, slot: "0x0d" }), // slot 13
    ]);

    return {
      mintThreshold: mintThreshold ? BigInt(mintThreshold) : 0n,
      redeemThreshold: redeemThreshold ? BigInt(redeemThreshold) : 0n,
    };
  }

  /**
   * Calculate UUSD price from LUSD price and Curve exchange rate
   */
  private _calculateUUSDPrice(lusdPrice: bigint, curveExchangeRate: bigint): string {
    try {
      const lusdPriceFloat = parseFloat(formatUnits(lusdPrice, 6));
      const exchangeRateFloat = parseFloat(formatUnits(curveExchangeRate, 18));

      if (exchangeRateFloat === 0) {
        return "1.000000"; // Fallback
      }

      const uusdPrice = lusdPriceFloat / exchangeRateFloat;
      return uusdPrice.toFixed(6);
    } catch (error) {
      console.warn("Failed to calculate UUSD price:", error);
      return "1.000000"; // Fallback
    }
  }

  /**
   * Calculate USD values for token balances using cached price data
   */
  private _calculateTokenUSDValues(tokenBalances: TokenBalance[], lusdPrice: bigint, ubqPrice: bigint, uusdPriceStr: string): TokenBalance[] {
    // Remove $ sign if present and parse
    const uusdPriceClean = uusdPriceStr.replace(/^\$/, "");
    const uusdPrice = parseFloat(uusdPriceClean);

    // Validate all prices
    if (isNaN(uusdPrice) || !isFinite(uusdPrice) || uusdPrice <= 0) {
      throw new Error(`Invalid UUSD price: ${uusdPriceStr} -> ${uusdPrice}`);
    }

    const lusdPriceFloat = parseFloat(formatUnits(lusdPrice, 6));
    const ubqPriceFloat = parseFloat(formatUnits(ubqPrice, 6));

    if (isNaN(lusdPriceFloat) || !isFinite(lusdPriceFloat) || lusdPriceFloat <= 0) {
      throw new Error(`Invalid LUSD price: ${lusdPrice} -> ${lusdPriceFloat}`);
    }

    if (isNaN(ubqPriceFloat) || !isFinite(ubqPriceFloat) || ubqPriceFloat <= 0) {
      throw new Error(`Invalid UBQ price: ${ubqPrice} -> ${ubqPriceFloat}`);
    }

    console.log("💰 Calculating USD values with prices:", {
      lusdPrice: lusdPriceFloat,
      ubqPrice: ubqPriceFloat,
      uusdPrice,
    });

    return tokenBalances.map((balance) => {
      let priceInUsd: number;

      if (balance.symbol === "UUSD") {
        priceInUsd = uusdPrice;
      } else if (balance.symbol === "UBQ") {
        priceInUsd = ubqPriceFloat;
      } else if (balance.symbol === "LUSD") {
        priceInUsd = lusdPriceFloat;
      } else {
        throw new Error(`Unknown token symbol: ${balance.symbol}`);
      }

      const tokenAmount = parseFloat(formatUnits(balance.balance, balance.decimals));
      const usdValue = tokenAmount * priceInUsd;

      // Validate USD value
      if (isNaN(usdValue) || !isFinite(usdValue) || usdValue < 0) {
        throw new Error(`Invalid USD value calculated for ${balance.symbol}: ${tokenAmount} × $${priceInUsd} = ${usdValue}`);
      }

      console.log(`💵 ${balance.symbol}: ${tokenAmount} × $${priceInUsd} = $${usdValue}`);

      return {
        ...balance,
        usdValue,
      };
    });
  }

  /**
   * Notify all subscribers of new data
   */
  private _notifyCallbacks(data: RefreshData): void {
    this._callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error("Error in centralized refresh callback:", error);
      }
    });
  }

  /**
   * Force a manual refresh
   */
  public async forceRefresh(): Promise<void> {
    await this._performRefresh();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.stop();
    this._callbacks = [];
    this._lastData = null;
  }

  /**
   * Save refresh data to localStorage
   */
  private _saveToLocalStorage(data: RefreshData): void {
    try {
      // Convert bigints to strings for JSON serialization
      const serializable = {
        ...data,
        lusdPrice: data.lusdPrice.toString(),
        ubqPrice: data.ubqPrice.toString(),
        collateralRatio: data.collateralRatio.toString(),
        mintThreshold: data.mintThreshold.toString(),
        redeemThreshold: data.redeemThreshold.toString(),
        curveExchangeRate: data.curveExchangeRate.toString(),
        twapPrice: data.twapPrice.toString(),
        allCollaterals: data.allCollaterals.map(addr => addr),
        tokenBalances: data.tokenBalances?.map(balance => ({
          ...balance,
          balance: balance.balance.toString(),
        })),
        timestamp: Date.now(),
      };
      
      localStorage.setItem(this._localStorageKey, JSON.stringify(serializable));
    } catch (error) {
      console.warn("Failed to save to localStorage:", error);
    }
  }

  /**
   * Load refresh data from localStorage
   */
  private _loadFromLocalStorage(): RefreshData | null {
    try {
      const stored = localStorage.getItem(this._localStorageKey);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      
      // Check if data is older than 5 minutes
      if (parsed.timestamp && Date.now() - parsed.timestamp > 5 * 60 * 1000) {
        localStorage.removeItem(this._localStorageKey);
        return null;
      }
      
      // Convert strings back to bigints
      return {
        ...parsed,
        lusdPrice: BigInt(parsed.lusdPrice),
        ubqPrice: BigInt(parsed.ubqPrice),
        collateralRatio: BigInt(parsed.collateralRatio),
        mintThreshold: BigInt(parsed.mintThreshold),
        redeemThreshold: BigInt(parsed.redeemThreshold),
        curveExchangeRate: BigInt(parsed.curveExchangeRate),
        twapPrice: BigInt(parsed.twapPrice),
        allCollaterals: parsed.allCollaterals as readonly Address[],
        tokenBalances: parsed.tokenBalances?.map((balance: any) => ({
          ...balance,
          balance: BigInt(balance.balance),
        })),
      };
    } catch (error) {
      console.warn("Failed to load from localStorage:", error);
      return null;
    }
  }
}
