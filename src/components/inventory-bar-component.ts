import type { Address } from "viem";
import { formatUnits } from "viem";
import type { WalletService } from "../services/wallet-service.ts";
import type { ContractService } from "../services/contract-service.ts";
import type { PriceService } from "../services/price-service.ts";
import type { NotificationManager } from "./notification-manager.ts";
import type { CentralizedRefreshService, RefreshData } from "../services/centralized-refresh-service.ts";
import type { TokenBalance, InventoryBarState } from "../types/inventory.types.ts";
import { formatTokenAmount, formatUsdValue, calculateTotalUsdValue, isBalanceZero } from "../utils/token-utils.ts";
import { batchFetchTokenBalances, type TokenBalanceBatchResult } from "../utils/batch-request-utils.ts";

import icons from "./icons.ts";

/**
 * Service dependencies for InventoryBarComponent
 */
export interface InventoryBarServices {
  walletService: WalletService;
  contractService: ContractService;
  priceService: PriceService;
  notificationManager: NotificationManager;
  centralizedRefreshService: CentralizedRefreshService;
}

/**
 * Callback type for balance update notifications
 */
export type BalanceUpdateCallback = (balances: TokenBalance[]) => void;

/**
 * Inventory Bar Component
 * Displays token balances (LUSD, UUSD, UBQ) at the bottom of the page with USD values
 */
export class InventoryBarComponent {
  private _services: InventoryBarServices;
  private _state: InventoryBarState;
  private _balanceUpdateCallbacks: BalanceUpdateCallback[] = [];
  private _initialLoadPromise: Promise<void> | null = null;
  private _initialLoadResolver: (() => void) | null = null;

  constructor(services: InventoryBarServices) {
    this._services = services;
    this._state = {
      isConnected: false,
      isLoading: false,
      balances: [],
      totalUsdValue: 0,
      currentAccount: null,
    };

    // Create initial load promise
    this._initialLoadPromise = new Promise<void>((resolve) => {
      this._initialLoadResolver = resolve;
    });

    this._initializeComponent();
    this._setupCentralizedRefresh();
  }

  /**
   * Initialize the inventory bar component
   */
  private _initializeComponent(): void {
    this._renderInventoryBar();
    this._updateConnectionState();
  }

  /**
   * Setup centralized refresh subscription
   */
  private _setupCentralizedRefresh(): void {
    // Subscribe to centralized refresh data
    this._services.centralizedRefreshService.subscribe(this._handleRefreshData.bind(this));

    // Check initial connection state
    const account = this._services.walletService.getAccount();
    if (account) {
      this._state.isConnected = true;
      this._state.currentAccount = account;
      this._updateConnectionState();
    }
  }

  /**
   * Handle centralized refresh data updates
   */
  private _handleRefreshData(data: RefreshData): void {
    // Only process token balance data if wallet is connected
    if (this._state.isConnected && data.tokenBalances) {
      console.log("📊 Inventory refresh data received:", {
        tokenCount: data.tokenBalances.length,
        tokens: data.tokenBalances.map((t) => ({
          symbol: t.symbol,
          balance: t.balance?.toString(),
          usdValue: t.usdValue,
        })),
      });

      // Merge new balance data with existing cached values
      // This prevents clearing existing values when partial updates arrive
      const updatedBalances = [...this._state.balances];

      // Update each token balance individually
      data.tokenBalances.forEach((newBalance) => {
        const existingIndex = updatedBalances.findIndex((existing) => existing.symbol === newBalance.symbol);

        if (existingIndex >= 0) {
          // ONLY update if we have valid data - NO FALLBACKS
          if (newBalance.balance !== undefined && newBalance.usdValue !== undefined && newBalance.usdValue > 0) {
            updatedBalances[existingIndex] = newBalance;
          } else {
            console.error(`INVALID DATA for ${newBalance.symbol} - not updating. Balance: ${newBalance.balance}, USD: ${newBalance.usdValue}`);
            // Keep existing value in updatedBalances - don't clear it
          }
        } else {
          // Add new token balance
          updatedBalances.push(newBalance);
        }
      });

      // Update state with merged data
      this._state.balances = updatedBalances;
      this._state.totalUsdValue = calculateTotalUsdValue(updatedBalances);
      this._state.isLoading = false;

      console.log("📊 Final inventory state:", {
        balanceCount: this._state.balances.length,
        totalUsd: this._state.totalUsdValue,
        balances: this._state.balances.map((b) => ({
          symbol: b.symbol,
          usdValue: b.usdValue,
        })),
      });

      this._renderBalances();
      this._hideBackgroundRefreshIndicator();

      // Resolve initial load promise on first successful data
      if (this._initialLoadResolver) {
        this._initialLoadResolver();
        this._initialLoadResolver = null;
      }

      // Notify balance update callbacks
      this._notifyBalancesUpdated();
    }
  }

