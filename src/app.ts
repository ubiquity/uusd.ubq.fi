import { type Address, formatUnits } from "viem";

// Import services
import { WalletService, WALLET_EVENTS } from "./services/wallet-service.ts";
import { ContractService } from "./services/contract-service.ts";
import { PriceService } from "./services/price-service.ts";
import { CurvePriceService } from "./services/curve-price-service.ts";
import { SwapService } from "./services/swap-service.ts";
import { TransactionService, TransactionOperation as _TransactionOperation } from "./services/transaction-service.ts";
import { cacheService } from "./services/cache-service.ts";

// Import components
import { NotificationManager } from "./components/notification-manager.ts";
import { SimplifiedExchangeComponent } from "./components/simplified-exchange-component.ts";
import { InventoryBarComponent } from "./components/inventory-bar-component.ts";

// Import utilities
import { formatAddress } from "./utils/format-utils.ts";
import { TransactionButtonUtils } from "./utils/transaction-button-utils.ts";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

/**
 * Main Application Class - Lightweight Coordinator
 * Orchestrates components and manages high-level application state
 */
class UUSDApp {
  // Services
  private _walletService: WalletService;
  private _contractService: ContractService;
  private _priceService: PriceService;
  private _curvePriceService: CurvePriceService;
  private _swapService: SwapService;
  private _transactionService: TransactionService;

  // Components
  private _notificationManager: NotificationManager;
  private _simplifiedExchangeComponent: SimplifiedExchangeComponent;
  private _inventoryBarComponent: InventoryBarComponent;

  constructor() {
    // Initialize services with dependency injection
    this._walletService = new WalletService();
    this._contractService = new ContractService(this._walletService);
    this._priceService = new PriceService(this._contractService, this._walletService);
    this._curvePriceService = new CurvePriceService(this._walletService);
    this._swapService = new SwapService(this._walletService, this._contractService);
    this._transactionService = new TransactionService(this._walletService, this._contractService, this._priceService);

    // Initialize components
    this._notificationManager = new NotificationManager();

    const services = {
      walletService: this._walletService,
      contractService: this._contractService,
      priceService: this._priceService,
      curvePriceService: this._curvePriceService,
      transactionService: this._transactionService,
      swapService: this._swapService,
      notificationManager: this._notificationManager,
    };

    // Create inventory bar component first (needed by exchange component)
    this._inventoryBarComponent = new InventoryBarComponent({
      walletService: this._walletService,
      contractService: this._contractService,
      priceService: this._priceService,
      notificationManager: this._notificationManager,
    });

    // Create simplified exchange component
    this._simplifiedExchangeComponent = new SimplifiedExchangeComponent({
      ...services,
      inventoryBar: this._inventoryBarComponent,
    });

    this._setupServiceEventHandlers();

    // Expose to window for HTML onclick handlers and debugging
    (window as unknown as Record<string, unknown>).app = {
      ...this,
      exchange: this._simplifiedExchangeComponent,
      connectWallet: () => this.connectWallet(),
      handleExchange: (event: Event) => this.handleExchange(event),
      demoTransactionUX: (buttonId?: string) => this.demoTransactionUX(buttonId),
      getTransactionStatus: () => this.getTransactionStatus(),
    };

    void this._init();
  }

  private async _init() {
    // Initialize dynamic date labels for chart
    this._initializeDynamicDates();

    // Show the exchange interface
    this._showExchangeInterface();

    // Check for stored wallet connection and auto-reconnect
    await this._checkAutoReconnect();

    // RENDER CACHED SPARKLINE IMMEDIATELY (synchronous)
    this._renderCachedSparkline();

    // Load UUSD price (separate from sparkline)
    this._loadUUSDPrice().catch((error) => {
      console.warn("Failed to load UUSD price:", error);
    });

    // Load sparkline updates in parallel (separate from price)
    this._loadRealPriceHistory().catch((error) => {
      console.warn("Failed to load price history:", error);
    });

    // Initialize services for optimal route calculations
    if (!this._priceService.isInitialized()) {
      try {
        await this._priceService.initialize();

        // Warm cache with essential data for better responsiveness
        await cacheService.warmCache(this._contractService);
      } catch (error) {
        console.warn("Failed to initialize price service:", error);
      }
    }

    // Auto-register transaction buttons for enhanced UX
    TransactionButtonUtils.autoRegisterCommonButtons();
  }

