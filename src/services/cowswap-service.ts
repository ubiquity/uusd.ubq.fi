import { type Address, type Hash, parseUnits, formatUnits, maxUint256 } from "viem";
import type { WalletService } from "./wallet-service.ts";
import type { ContractService } from "./contract-service.ts";
import { cacheService } from "./cache-service.ts";
import { ADDRESSES, ERC20_ABI } from "../contracts/constants.ts";

/**
 * CowSwap Protocol constants
 */
const COWSWAP_API_BASE = "https://api.cow.fi/mainnet";
const COWSWAP_GPV2_VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110" as Address;
const COWSWAP_GPV2_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41" as Address;

/**
 * Order kind for CowSwap
 */
type OrderKind = "sell" | "buy";

/**
 * CowSwap quote request parameters
 */
interface CowSwapQuoteRequest {
  sellToken: Address;
  buyToken: Address;
  sellAmountBeforeFee?: string;
  buyAmountAfterFee?: string;
  kind: OrderKind;
  from: Address;
  receiver?: Address;
  validTo?: number;
  appData?: string;
  partiallyFillable?: boolean;
}

/**
 * CowSwap quote response
 */
export interface CowSwapQuoteResponse {
  quote: {
    sellToken: Address;
    buyToken: Address;
    sellAmount: string;
    buyAmount: string;
    feeAmount: string;
    kind: OrderKind;
    validTo: number;
    appData: string;
    receiver: Address;
    partiallyFillable: boolean;
  };
  from: Address;
  expiration: string;
  id: number;
}

/**
 * Parameters for a CowSwap order
 */
export interface CowSwapOrderParams {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  kind: OrderKind;
  from: Address;
  receiver: Address;
  validTo: number;
  appData: string;
  feeAmount: string;
  partiallyFillable: boolean;
  sellTokenBalance: "erc20";
  buyTokenBalance: "erc20";
  signingScheme: "eip712" | "ethsign";
  signature: string;
}

/**
 * CowSwap order status
 */
export interface CowSwapOrderStatus {
  uid: string;
  status: "presignaturePending" | "open" | "fulfilled" | "cancelled" | "expired";
  executedSellAmount?: string;
  executedBuyAmount?: string;
  executedFeeAmount?: string;
  invalidated: boolean;
}

/**
 * Token metadata for display
 */
export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

/**
 * Well-known ERC-20 tokens on Ethereum mainnet
 */
export const COMMON_TOKENS: TokenInfo[] = [
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, symbol: "USDC", name: "USD Coin", decimals: 6 },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, symbol: "USDT", name: "Tether USD", decimals: 6 },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 },
  { address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" as Address, symbol: "LUSD", name: "Liquity USD", decimals: 18 },
  { address: ADDRESSES.DOLLAR, symbol: "UUSD", name: "Ubiquity Dollar", decimals: 18 },
];

/**
 * EIP-712 typed data for CowSwap order signing
 */
const COWSWAP_DOMAIN = {
  name: "Gnosis Protocol",
  version: "v2",
  chainId: 1,
  verifyingContract: COWSWAP_GPV2_SETTLEMENT,
} as const;

const ORDER_TYPE = {
  Order: [
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "receiver", type: "address" },
    { name: "sellAmount", type: "uint256" },
    { name: "buyAmount", type: "uint256" },
    { name: "validTo", type: "uint32" },
    { name: "appData", type: "bytes32" },
    { name: "feeAmount", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "partiallyFillable", type: "bool" },
    { name: "sellTokenBalance", type: "string" },
    { name: "buyTokenBalance", type: "string" },
  ],
} as const;

/**
 * Default app data hash for UUSD platform orders
 * This is a keccak256 hash of the JSON metadata: {"appCode":"Ubiquity Dollar","version":"1.0.0"}
 */
const UUSD_APP_DATA = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Service for interacting with CowSwap protocol
 * Enables swapping any ERC-20 token to/from UUSD
 */
export class CowSwapService {
  private _walletService: WalletService;
  private _contractService: ContractService;