  /**
   * Handle wallet connection
   */
  private async _handleWalletConnect(account: Address): Promise<void> {
    this._state.isConnected = true;
    this._updateConnectionState();

    // Check if this is an account change (different from current account)
    const isAccountChange = this._state.currentAccount && this._state.currentAccount !== account;

    if (isAccountChange) {
      console.log(`🔄 Account changed from ${this._state.currentAccount} to ${account} - clearing stale balance data`);

      // Clear stale balance data immediately for account changes
      this._state.balances = [];
      this._state.totalUsdValue = 0;
      this._state.currentAccount = account;

      // Force a fresh load (not background refresh) so user sees loading state
      await this._loadBalances(false); // false = initial load with loading state
    } else {
      // Same account reconnection or first connection
      this._state.currentAccount = account;

      // Use background refresh if we already have some balances (reconnection)
      // Use initial load if no balances exist (fresh connection)
      const isReconnection = this._state.balances.length > 0;
      await this._loadBalances(!isReconnection); // Background refresh for reconnections
    }

    // Centralized refresh service will automatically provide fresh data
  }

  /**
   * Handle wallet disconnection
   */
  private _handleWalletDisconnect(): void {
    this._state.isConnected = false;
    this._state.balances = [];
    this._state.totalUsdValue = 0;
    this._state.currentAccount = null;
    console.log("[InventoryBar] State after disconnect:", {
      isConnected: this._state.isConnected,
      balances: this._state.balances,
      totalUsdValue: this._state.totalUsdValue,
    });
    this._updateConnectionState();
    // Centralized refresh service handles all updates
    this._renderBalances();

    // Resolve initial load promise if disconnected
    if (this._initialLoadResolver) {
      this._initialLoadResolver();
      this._initialLoadResolver = null;
    }
  }

  /**
   * Update wallet connection state in UI
   */
  private _updateConnectionState(): void {
    const inventoryBar = document.getElementById("inventory-bar");
    if (!inventoryBar) return;

    if (this._state.isConnected) {
      inventoryBar.classList.remove("disconnected");
      inventoryBar.classList.add("connected");
    } else {
      inventoryBar.classList.remove("connected");
      inventoryBar.classList.add("disconnected");
    }
  }