  /**
   * Show the exchange interface elements
   */
  private _showExchangeInterface(): void {
    const directionToggle = document.querySelector(".direction-toggle") as HTMLElement;
    const exchangeForm = document.getElementById("exchangeForm") as HTMLElement;

    if (directionToggle) {
      directionToggle.style.display = "flex";
    }

    if (exchangeForm) {
      exchangeForm.style.display = "block";
    }
  }

  /**
   * Load and display current UUSD price ONLY
   */
  private async _loadUUSDPrice(): Promise<void> {
    try {
      const uusdPrice = await this._priceService.getCurrentUUSDPrice();
      this._updateUUSDPriceDisplay(uusdPrice);
    } catch (error: unknown) {
      console.warn("Failed to load UUSD price:", error);
      this._updateUUSDPriceDisplay("Unavailable");
    }
  }

  /**
   * Render cached sparkline immediately (synchronous)
   */
  private _renderCachedSparkline(): void {
    try {
      const cachedHistory = this._priceService.getCachedUUSDPriceHistory();
      if (cachedHistory.length > 0) {
        this._generateRealSparkline(cachedHistory);
      }
    } catch (error: unknown) {
      // Ignore cache errors for immediate render
      console.warn("Could not render cached sparkline:", error);
    }
  }

  /**
   * Load real price history and generate dynamic sparkline
   * Uses "render-first, update-later" pattern for optimal UX
   */
  private async _loadRealPriceHistory(): Promise<void> {
    try {
      // Get current cached state to compare
      const cachedHistory = this._priceService.getCachedUUSDPriceHistory();

      // STEP 2: Fetch fresh data and update if different
      const freshHistory = await this._priceService.getUUSDPriceHistory();

      // Only re-render if we got more/different data
      if (freshHistory.length > cachedHistory.length || (freshHistory.length > 0 && cachedHistory.length === 0)) {
        this._generateRealSparkline(freshHistory);
      }
    } catch (error: unknown) {
      console.warn("Failed to load price history:", error);
    }
  }

  /**
   * Generate real sparkline from actual price data
   */
  private _generateRealSparkline(priceHistory: Array<{ price: bigint | number | string }>): void {
    const chartElement = document.querySelector(".sparkline-chart") as HTMLElement;
    const strokeElement = document.querySelector(".sparkline-stroke") as HTMLElement;

    if (!chartElement || !strokeElement || priceHistory.length === 0) return;

    // Convert BigInt prices to numbers for Math operations
    const prices = priceHistory.map((point) => {
      // Handle both BigInt and number types
      if (typeof point.price === "bigint") {
        return parseFloat(formatUnits(point.price, 6));
      }
      return typeof point.price === "number" ? point.price : parseFloat(point.price);
    });

    // Map prices to chart coordinates based on $0.99-$1.01 range
    const chartMinPrice = 0.99;
    const chartMaxPrice = 1.01;
    const chartRange = chartMaxPrice - chartMinPrice;

    // Create polygon points for the sparkline
    const points: string[] = [];

    prices.forEach((price, index) => {
      const x = (index / (prices.length - 1)) * 100; // 0-100%

      // Map price to chart position: $0.99 = 80%, $1.01 = 20%
      const normalizedPrice = (price - chartMinPrice) / chartRange;
      const y = 80 - normalizedPrice * 60; // Map to 80%-20% (inverted)

      points.push(`${x}% ${y}%`);
    });

    // Add bottom corners for fill area
    points.push("100% 100%", "0% 100%");

    // Create stroke path (without bottom fill)
    const strokePath = [...points.slice(0, -2)]; // Remove bottom corners
    strokePath.push(
      ...points
        .slice(0, -2)
        .reverse()
        .map((point) => {
          const [x, y] = point.split(" ");
          const yNum = Number(y.replace("%", ""));
          return `${x} ${yNum + 0.1}%`; // Add minimal thickness for single-pixel line
        })
    );

    // Apply to CSS clip-path
    const clipPath = `polygon(${points.join(", ")})`;
    const strokeClipPath = `polygon(${strokePath.join(", ")})`;

    chartElement.style.clipPath = clipPath;
    strokeElement.style.clipPath = strokeClipPath;

    // Add "ready" class to trigger fade-in animation
    chartElement.classList.add("ready");
    strokeElement.classList.add("ready");
  }

