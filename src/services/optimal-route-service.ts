import { formatEther, formatUnits, parseEther, type Address } from "viem";
import type { PriceService, MintPriceResult, RedeemPriceResult } from "./price-service.ts";
import type { CurvePriceService } from "./curve-price-service.ts";
import type { ContractService } from "./contract-service.ts";
import type { WalletService } from "./wallet-service.ts";
import { LUSD_COLLATERAL, ADDRESSES } from "../contracts/constants.ts";
import { cacheService, CACHE_CONFIGS } from "./cache-service.ts";
import { INVENTORY_TOKENS } from "../types/inventory.types.ts";
import type { postSwapOrderFromQuote } from "@cowprotocol/cow-sdk";

/**
 * Route types for optimal execution
 */
export type RouteType = "mint" | "redeem" | "swap" | "cowswap";

/**
 * Direction of the exchange
 */
export type ExchangeDirection = "deposit" | "withdraw";

/**
 * Result of optimal route calculation
 */
export interface OptimalRouteResult {
  routeType: RouteType;
  expectedOutput: bigint;
  outputToken: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  inputAmount: bigint;
  inputToken: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  direction: ExchangeDirection;
  marketPrice: bigint;
  pegPrice: bigint; // Always 1.000000 (6 decimals)
  savings: {
    amount: bigint;
    percentage: number;
  };
  // reason: string;
  isEnabled: boolean;
  disabledReason?: string;
  // UBQ-related information for mixed operations
  ubqAmount?: bigint; // Amount of UBQ for mixed redemptions
  isUbqOperation?: boolean; // Whether this involves UBQ
  executeCowSwapOrder?: () => ReturnType<typeof postSwapOrderFromQuote>; // Function to execute CowSwap order
}

/**
 * Service to determine optimal route for LUSD ↔ UUSD exchanges
 */
export class OptimalRouteService {
  private _priceService: PriceService;
  private _curvePriceService: CurvePriceService;
  private _contractService: ContractService;
  private _walletService: WalletService;
  private readonly _pegPrice = 1000000n; // $1.00 with 6 decimals

  constructor(priceService: PriceService, curvePriceService: CurvePriceService, contractService: ContractService, walletService: WalletService) {
    this._priceService = priceService;
    this._curvePriceService = curvePriceService;
    this._contractService = contractService;
    this._walletService = walletService;
  }

  /**
   * Get optimal route for depositing LUSD to get UUSD
   * Compares mint vs swap routes and returns the most economical option
   * @param lusdAmount - Amount of LUSD to deposit (in wei)
   * @param isForceCollateralOnly - If true, only considers pure LUSD options (no UBQ discount)
   * @returns Promise<OptimalRouteResult> containing route details and expected outputs
   */
  async getOptimalDepositRoute(lusdAmount: bigint, isForceCollateralOnly: boolean = false): Promise<OptimalRouteResult> {
    try {
      // Get current market conditions with timeout protection
      const marketConditionsPromise = Promise.all([this._contractService.getLUSDOraclePrice(), this._curvePriceService.getUUSDMarketPrice(this._pegPrice)]);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Market conditions timeout")), 10000);
      });

      const [, marketPrice] = (await Promise.race([marketConditionsPromise, timeoutPromise])) as [bigint, bigint];

      const dollarAmount = parseEther(formatUnits(lusdAmount, 18));

      // Calculate both mint options with timeout protection
      const mixedMintPromise = this._priceService.calculateMintOutput({
        dollarAmount,
        collateralIndex: LUSD_COLLATERAL.index,
        isForceCollateralOnly: false,
      });

      const collateralOnlyMintPromise = this._priceService.calculateMintOutput({
        dollarAmount,
        collateralIndex: LUSD_COLLATERAL.index,
        isForceCollateralOnly: true,
      });