  /**
   * Load token balances for the connected wallet using JSON-RPC 2.0 batch requests
   */
  private async _loadBalances(isBackgroundRefresh: boolean = false): Promise<void> {
    if (!this._state.isConnected) {
      return;
    }

    const account = this._services.walletService.getAccount();

    if (!account) {
      return;
    }

    this._state.isLoading = true;

    // Only show loading state if no existing balances OR if this is initial load
    if (!isBackgroundRefresh || this._state.balances.length === 0) {
      this._renderLoadingState();
    } else {
      this._showBackgroundRefreshIndicator();
    }

    try {
      const publicClient = this._services.walletService.getPublicClient();

      // Import token metadata
      const { INVENTORY_TOKENS } = await import("../types/inventory.types.ts");

      // Prepare tokens for batch request
      const tokens = Object.values(INVENTORY_TOKENS).map((token) => ({
        address: token.address,
        symbol: token.symbol,
      }));

      // Execute batch request for all token balances
      const batchResults = await batchFetchTokenBalances(publicClient, tokens, account);

      // Process results and calculate USD values
      const balancePromises = batchResults.map(async (result: TokenBalanceBatchResult): Promise<TokenBalance> => {
        const tokenMetadata = INVENTORY_TOKENS[result.symbol];
        if (!tokenMetadata) {
          throw new Error(`Token metadata not found for ${result.symbol}`);
        }

        return {
          symbol: result.symbol,
          address: result.tokenAddress,
          balance: result.balance,
          decimals: tokenMetadata.decimals,
          usdValue: await this._calculateUsdValue(result.symbol, result.balance, tokenMetadata.decimals),
        };
      });

      const balances = await Promise.all(balancePromises);

      this._state.balances = balances;
      this._state.totalUsdValue = calculateTotalUsdValue(balances);
      this._state.isLoading = false;

      this._renderBalances();

      // Hide background refresh indicator after successful update
      this._hideBackgroundRefreshIndicator();

      // Resolve initial load promise on first successful load
      if (this._initialLoadResolver) {
        this._initialLoadResolver();
        this._initialLoadResolver = null;
      }

      // Trigger auto-population when balances are loaded/updated
      this._notifyBalancesUpdated();
    } catch (error) {
      console.error("Failed to load token balances:", error);
      this._state.isLoading = false;
      this._hideBackgroundRefreshIndicator();
      this._services.notificationManager.showError("mint", "Failed to load token balances");
      this._renderErrorState();
    }
  }

  /**
   * Calculate USD value for a token balance
   */
  private async _calculateUsdValue(symbol: string, balance: bigint, decimals: number): Promise<number> {
    if (isBalanceZero(balance, decimals)) {
      return 0;
    }

    try {
      // Get token price based on symbol
      let priceInUsd = 1; // Default fallback price

      if (symbol === "UUSD") {
        const rawPrice = await this._services.contractService.getDollarPriceUsd();
        priceInUsd = parseFloat(formatUnits(rawPrice, 6));
      } else if (symbol === "UBQ") {
        const rawPrice = await this._services.contractService.getGovernancePrice();
        priceInUsd = parseFloat(formatUnits(rawPrice, 6));
      } else if (symbol === "LUSD") {
        const rawPrice = await this._services.contractService.getLUSDOraclePrice();
        priceInUsd = parseFloat(formatUnits(rawPrice, 6));
      }

      const tokenAmount = parseFloat(formatUnits(balance, decimals));
      return tokenAmount * priceInUsd;
    } catch (error) {
      console.warn(`Failed to get price for ${symbol}:`, error);
      return 0; // Return 0 if price lookup fails
    }
  }

  /**
   * Render the inventory bar HTML structure
   */
  private _renderInventoryBar(): void {
    const inventoryBar = document.getElementById("inventory-bar");
    if (!inventoryBar) return;

    inventoryBar.innerHTML = `
            <div class="inventory-content">
                <div class="inventory-header">
                    <span class="inventory-title">Token Balances</span>
                    <div class="header-right">
                        <span class="background-refresh-indicator" id="bg-refresh-indicator" style="display: none;">
                            <span class="refresh-spinner"></span>
                        </span>
                        <span class="total-value" id="inventory-total">$0.00</span>
                    </div>
                </div>
                <div class="inventory-tokens" id="inventory-tokens">
                    <div class="disconnected-message">Connect wallet to view balances</div>
                </div>
            </div>
        `;
  }

  /**
   * Render loading state
   */
  private _renderLoadingState(): void {
    const tokensContainer = document.getElementById("inventory-tokens");
    if (!tokensContainer) return;

    tokensContainer.innerHTML = `
            <div class="loading-message">
                <span class="loading-spinner"></span>
                Loading balances...
            </div>
        `;
  }

  /**
   * Render error state
   */
  private _renderErrorState(): void {
    const tokensContainer = document.getElementById("inventory-tokens");
    if (!tokensContainer) return;

    tokensContainer.innerHTML = `
            <div class="error-message">
                Failed to load balances
                <button class="retry-button" onclick="this._loadBalances()">Retry</button>
            </div>
        `;
  }