  /**
   * Update UUSD price display in the UI
   */
  private _updateUUSDPriceDisplay(price: string): void {
    const priceElement = document.getElementById("uusdPrice");
    if (priceElement) {
      priceElement.textContent = price;
    }
  }

  /**
   * Initialize dynamic date labels for the last 7 days
   */
  private _initializeDynamicDates(): void {
    const dateContainer = document.getElementById("dynamic-dates");
    if (!dateContainer) return;

    // Get last 7 days including today
    const dates: string[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);

      // Format as "Mon DD"
      const month = date.toLocaleDateString("en-US", { month: "short" });
      const day = date.getDate();

      dates.push(`${month} ${day}`);
    }

    // Clear existing content and add dynamic dates
    dateContainer.innerHTML = "";
    dates.forEach((dateStr) => {
      const span = document.createElement("span");
      span.className = "date-label";
      span.textContent = dateStr;
      dateContainer.appendChild(span);
    });
  }

  private _setupServiceEventHandlers() {
    // Wallet service event handlers using new event system
    this._walletService.addEventListener(WALLET_EVENTS.CONNECT, (account?: Address | null) => {
      this._updateWalletUI(account ?? null);
      this._simplifiedExchangeComponent.updateWalletConnection(true);
      void this._inventoryBarComponent.handleWalletConnectionChange(account ?? null);
    });

    this._walletService.addEventListener(WALLET_EVENTS.DISCONNECT, () => {
      this._updateWalletUI(null);
      this._simplifiedExchangeComponent.updateWalletConnection(false);
      void this._inventoryBarComponent.handleWalletConnectionChange(null);
    });

    this._walletService.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, (account?: Address | null) => {
      this._updateWalletUI(account ?? null);
      if (account) {
        void this._inventoryBarComponent.handleWalletConnectionChange(account);
      } else {
        void this._inventoryBarComponent.handleWalletConnectionChange(null);
      }
    });

    // Transaction service event handlers
    this._transactionService.setEventHandlers({
      onTransactionStart: (_operation: string) => {
        this._simplifiedExchangeComponent.handleTransactionStart();
      },
      onTransactionSubmitted: (_operation: string, hash: string) => {
        this._simplifiedExchangeComponent.handleTransactionSubmitted(hash);
      },
      onTransactionSuccess: (_operation: string, _hash: string) => {
        // Note: handleTransactionSuccess doesn't exist in simplified component
        // as it's handled internally
      },
      onTransactionError: (_operation: string, _error: Error) => {
        // Note: handleTransactionError doesn't exist in simplified component
        // as it's handled internally
      },
      onApprovalNeeded: (_tokenSymbol: string) => {
        // Handled within the unified exchange component
      },
      onApprovalComplete: (_tokenSymbol: string) => {
        // Handled within the unified exchange component
      },
    });
  }

  private _updateWalletUI(account: Address | null) {
    const connectButton = document.getElementById("connectWallet") as HTMLButtonElement;

    if (account) {
      // When connected, show disconnect button and wallet info

      connectButton.textContent = "Disconnect";
      connectButton.disabled = false;
      connectButton.style.display = "unset";
      const walletInfo = document.getElementById("walletInfo");
      const walletAddress = document.getElementById("walletAddress");
      if (walletInfo) walletInfo.style.display = "unset";
      if (walletAddress) walletAddress.textContent = formatAddress(account);
    } else {
      // When disconnected, show connect button and hide wallet info

      connectButton.textContent = "Connect Wallet";
      connectButton.disabled = false;
      connectButton.style.display = "unset";
      const walletInfo = document.getElementById("walletInfo");
      if (walletInfo) walletInfo.style.display = "none";
    }
  }

  /**
   * Check for stored wallet connection and attempt auto-reconnection
   */
  private async _checkAutoReconnect() {
    try {
      console.log("🔍 Checking for stored wallet connection...");

      // Try immediate reconnection first
      let reconnectedAddress = await this._walletService.checkStoredConnection();

      // If immediate reconnection failed, try again after a short delay
      // Sometimes wallet providers need time to initialize after page load
      if (!reconnectedAddress) {
        console.log("🔄 Initial reconnection failed, trying again after delay...");
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
        reconnectedAddress = await this._walletService.checkStoredConnection();
      }

      if (reconnectedAddress) {
        console.log("✅ Auto-reconnection successful:", reconnectedAddress);
        // Auto-reconnection successful - UI updates handled by event handlers
      } else {
        console.log("ℹ️ No stored connection found or connection not available");
      }
    } catch (error) {
      // Auto-reconnection failed silently
      console.warn("❌ Auto-reconnection failed:", error);
    }
  }

  // Public methods called from HTML
  async connectWallet() {
    const connectButton = document.getElementById("connectWallet") as HTMLButtonElement;
    const originalText = connectButton.textContent;

    try {
      // Check if wallet is already connected
      if (this._walletService.isConnected()) {
        // Set disconnecting state
        connectButton.textContent = "Disconnecting...";
        connectButton.disabled = true;

        // Disconnect wallet (this will clear localStorage)
        this._walletService.disconnect();
        // Manually update UI after disconnection
        // Don't rely on event handlers as they may not fire immediately
        this._updateWalletUI(null);
        // Also manually update inventory bar since event may not fire
        void this._inventoryBarComponent.handleWalletConnectionChange(null);
      } else {
        // Set connecting state
        connectButton.textContent = "Connecting...";
        connectButton.disabled = true;

        // Force wallet selection since user explicitly clicked connect
        await this._walletService.connect(true);
        // Manually update UI after successful connection
        // Don't rely on event handlers as they may not fire immediately
        if (this._walletService.isConnected()) {
          const account = this._walletService.getAccount();
          this._updateWalletUI(account);
          // Also manually update inventory bar since event may not fire
          void this._inventoryBarComponent.handleWalletConnectionChange(account);
        }
      }
    } catch (error: unknown) {
      // Reset button state on error
      connectButton.textContent = originalText;
      connectButton.disabled = false;
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      this._notificationManager.showError("exchange", message);
    }
  }

  async handleExchange(event: Event) {
    await this._simplifiedExchangeComponent.handleSubmit(event);
  }

  /**
   * Demo transaction button UX - can be called from browser console
   * Usage: app.demoTransactionUX('exchangeButton')
   */
  async demoTransactionUX(buttonId: string = "exchangeButton") {
    await TransactionButtonUtils.demoTransactionFlow(buttonId);
  }

  /**
   * Get transaction button status - can be called from browser console
   * Usage: app.getTransactionStatus()
   */
  getTransactionStatus() {
    const active = TransactionButtonUtils.getActiveTransactions();
    const hasActive = TransactionButtonUtils.hasActiveTransaction();

    return { hasActive, active };
  }
}

// Initialize app and expose to window
const app = new UUSDApp();
(window as unknown as Record<string, unknown>).app = app;
