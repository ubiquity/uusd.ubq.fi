import { type Address, type Hash, parseEther as _parseEther, formatEther as _formatEther, maxUint256 } from "viem";
import type { WalletService } from "./wallet-service.ts";
import type { ContractService } from "./contract-service.ts";
import { BASIS_POINTS_DIVISOR, DEFAULT_SLIPPAGE_PERCENT } from "../constants/numeric-constants.ts";
import { ADDRESSES, LUSD_COLLATERAL } from "../contracts/constants.ts";
import { cacheService, CACHE_CONFIGS } from "./cache-service.ts";

/**
 * Curve Pool ABI for swaps
 */
const CURVE_POOL_ABI = [
  {
    name: "exchange",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
      { name: "min_dy", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "get_dy",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Swap transaction parameters
 */
export interface SwapParams {
  fromToken: "LUSD" | "UUSD";
  toToken: "LUSD" | "UUSD";
  amountIn: bigint;
  minAmountOut: bigint;
  slippageTolerance?: number; // Default 0.5%
}

/**
 * Swap transaction result
 */
export interface SwapResult {
  hash: Hash;
  amountIn: bigint;
  amountOut: bigint;
  fromToken: string;
  toToken: string;
}

/**
 * Service for executing swaps through Curve pool
 */
export class SwapService {
  private _walletService: WalletService;
  private _contractService: ContractService;

  // Curve LUSD/UUSD pool on mainnet
  private readonly _curvePoolAddress: Address = ADDRESSES.CURVE_POOL;
  private readonly _lusdIndex = 0n;
  private readonly _uusdIndex = 1n;

  // Token addresses
  private readonly _lusdAddress: Address = LUSD_COLLATERAL.address;
  private readonly _uusdAddress: Address = ADDRESSES.DOLLAR;

  private readonly _defaultSlippage = DEFAULT_SLIPPAGE_PERCENT;

  constructor(walletService: WalletService, contractService: ContractService) {
    this._walletService = walletService;
    this._contractService = contractService;
  }

  /**
   * Execute a swap through Curve pool
   * @param params - Swap parameters including amount, tokens, and slippage
   * @returns Promise<SwapResult> containing transaction hash and output amounts
   * @throws Error if wallet not connected or swap fails
   */
  async executeSwap(params: SwapParams): Promise<SwapResult> {
    if (!this._walletService.isConnected()) {
      throw new Error("Wallet not connected");
    }

    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    // Validate swap parameters
    this._validateSwapParams(params);

    // Get token addresses and indices
    const { fromTokenAddress, fromIndex, toIndex } = this._getSwapTokenInfo(params);

    // Check and handle token approval
    await this._ensureTokenApproval(fromTokenAddress, account, params.amountIn);

    // Get expected output first
    const expectedOutput = await this._getSwapQuoteInternal(params.amountIn, fromIndex, toIndex);

    // Calculate minimum output with slippage protection
    const slippage = params.slippageTolerance || this._defaultSlippage;
    const minAmountOut = params.minAmountOut || this._calculateMinAmountOut(expectedOutput, slippage);

    try {
      // Execute the swap
      const walletClient = this._walletService.getWalletClient();
      const hash = await walletClient.writeContract({
        address: this._curvePoolAddress,
        abi: CURVE_POOL_ABI,
        functionName: "exchange",
        args: [fromIndex, toIndex, params.amountIn, minAmountOut],
        account,
        chain: this._walletService.getChain(),
      });

      // Get actual output amount from transaction receipt
      const publicClient = this._walletService.getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash });

      // Estimate output amount
      const estimatedOutput = await this._getSwapQuoteInternal(params.amountIn, fromIndex, toIndex);

      return {
        hash,
        amountIn: params.amountIn,
        amountOut: estimatedOutput,
        fromToken: params.fromToken,
        toToken: params.toToken,
      };
    } catch (error: unknown) {
      console.error("Swap transaction failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("ChainMismatchError")) {
        throw new Error("Wrong network. Please switch to Ethereum mainnet.");
      }
      throw new Error(`Swap failed: ${errorMessage}`);
    }
  }

  /**
   * Get a quote for a swap without executing
   * @param amountIn - Amount to swap (in wei)
   * @param fromToken - Source token (LUSD or UUSD)
   * @param toToken - Destination token (LUSD or UUSD)
   * @returns Promise<bigint> Expected output amount (in wei)
   */
  async getSwapQuote(amountIn: bigint, fromToken: "LUSD" | "UUSD", toToken: "LUSD" | "UUSD"): Promise<bigint> {
    const { fromIndex, toIndex } = this._getSwapTokenInfo({ fromToken, toToken });
    return this._getSwapQuoteInternal(amountIn, fromIndex, toIndex);
  }

  /**
   * Get swap quote from Curve pool
   */
  private async _getSwapQuoteInternal(amountIn: bigint, fromIndex: bigint, toIndex: bigint): Promise<bigint> {
    // Create cache key that includes all parameters
    const cacheKey = `curve-dy-${fromIndex}-${toIndex}-${amountIn.toString()}`;

    return await cacheService.getOrFetch(
      cacheKey,
      async () => {
        const publicClient = this._walletService.getPublicClient();

        return (await publicClient.readContract({
          address: this._curvePoolAddress,
          abi: CURVE_POOL_ABI,
          functionName: "get_dy",
          args: [fromIndex, toIndex, amountIn],
        })) as bigint;
      },
      CACHE_CONFIGS.CURVE_DY_QUOTE
    );
  }

  /**
   * Check token approval and approve if necessary
   */
  private async _ensureTokenApproval(tokenAddress: Address, account: Address, amount: bigint): Promise<void> {
    const currentAllowance = await this._contractService.getAllowance(tokenAddress, account, this._curvePoolAddress);

    if (currentAllowance < amount) {
      const approvalHash = await this._contractService.approveToken(
        tokenAddress,
        this._curvePoolAddress,
        maxUint256 // Approve unlimited to save gas on future swaps
      );

      // Wait for approval to be mined
      const publicClient = this._walletService.getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash: approvalHash as Hash });
    }
  }

  /**
   * Get token addresses and indices for swap
   */
  private _getSwapTokenInfo(params: Pick<SwapParams, "fromToken" | "toToken">): {
    fromTokenAddress: Address;
    toTokenAddress: Address;
    fromIndex: bigint;
    toIndex: bigint;
  } {
    let fromTokenAddress: Address;
    let toTokenAddress: Address;
    let fromIndex: bigint;
    let toIndex: bigint;

    if (params.fromToken === "LUSD") {
      fromTokenAddress = this._lusdAddress;
      fromIndex = this._lusdIndex;
    } else {
      fromTokenAddress = this._uusdAddress;
      fromIndex = this._uusdIndex;
    }

    if (params.toToken === "LUSD") {
      toTokenAddress = this._lusdAddress;
      toIndex = this._lusdIndex;
    } else {
      toTokenAddress = this._uusdAddress;
      toIndex = this._uusdIndex;
    }

    return { fromTokenAddress, toTokenAddress, fromIndex, toIndex };
  }

  /**
   * Calculate minimum amount out with slippage protection
   */
  private _calculateMinAmountOut(expectedAmount: bigint, slippageTolerance: number): bigint {
    const slippageBps = BigInt(Math.floor(slippageTolerance * Number(BASIS_POINTS_DIVISOR)));
    return (expectedAmount * (BASIS_POINTS_DIVISOR - slippageBps)) / BASIS_POINTS_DIVISOR;
  }

  /**
   * Validate swap parameters
   */
  private _validateSwapParams(params: SwapParams): void {
    if (params.fromToken === params.toToken) {
      throw new Error("Cannot swap same token");
    }

    if (params.amountIn <= 0n) {
      throw new Error("Amount in must be greater than 0");
    }

    if (params.minAmountOut < 0n) {
      throw new Error("Minimum amount out cannot be negative");
    }

    if (params.slippageTolerance && (params.slippageTolerance < 0 || params.slippageTolerance > 1)) {
      throw new Error("Slippage tolerance must be between 0 and 1 (0% to 100%)");
    }

    // Check supported tokens
    if (!["LUSD", "UUSD"].includes(params.fromToken) || !["LUSD", "UUSD"].includes(params.toToken)) {
      throw new Error("Only LUSD and UUSD tokens are supported");
    }
  }

  /**
   * Get pool address for external reference
   */
  getPoolAddress(): Address {
    return this._curvePoolAddress;
  }

  /**
   * Get supported tokens
   */
  getSupportedTokens(): string[] {
    return ["LUSD", "UUSD"];
  }
}