  /**
   * Render token balances
   */
  private _renderBalances(): void {
    const tokensContainer = document.getElementById("inventory-tokens");
    const totalValueElement = document.getElementById("inventory-total");

    if (!tokensContainer || !totalValueElement) return;

    if (!this._state.isConnected) {
      tokensContainer.innerHTML = '<div class="disconnected-message">Connect wallet to view balances</div>';
      totalValueElement.textContent = "$0.00";
      return;
    }

    if (this._state.balances.length === 0) {
      tokensContainer.innerHTML = '<div class="no-balances-message">No token balances found</div>';
      totalValueElement.textContent = "$0.00";
      return;
    }

    // Filter out zero balances and render individual token balances
    const nonZeroBalances = this._state.balances.filter((balance) => !isBalanceZero(balance.balance, balance.decimals));

    if (nonZeroBalances.length === 0) {
      tokensContainer.innerHTML = '<div class="no-balances-message">No token balances available</div>';
      totalValueElement.textContent = "$0.00";
      return;
    }

    const tokenElements = nonZeroBalances
      .map((balance) => {
        const amount = formatTokenAmount(balance.balance, balance.decimals);
        const usdValue = balance.usdValue ? formatUsdValue(balance.usdValue) : "";

        return `
                <div class="token-balance">
                    <div class="token-info">
                        <div class="token-symbol">${
                          Object.keys(icons).includes(balance.symbol) ? icons[balance.symbol as keyof typeof icons] : balance.symbol
                        }</div>
                        <div class="token-amount">${amount}</div>
                        ${usdValue ? `<div class="token-usd-value">${usdValue}</div>` : ""}
                    </div>
                </div>
            `;
      })
      .join("");

    tokensContainer.innerHTML = tokenElements;
    totalValueElement.textContent = formatUsdValue(this._state.totalUsdValue);
  }

  /**
   * Force refresh balances (public method)
   */
  public async refreshBalances(): Promise<void> {
    if (this._state.isConnected) {
      await this._loadBalances(false); // Manual refresh shows loading state
    }
  }

  /**
   * Get current balances state (public method for debugging)
   */
  public getBalances(): TokenBalance[] {
    return [...this._state.balances];
  }

  /**
   * Handle wallet connection (called by main app)
   */
  public async handleWalletConnectionChange(account: Address | null): Promise<void> {
    if (account) {
      await this._handleWalletConnect(account);
    } else {
      this._handleWalletDisconnect();
    }
  }

  /**
   * Subscribe to balance updates
   */
  public onBalancesUpdated(callback: BalanceUpdateCallback): void {
    this._balanceUpdateCallbacks.push(callback);
  }

  /**
   * Unsubscribe from balance updates
   */
  public offBalancesUpdated(callback: BalanceUpdateCallback): void {
    const index = this._balanceUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this._balanceUpdateCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all subscribers that balances have been updated
   */
  private _notifyBalancesUpdated(): void {
    this._balanceUpdateCallbacks.forEach((callback) => {
      try {
        callback(this._state.balances);
      } catch (error) {
        console.error("Error in balance update callback:", error);
      }
    });
  }

  /**
   * Show background refresh indicator
   */
  private _showBackgroundRefreshIndicator(): void {
    const indicator = document.getElementById("bg-refresh-indicator");
    if (indicator) {
      indicator.style.display = "inline-block";
    }
  }

  /**
   * Hide background refresh indicator
   */
  private _hideBackgroundRefreshIndicator(): void {
    const indicator = document.getElementById("bg-refresh-indicator");
    if (indicator) {
      indicator.style.display = "none";
    }
  }

  /**
   * Wait for initial balance load to complete
   */
  public async waitForInitialLoad(): Promise<void> {
    if (this._initialLoadPromise) {
      await this._initialLoadPromise;
    }
  }

  /**
   * Check if balances have been loaded at least once
   */
  public isInitialLoadComplete(): boolean {
    return this._initialLoadResolver === null;
  }

  /**
   * Cleanup component
   */
  public destroy(): void {
    this._services.centralizedRefreshService.unsubscribe(this._handleRefreshData.bind(this));
    this._balanceUpdateCallbacks = [];
  }
}
