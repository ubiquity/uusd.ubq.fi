import type { Address, PublicClient } from "viem";
import { formatUnits, parseEther } from "viem";
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

  constructor(services: RefreshServiceDependencies) {
    this._services = services;
  }

  /**
   * Start the centralized refresh cycle
   */
  public start(): void {
    this.stop(); // Clear any existing interval

    // Initial refresh
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

      // BATCH 3: External data (Curve + storage reads)
      const externalData = await this._fetchExternalData(publicClient);

      // Calculate UUSD price from fetched data
      const uusdPrice = this._calculateUUSDPrice(diamondMulticallData.lusdPrice, externalData.curveExchangeRate);

      // Compile all data
      const refreshData: RefreshData = {
        uusdPrice,
        lusdPrice: diamondMulticallData.lusdPrice,
        ubqPrice: diamondMulticallData.ubqPrice,
        tokenBalances: tokenBalancesData,
        collateralRatio: diamondMulticallData.collateralRatio,
        allCollaterals: diamondMulticallData.allCollaterals,
        mintThreshold: externalData.mintThreshold,
        redeemThreshold: externalData.redeemThreshold,
        curveExchangeRate: externalData.curveExchangeRate,
      };

      // Cache and notify
      this._lastData = refreshData;
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
      ],
    });

    return {
      collateralRatio: multicallResults[0].status === "success" ? (multicallResults[0].result as bigint) : 0n,
      lusdPrice: multicallResults[1].status === "success" ? (multicallResults[1].result as bigint) : 0n,
      ubqPrice: multicallResults[2].status === "success" ? (multicallResults[2].result as bigint) : 0n,
      allCollaterals: multicallResults[3].status === "success" ? (multicallResults[3].result as readonly Address[]) : [],
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
   * BATCH 3: Fetch external data (Curve + storage reads)
   */
  private async _fetchExternalData(publicClient: PublicClient) {
    const diamondAddress = ADDRESSES.DIAMOND;

    // Batch external calls
    const [curveExchangeRate, mintThreshold, redeemThreshold] = await Promise.all([
      // Curve pool call
      this._fetchCurveExchangeRate(publicClient),
      // Storage reads for thresholds
      publicClient.getStorageAt({ address: diamondAddress, slot: "0x0c" }), // slot 12
      publicClient.getStorageAt({ address: diamondAddress, slot: "0x0d" }), // slot 13
    ]);

    return {
      curveExchangeRate,
      mintThreshold: mintThreshold ? BigInt(mintThreshold) : 0n,
      redeemThreshold: redeemThreshold ? BigInt(redeemThreshold) : 0n,
    };
  }

  /**
   * Fetch Curve pool exchange rate
   */
  private async _fetchCurveExchangeRate(publicClient: PublicClient): Promise<bigint> {
    try {
      const curvePoolAddress = "0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f" as Address;

      const result = await publicClient.readContract({
        address: curvePoolAddress,
        abi: [
          {
            name: "get_dy",
            type: "function",
            stateMutability: "view",
            inputs: [
              { type: "int128", name: "i" },
              { type: "int128", name: "j" },
              { type: "uint256", name: "dx" },
            ],
            outputs: [{ type: "uint256" }],
          },
        ],
        functionName: "get_dy",
        args: [0n, 1n, parseEther("1")], // 1 LUSD -> UUSD
      });

      return result as bigint;
    } catch (error) {
      console.warn("Failed to fetch Curve exchange rate:", error);
      return parseEther("1"); // Fallback to 1:1 ratio
    }
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
    const uusdPrice = parseFloat(uusdPriceStr);

    return tokenBalances.map((balance) => {
      let priceInUsd = 1; // Default fallback

      if (balance.symbol === "UUSD") {
        priceInUsd = uusdPrice;
      } else if (balance.symbol === "UBQ") {
        priceInUsd = parseFloat(formatUnits(ubqPrice, 6));
      } else if (balance.symbol === "LUSD") {
        priceInUsd = parseFloat(formatUnits(lusdPrice, 6));
      }

      const tokenAmount = parseFloat(formatUnits(balance.balance, balance.decimals));
      const usdValue = tokenAmount * priceInUsd;

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
    // Calculate USD values for token balances if they exist
    if (data.tokenBalances) {
      data.tokenBalances = this._calculateTokenUSDValues(data.tokenBalances, data.lusdPrice, data.ubqPrice, data.uusdPrice);
    }

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
}
