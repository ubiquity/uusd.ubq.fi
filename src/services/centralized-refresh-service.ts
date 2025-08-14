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
  private services: RefreshServiceDependencies;
  private refreshInterval: number | null = null;
  private callbacks: RefreshDataCallback[] = [];
  private lastData: RefreshData | null = null;
  private readonly intervalMs = 15000; // 15 seconds - aligned with Ethereum block time

  constructor(services: RefreshServiceDependencies) {
    this.services = services;
  }

  /**
   * Start the centralized refresh cycle
   */
  public start(): void {
    this.stop(); // Clear any existing interval

    // Initial refresh
    this.performRefresh().catch((error) => {
      console.warn("Initial centralized refresh failed:", error);
    });

    // Set up periodic refresh
    this.refreshInterval = window.setInterval(() => {
      this.performRefresh().catch((error) => {
        console.warn("Centralized refresh failed:", error);
      });
    }, this.intervalMs);

    console.log("🔄 Centralized refresh service started (15s intervals)");
  }

  /**
   * Stop the refresh cycle
   */
  public stop(): void {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Subscribe to refresh data updates
   */
  public subscribe(callback: RefreshDataCallback): void {
    this.callbacks.push(callback);

    // If we have cached data, call immediately
    if (this.lastData) {
      try {
        callback(this.lastData);
      } catch (error) {
        console.error("Error in refresh callback:", error);
      }
    }
  }

  /**
   * Unsubscribe from refresh data updates
   */
  public unsubscribe(callback: RefreshDataCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Get the last refreshed data (cached)
   */
  public getLastData(): RefreshData | null {
    return this.lastData;
  }

  /**
   * Perform the centralized refresh with batched RPC calls
   */
  private async performRefresh(): Promise<void> {
    try {
      const publicClient = this.services.walletService.getPublicClient();
      const account = this.services.walletService.getAccount();

      // BATCH 1: Diamond contract multicall (most efficient)
      const diamondMulticallData = await this.fetchDiamondData(publicClient);

      // BATCH 2: Token balances (only if wallet connected)
      const tokenBalancesData = account ? await this.fetchTokenBalances(publicClient, account) : null;

      // BATCH 3: External data (storage reads only)
      const externalData = await this.fetchExternalData(publicClient);

      // Get current UUSD price from price service
      const uusdPrice = await this.services.priceService.getCurrentUUSDPrice();

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
      };

      // Cache and notify
      this.lastData = refreshData;
      this.notifyCallbacks(refreshData);
    } catch (error) {
      console.error("Centralized refresh failed:", error);
      // Continue with stale data - don't break the refresh cycle
    }
  }

  /**
   * BATCH 1: Fetch all Diamond contract data in single multicall
   */
  private async fetchDiamondData(publicClient: PublicClient) {
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
  private async fetchTokenBalances(publicClient: PublicClient, account: Address): Promise<TokenBalance[]> {
    // Prepare tokens for batch request
    const tokens = Object.values(INVENTORY_TOKENS).map((token) => ({
      address: token.address,
      symbol: token.symbol,
    }));

    // Execute batch request for all token balances
    const batchResults = await batchFetchTokenBalances(publicClient, tokens, account);

    // Convert to TokenBalance format with USD values
    return batchResults.map((result: TokenBalanceBatchResult): TokenBalance => {
      const tokenMetadata = INVENTORY_TOKENS[result.symbol];
      if (!tokenMetadata) {
        throw new Error(`Token metadata not found for ${result.symbol}`);
      }

      // Calculate USD value
      let priceInUsd = 1; // Default fallback price
      if (result.symbol === 'UUSD' && this.lastData?.uusdPrice) {
        priceInUsd = parseFloat(this.lastData.uusdPrice);
      } else if (result.symbol === 'UBQ' && this.lastData?.ubqPrice) {
        priceInUsd = parseFloat(formatUnits(this.lastData.ubqPrice, 6));
      } else if (result.symbol === 'LUSD' && this.lastData?.lusdPrice) {
        priceInUsd = parseFloat(formatUnits(this.lastData.lusdPrice, 6));
      }

      const tokenAmount = parseFloat(formatUnits(result.balance, tokenMetadata.decimals));
      const usdValue = tokenAmount * priceInUsd;

      return {
        symbol: result.symbol,
        address: result.tokenAddress,
        balance: result.balance,
        decimals: tokenMetadata.decimals,
        usdValue,
      };
    });
  }

  /**
   * BATCH 3: Fetch external data (storage reads)
   */
  private async fetchExternalData(publicClient: PublicClient) {
    const diamondAddress = ADDRESSES.DIAMOND;

    // Batch storage reads for thresholds
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
   * Notify all callbacks with the latest data
   */
  private notifyCallbacks(data: RefreshData): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error("Error in refresh data callback:", error);
      }
    });
  }
}