  constructor(walletService: WalletService, contractService: ContractService) {
    this._walletService = walletService;
    this._contractService = contractService;
  }

  /**
   * Get a quote from CowSwap for a token swap
   * @param sellToken - Address of the token to sell
   * @param buyToken - Address of the token to buy
   * @param amount - Amount to sell (in token's smallest unit as string)
   * @param kind - Order kind: "sell" or "buy"
   * @returns Quote with expected output and fee information
   */
  async getQuote(sellToken: Address, buyToken: Address, amount: string, kind: OrderKind = "sell"): Promise<CowSwapQuoteResponse> {
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const quoteRequest: CowSwapQuoteRequest = {
      sellToken,
      buyToken,
      from: account,
      kind,
      partiallyFillable: false,
    };

    if (kind === "sell") {
      quoteRequest.sellAmountBeforeFee = amount;
    } else {
      quoteRequest.buyAmountAfterFee = amount;
    }

    const response = await fetch(`${COWSWAP_API_BASE}/api/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quoteRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.description || errorJson.errorType || errorBody;
      } catch {
        errorMessage = errorBody;
      }

      if (response.status === 400 && errorMessage.includes("SellAmountDoesNotCoverFee")) {
        throw new Error("Amount too small to cover CowSwap fees. Please increase the amount.");
      }

      if (response.status === 400 && errorMessage.includes("NoLiquidity")) {
        throw new Error("No liquidity available for this token pair on CowSwap.");
      }

      throw new Error(`CowSwap quote failed: ${errorMessage}`);
    }

    return (await response.json()) as CowSwapQuoteResponse;
  }

  /**
   * Get a cached quote for display purposes
   */
  async getCachedQuote(sellToken: Address, buyToken: Address, amount: string, kind: OrderKind = "sell"): Promise<CowSwapQuoteResponse> {
    const cacheKey = `cowswap-quote-${sellToken}-${buyToken}-${amount}-${kind}`;

    return cacheService.getOrFetch(cacheKey, () => this.getQuote(sellToken, buyToken, amount, kind), { ttl: 15000, fallbackToStale: true, maxAge: 60000 });
  }

  /**
   * Check if the user has sufficient allowance for CowSwap's vault relayer
   * and approve if necessary
   */
  async ensureAllowance(tokenAddress: Address, amount: bigint): Promise<Hash | null> {
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const allowance = await this._contractService.getAllowance(tokenAddress, account, COWSWAP_GPV2_VAULT_RELAYER);

    if (allowance >= amount) {
      return null; // Already approved
    }

    // Approve unlimited to save gas on future swaps
    const hash = await this._contractService.approveToken(tokenAddress, COWSWAP_GPV2_VAULT_RELAYER, maxUint256);
    return hash as Hash;
  }

  /**
   * Create and submit a CowSwap order
   * @param quote - Quote from getQuote()
   * @returns Order UID for tracking
   */
  async submitOrder(quote: CowSwapQuoteResponse): Promise<string> {
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const walletClient = this._walletService.getWalletClient();

    // Build the order message for EIP-712 signing
    const appDataHash = (quote.quote.appData || UUSD_APP_DATA) as `0x${string}`;
    const orderMessage = {
      sellToken: quote.quote.sellToken,
      buyToken: quote.quote.buyToken,
      receiver: quote.quote.receiver || account,
      sellAmount: BigInt(quote.quote.sellAmount),
      buyAmount: BigInt(quote.quote.buyAmount),
      validTo: quote.quote.validTo,
      appData: appDataHash,
      feeAmount: BigInt(quote.quote.feeAmount),
      kind: quote.quote.kind,
      partiallyFillable: quote.quote.partiallyFillable,
      sellTokenBalance: "erc20" as const,
      buyTokenBalance: "erc20" as const,
    };

    // Sign the order using EIP-712
    const signature = await walletClient.signTypedData({
      account,
      domain: COWSWAP_DOMAIN,
      types: ORDER_TYPE,
      primaryType: "Order",
      message: orderMessage,
    });

    // Submit the signed order to CowSwap API
    const orderPayload = {
      sellToken: quote.quote.sellToken,
      buyToken: quote.quote.buyToken,
      receiver: quote.quote.receiver || account,
      sellAmount: quote.quote.sellAmount,
      buyAmount: quote.quote.buyAmount,
      validTo: quote.quote.validTo,
      appData: quote.quote.appData || UUSD_APP_DATA,
      feeAmount: quote.quote.feeAmount,
      kind: quote.quote.kind,
      partiallyFillable: quote.quote.partiallyFillable,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      signingScheme: "eip712",
      signature,
      from: account,
    };

    const response = await fetch(`${COWSWAP_API_BASE}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.description || errorJson.errorType || errorBody;
      } catch {
        errorMessage = errorBody;
      }

      throw new Error(`Failed to submit CowSwap order: ${errorMessage}`);
    }