      const mintTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Mint calculation timeout")), 10000);
      });

      const [mixedMintResult, collateralOnlyMintResult] = (await Promise.race([
        Promise.all([mixedMintPromise, collateralOnlyMintPromise]),
        mintTimeoutPromise,
      ])) as [MintPriceResult, MintPriceResult];

      // Calculate swap output (LUSD → UUSD via Curve)
      const swapOutputUUSD = await this._getSwapOutput(lusdAmount, "LUSD", "UUSD");

      // Determine optimal route based on user preference and market conditions
      let routeType: RouteType;
      let expectedOutput: bigint;
      // let reason: string;
      let isEnabled = true;
      let disabledReason: string | undefined;

      if (!isForceCollateralOnly) {
        // User wants UBQ discount - ALWAYS use mixed mint (can't swap UBQ on Curve)
        if (!mixedMintResult.isMintingAllowed) {
          // Minting disabled, can't use UBQ discount
          routeType = "mint";
          expectedOutput = 0n;
          isEnabled = false;
          disabledReason = "UBQ discount not available - minting is currently disabled";
        } else {
          routeType = "mint";
          expectedOutput = mixedMintResult.totalDollarMint;
          // reason = `Minting with 95% LUSD + 5% UBQ discount.`;
        }
      } else {
        // User doesn't want UBQ discount - compare mint vs swap for best rate
        if (!collateralOnlyMintResult.isMintingAllowed) {
          // Minting disabled, use swap
          routeType = "swap";
          expectedOutput = swapOutputUUSD;
          // reason = 'Minting disabled. Using Curve swap.';
        } else {
          // Compare collateral-only mint vs swap
          if (collateralOnlyMintResult.totalDollarMint >= swapOutputUUSD) {
            routeType = "mint";
            expectedOutput = collateralOnlyMintResult.totalDollarMint;
            // reason = 'Protocol mint offers better rate than Curve swap.';
          } else {
            routeType = "swap";
            expectedOutput = swapOutputUUSD;
            // reason = 'Curve swap offers better rate than protocol mint.';
          }
        }
      }

      // Calculate alternative output for savings comparison
      const allOutputs = [swapOutputUUSD, mixedMintResult.totalDollarMint, collateralOnlyMintResult.totalDollarMint];
      const alternativeOutput = allOutputs.filter((output) => output !== expectedOutput).reduce((max, current) => (current > max ? current : max), 0n);
      const savings = this._calculateSavings(expectedOutput, alternativeOutput);

      return {
        routeType,
        expectedOutput,
        outputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        inputToken: {
          address: INVENTORY_TOKENS.LUSD.address,
          symbol: INVENTORY_TOKENS.LUSD.symbol,
          decimals: INVENTORY_TOKENS.LUSD.decimals,
        },
        inputAmount: lusdAmount,
        direction: "deposit",
        marketPrice,
        pegPrice: this._pegPrice,
        savings,
        // reason,
        isEnabled,
        disabledReason,
        // Add UBQ information for mixed minting
        ubqAmount: routeType === "mint" && !isForceCollateralOnly ? mixedMintResult.governanceNeeded : undefined,
        isUbqOperation: routeType === "mint" && !isForceCollateralOnly,
      };
    } catch (error) {
      // Log error details for production monitoring
      console.error("Error calculating optimal deposit route:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        lusdAmount: lusdAmount.toString(),
        timestamp: new Date().toISOString(),
      });

      // Fallback to swap if calculations fail
      try {
        const swapOutput = await this._getSwapOutput(lusdAmount, "LUSD", "UUSD");
        return {
          routeType: "swap",
          expectedOutput: swapOutput,
          inputAmount: lusdAmount,
          outputToken: {
            address: INVENTORY_TOKENS.UUSD.address,
            symbol: INVENTORY_TOKENS.UUSD.symbol,
            decimals: INVENTORY_TOKENS.UUSD.decimals,
          },
          inputToken: {
            address: INVENTORY_TOKENS.LUSD.address,
            symbol: INVENTORY_TOKENS.LUSD.symbol,
            decimals: INVENTORY_TOKENS.LUSD.decimals,
          },
          direction: "deposit",
          marketPrice: this._pegPrice,
          pegPrice: this._pegPrice,
          savings: { amount: 0n, percentage: 0 },
          // reason: 'Using Curve swap (fallback due to calculation error).',
          isEnabled: true,
        };
      } catch (fallbackError) {
        // Log fallback error for monitoring
        console.error("Fallback swap calculation also failed:", {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          originalError: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        throw new Error(`Failed to calculate optimal route: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Get optimal route for withdrawing UUSD to get LUSD
   * Compares redeem vs swap routes and returns the most economical option
   * @param uusdAmount - Amount of UUSD to withdraw (in wei)
   * @param isLusdOnlyRedemption - If true, only accepts pure LUSD redemptions (no UBQ mix)
   * @returns Promise<OptimalRouteResult> containing route details and expected outputs
   * @note For withdrawing, this method will NEVER return 'mint' as a route type
   */
  async getOptimalWithdrawRoute(uusdAmount: bigint, isLusdOnlyRedemption: boolean = false): Promise<OptimalRouteResult> {
    try {
      // Get current market conditions
      let lusdPrice: bigint;
      let marketPrice: bigint;

      try {
        lusdPrice = await this._contractService.getLUSDOraclePrice();

        marketPrice = await this._curvePriceService.getUUSDMarketPrice(this._pegPrice);
      } catch (error) {
        console.error("❌ Error getting market conditions:", error);
        throw new Error(`Failed to get market conditions: ${error}`);
      }

      console.log("📊 Market conditions:", {
        lusdPrice: formatUnits(lusdPrice, 6),
        marketPrice: formatUnits(marketPrice, 6),
        pegPrice: formatUnits(this._pegPrice, 6),
      });

      // Calculate redeem output with oracle error handling
      let redeemResult: RedeemPriceResult;
      try {
        // For LUSD-only redemption, we can skip governance price entirely
        const shouldSkipGovernancePrice = isLusdOnlyRedemption;

        // Add timeout to prevent hanging
        const redeemPromise = this._priceService.calculateRedeemOutput(
          {
            dollarAmount: uusdAmount,
            collateralIndex: LUSD_COLLATERAL.index,
          },
          shouldSkipGovernancePrice
        );

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Redeem calculation timeout")), 10000);
        });

        redeemResult = (await Promise.race([redeemPromise, timeoutPromise])) as RedeemPriceResult;
      } catch (error) {
        console.error("❌ Error calculating redeem output:", error);

        // Check if it's an oracle error and we can fall back to swap-only
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("Stale data") || errorMessage.includes("oracle")) {
          // Calculate swap output and return swap-only result
          try {
            const swapOutputLUSD = await this._getSwapOutput(uusdAmount, "UUSD", "LUSD");

            return {
              routeType: "swap" as const,
              expectedOutput: swapOutputLUSD,
              inputAmount: uusdAmount,
              outputToken: {
                address: INVENTORY_TOKENS.LUSD.address,
                symbol: INVENTORY_TOKENS.LUSD.symbol,
                decimals: INVENTORY_TOKENS.LUSD.decimals,
              },
              inputToken: {
                address: INVENTORY_TOKENS.UUSD.address,
                symbol: INVENTORY_TOKENS.UUSD.symbol,
                decimals: INVENTORY_TOKENS.UUSD.decimals,
              },
              direction: "withdraw" as const,
              marketPrice: this._pegPrice, // Fallback price
              pegPrice: this._pegPrice,
              savings: { amount: 0n, percentage: 0 },
              isEnabled: true,
              disabledReason: "Oracle data temporarily unavailable - using Curve swap",
            };
          } catch (swapError) {
            console.error("❌ Swap fallback also failed:", swapError);
            throw new Error(`Both redeem and swap calculations failed: ${error}`);
          }
        }

        throw new Error(`Failed to calculate redeem output: ${error}`);
      }

      // Calculate swap output (UUSD → LUSD via Curve)
      let swapOutputLUSD;
      try {
        swapOutputLUSD = await this._getSwapOutput(uusdAmount, "UUSD", "LUSD");
      } catch (error) {
        console.error("❌ Error calculating swap output:", error);
        throw new Error(`Failed to calculate swap output: ${error}`);
      }

      console.log("💰 Output comparison:", {
        redeemLUSD: formatEther(redeemResult.collateralRedeemed),
        redeemUBQ: formatEther(redeemResult.governanceRedeemed),
        swapLUSD: formatEther(swapOutputLUSD),
        isRedeemingAllowed: redeemResult.isRedeemingAllowed,
        isLusdOnlyRedemption,
      });

      // Determine optimal route - ONLY redeem or swap for withdrawals
      let routeType: RouteType;
      let expectedOutput: bigint;
      // let reason: string;
      let isEnabled = true;
      let disabledReason: string | undefined;

      if (!redeemResult.isRedeemingAllowed) {
        // Redeeming disabled, use swap
        routeType = "swap";
        expectedOutput = swapOutputLUSD;
        // reason = 'Redeeming disabled due to price conditions. Using Curve swap.';
      } else if (isLusdOnlyRedemption) {
        // User explicitly chose LUSD-only via swap - FORCE swap regardless of output
        routeType = "swap";
        expectedOutput = swapOutputLUSD;
        // reason = 'LUSD-only mode: Forced swap via Curve (checkbox selected).';
      } else {
        // User allows mixed redemption (95% LUSD + 5% UBQ) - PRIORITIZE REDEEM TO GET UBQ
        // When user wants mixed redemption, we should prioritize redeem to give them the UBQ bonus
        routeType = "redeem";
        expectedOutput = redeemResult.collateralRedeemed;
        // reason = `Mixed redemption: Get ${formatEther(redeemResult.collateralRedeemed)} LUSD + ${formatEther(redeemResult.governanceRedeemed)} UBQ bonus!`;
      }

      // Calculate alternative output for savings comparison
      const alternativeOutput = routeType === "redeem" ? swapOutputLUSD : redeemResult.collateralRedeemed;
      const savings = this._calculateSavings(expectedOutput, alternativeOutput);

      const result = {
        routeType,
        expectedOutput,
        inputAmount: uusdAmount,
        outputToken: {
          address: INVENTORY_TOKENS.LUSD.address,
          symbol: INVENTORY_TOKENS.LUSD.symbol,
          decimals: INVENTORY_TOKENS.LUSD.decimals,
        },
        inputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        direction: "withdraw" as const,
        marketPrice,
        pegPrice: this._pegPrice,
        savings,
        // reason,
        isEnabled,
        disabledReason,
        // Add UBQ information for mixed redemptions
        ubqAmount: routeType === "redeem" && !isLusdOnlyRedemption ? redeemResult.governanceRedeemed : undefined,
        isUbqOperation: routeType === "redeem" && !isLusdOnlyRedemption,
      };

      return result;
    } catch (error) {
      console.error("Error calculating optimal withdraw route:", error);

      // Fallback to swap if calculations fail
      try {
        const swapOutput = await this._getSwapOutput(uusdAmount, "UUSD", "LUSD");

        return {
          routeType: "swap",
          expectedOutput: swapOutput,
          inputAmount: uusdAmount,
          inputToken: {
            address: INVENTORY_TOKENS.UUSD.address,
            symbol: INVENTORY_TOKENS.UUSD.symbol,
            decimals: INVENTORY_TOKENS.UUSD.decimals,
          },
          outputToken: {
            address: INVENTORY_TOKENS.LUSD.address,
            symbol: INVENTORY_TOKENS.LUSD.symbol,
            decimals: INVENTORY_TOKENS.LUSD.decimals,
          },
          direction: "withdraw",
          marketPrice: this._pegPrice,
          pegPrice: this._pegPrice,
          savings: { amount: 0n, percentage: 0 },
          // reason: 'Using Curve swap (fallback due to calculation error).',
          isEnabled: true,
        };
      } catch {
        throw new Error(`Failed to calculate optimal route: ${error}`);
      }
    }
  }

  /**
   * Get swap output from Curve pool
   */
  private async _getSwapOutput(amount: bigint, fromToken: "LUSD" | "UUSD", toToken: "LUSD" | "UUSD"): Promise<bigint> {
    if (fromToken === toToken) {
      throw new Error("Cannot swap same token");
    }

    if (fromToken === "LUSD" && toToken === "UUSD") {
      // For LUSD → UUSD, we need to calculate based on the amount
      // Create cache key for this specific swap
      const cacheKey = `curve-dy-lusd-to-uusd-${amount.toString()}`;

      return await cacheService.getOrFetch(
        cacheKey,
        async () => {
          const publicClient = this._walletService.getPublicClient();
          return (await publicClient.readContract({
            address: ADDRESSES.CURVE_POOL,
            abi: [
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
            ],
            functionName: "get_dy",
            args: [0n, 1n, amount], // LUSD index 0, UUSD index 1
          })) as bigint;
        },
        CACHE_CONFIGS.CURVE_DY_QUOTE
      );
    } else if (fromToken === "UUSD" && toToken === "LUSD") {
      // Use existing method for UUSD → LUSD (already cached in CurvePriceService)
      return this._curvePriceService.getLUSDForUUSD(amount);
    } else {
      throw new Error(`Unsupported swap pair: ${fromToken} → ${toToken}`);
    }
  }

  /**
   * Calculate savings between two options
   */
  private _calculateSavings(optimalOutput: bigint, alternativeOutput: bigint): { amount: bigint; percentage: number } {
    if (alternativeOutput === 0n) {
      return { amount: 0n, percentage: 0 };
    }

    const savingsAmount = optimalOutput > alternativeOutput ? optimalOutput - alternativeOutput : 0n;
    const savingsPercentage = savingsAmount > 0n ? parseFloat(formatUnits((savingsAmount * 10000n) / alternativeOutput, 2)) : 0;

    return {
      amount: savingsAmount,
      percentage: savingsPercentage,
    };
  }

  /**
   * Format route result for display
   */
  formatRouteDisplay(result: OptimalRouteResult): string {
    const direction = result.direction === "deposit" ? "Deposit" : "Withdraw";
    const inputToken = result.direction === "deposit" ? "LUSD" : "UUSD";
    const outputToken = result.direction === "deposit" ? "UUSD" : "LUSD";

    const inputAmount = formatEther(result.inputAmount);
    const outputAmount = formatEther(result.expectedOutput);

    let actionText = "";
    switch (result.routeType) {
      case "mint":
        actionText = "Minting";
        break;
      case "redeem":
        actionText = "Redeeming";
        break;
      case "swap":
        actionText = "Swapping via Curve";
        break;
    }

    // const savingsText = result.savings.percentage > 0
    // ? ` (Save ${result.savings.percentage.toFixed(2)}%)`
    // : '';

    return `${direction}: ${actionText} ${inputAmount} ${inputToken} → ${outputAmount} ${outputToken}`;
  }
}