    const orderUid = await response.text();
    // API returns the UID as a quoted string
    return orderUid.replace(/"/g, "");
  }

  /**
   * Get the status of a CowSwap order
   * @param orderUid - Order UID from submitOrder()
   * @returns Order status
   */
  async getOrderStatus(orderUid: string): Promise<CowSwapOrderStatus> {
    const response = await fetch(`${COWSWAP_API_BASE}/api/v1/orders/${orderUid}`);

    if (!response.ok) {
      throw new Error(`Failed to get order status: ${response.statusText}`);
    }

    return (await response.json()) as CowSwapOrderStatus;
  }

  /**
   * Poll for order completion with timeout
   * @param orderUid - Order UID to watch
   * @param timeoutMs - Maximum time to wait (default: 5 minutes)
   * @param pollIntervalMs - Interval between status checks (default: 5 seconds)
   * @returns Final order status
   */
  async waitForOrderCompletion(orderUid: string, timeoutMs: number = 300000, pollIntervalMs: number = 5000): Promise<CowSwapOrderStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getOrderStatus(orderUid);

      if (status.status === "fulfilled") {
        return status;
      }

      if (status.status === "cancelled" || status.status === "expired" || status.invalidated) {
        throw new Error(`CowSwap order ${status.status}: ${orderUid}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`CowSwap order timed out after ${timeoutMs / 1000}s: ${orderUid}`);
  }

  /**
   * Get token balance for a specific address
   */
  async getTokenBalance(tokenAddress: Address, account: Address): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();

    return (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    })) as bigint;
  }

  /**
   * Get ETH balance for a specific address
   */
  async getEthBalance(account: Address): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();
    return publicClient.getBalance({ address: account });
  }

  /**
   * Look up token info from the common tokens list
   */
  getTokenInfo(address: Address): TokenInfo | undefined {
    return COMMON_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * Get the CowSwap vault relayer address (needed for approvals)
   */
  getVaultRelayerAddress(): Address {
    return COWSWAP_GPV2_VAULT_RELAYER;
  }

  /**
   * Get the CowSwap explorer URL for an order
   */
  getExplorerUrl(orderUid: string): string {
    return `https://explorer.cow.fi/orders/${orderUid}`;
  }

  /**
   * Format amount for display based on token decimals
   */
  formatAmount(amount: string | bigint, decimals: number): string {
    const value = typeof amount === "bigint" ? amount : BigInt(amount);
    return formatUnits(value, decimals);
  }

  /**
   * Parse human-readable amount to token smallest unit
   */
  parseAmount(amount: string, decimals: number): bigint {
    return parseUnits(amount, decimals);
  }

  /**
   * Check if a token is the UUSD token
   */
  isUUSD(tokenAddress: Address): boolean {
    return tokenAddress.toLowerCase() === ADDRESSES.DOLLAR.toLowerCase();
  }

  /**
   * Check if a token is LUSD
   */
  isLUSD(tokenAddress: Address): boolean {
    return tokenAddress.toLowerCase() === "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0".toLowerCase();
  }
}
