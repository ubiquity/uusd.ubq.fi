import { type Address, maxUint256, formatUnits } from "viem";
import { ADDRESSES, DIAMOND_ABI, ERC20_ABI } from "../contracts/constants.ts";
import type { CollateralInfo } from "../utils/calculation-utils.ts";
import type { WalletService } from "./wallet-service.ts";
import { analyzeOracleError, getAlternativeActions, getOracleRefreshEstimate } from "../utils/oracle-utils.ts";
import { CurvePriceService } from "./curve-price-service.ts";
import { cacheService, CACHE_CONFIGS } from "./cache-service.ts";

/**
 * Extended collateral information with blockchain state
 */
export interface CollateralOption extends CollateralInfo {
  isEnabled?: boolean;
  isMintPaused?: boolean;
  isRedeemPaused?: boolean;
}

/**
 * Batch mint data response
 */
export interface BatchMintData {
  collateralRatio: bigint;
  governancePrice: bigint;
  collateralAmount: bigint;
}

/**
 * Batch page load data response
 */
export interface BatchPageLoadData {
  uusdPrice: bigint;
  collateralOptions: CollateralOption[];
}

/**
 * Interface for contract read operations
 */
export interface ContractReads {
  getCollateralRatio(): Promise<bigint>;
  getGovernancePrice(): Promise<bigint>;
  getDollarInCollateral(collateralIndex: number, dollarAmount: bigint): Promise<bigint>;
  getAllowance(tokenAddress: Address, owner: Address, spender: Address): Promise<bigint>;
  getRedeemCollateralBalance(userAddress: Address, collateralIndex: number): Promise<bigint>;
  batchFetchMintData(collateralIndex: number, dollarAmount: bigint): Promise<BatchMintData>;
  batchFetchPageLoadData(): Promise<BatchPageLoadData>;
}

/**
 * Interface for contract write operations
 */
export interface ContractWrites {
  approveToken(tokenAddress: Address, spender: Address, amount: bigint): Promise<string>;
  mintDollar(
    collateralIndex: number,
    dollarAmount: bigint,
    dollarOutMin: bigint,
    maxCollateralIn: bigint,
    maxGovernanceIn: bigint,
    isOneToOne: boolean
  ): Promise<string>;
  redeemDollar(collateralIndex: number, dollarAmount: bigint, governanceOutMin: bigint, collateralOutMin: bigint): Promise<string>;
  collectRedemption(collateralIndex: number): Promise<string>;
}

/**
 * Service responsible for all blockchain contract interactions
 */
export class ContractService implements ContractReads, ContractWrites {
  private _walletService: WalletService;
  private _curvePriceService: CurvePriceService;

  constructor(walletService: WalletService) {
    this._walletService = walletService;
    this._curvePriceService = new CurvePriceService(walletService);
  }

  /**
   * Load all available collateral options from the contract
   */
  async loadCollateralOptions(): Promise<CollateralOption[]> {
    const { collateralOptions } = await this.batchFetchPageLoadData();
    return collateralOptions;
  }

  /**
   * Get current collateral ratio from the contract (cached)
   */
  async getCollateralRatio(): Promise<bigint> {
    return cacheService.getOrFetch(
      "collateral-ratio",
      async () => {
        const publicClient = this._walletService.getPublicClient();
        return (await publicClient.readContract({
          address: ADDRESSES.DIAMOND,
          abi: DIAMOND_ABI,
          functionName: "collateralRatio",
        })) as bigint;
      },
      CACHE_CONFIGS.COLLATERAL_RATIO
    );
  }

  /**
   * Get current governance token price from the contract (cached with oracle fallback)
   */
  async getGovernancePrice(): Promise<bigint> {
    return cacheService.getOrFetch(
      "governance-price",
      async () => {
        const publicClient = this._walletService.getPublicClient();
        return (await publicClient.readContract({
          address: ADDRESSES.DIAMOND,
          abi: DIAMOND_ABI,
          functionName: "getGovernancePriceUsd",
        })) as bigint;
      },
      CACHE_CONFIGS.GOVERNANCE_PRICE
    );
  }

  /**
   * Get LUSD oracle price from Diamond contract (cached)
   */
  async getLUSDOraclePrice(): Promise<bigint> {
    return cacheService.getOrFetch(
      "lusd-oracle-price",
      async () => {
        const publicClient = this._walletService.getPublicClient();
        return (await publicClient.readContract({
          address: ADDRESSES.DIAMOND,
          abi: DIAMOND_ABI,
          functionName: "getDollarPriceUsd",
        })) as bigint;
      },
      CACHE_CONFIGS.LUSD_ORACLE_PRICE
    );
  }

  /**
   * Get current UUSD market price from Curve pool (not oracle price)
   */
  async getDollarPriceUsd(): Promise<bigint> {
    try {
      const publicClient = this._walletService.getPublicClient();

      // Get LUSD oracle price from Diamond contract
      const lusdOraclePrice = (await publicClient.readContract({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "getDollarPriceUsd",
      })) as bigint;

      // Calculate actual UUSD market price using Curve pool
      const uusdMarketPrice = await this._curvePriceService.getUUSDMarketPrice(lusdOraclePrice);

      return uusdMarketPrice;
    } catch (error) {
      console.error("❌ Failed to get UUSD market price, falling back to oracle price:", error);

      // Fallback to original oracle price if Curve calculation fails
      const publicClient = this._walletService.getPublicClient();
      return (await publicClient.readContract({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "getDollarPriceUsd",
      })) as bigint;
    }
  }

  /**
   * Get collateral amount needed for a given dollar amount
   */
  async getDollarInCollateral(collateralIndex: number, dollarAmount: bigint): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();
    return (await publicClient.readContract({
      address: ADDRESSES.DIAMOND,
      abi: DIAMOND_ABI,
      functionName: "getDollarInCollateral",
      args: [BigInt(collateralIndex), dollarAmount],
    })) as bigint;
  }

  /**
   * Batch fetch all mint calculation data in a single RPC call
   * This replaces 3 individual contract calls with 1 multicall
   */
  async batchFetchMintData(collateralIndex: number, dollarAmount: bigint): Promise<BatchMintData> {
    const publicClient = this._walletService.getPublicClient();

    try {
      const results = await publicClient.multicall({
        contracts: [
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "collateralRatio",
          },
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "getGovernancePriceUsd",
          },
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "getDollarInCollateral",
            args: [BigInt(collateralIndex), dollarAmount],
          },
        ],
      });

      // Extract results with proper error handling
      const collateralRatio = results[0].status === "success" ? (results[0].result as bigint) : 0n;
      const governancePrice = results[1].status === "success" ? (results[1].result as bigint) : 0n;
      const collateralAmount = results[2].status === "success" ? (results[2].result as bigint) : 0n;

      // Check for any failures
      const failedCalls = results.filter((r) => r.status === "failure");
      if (failedCalls.length > 0) {
        console.warn("⚠️ Some batch calls failed:", failedCalls.length);
        // Log individual failures for debugging
        failedCalls.forEach((failure, _index) => {
          console.warn(`Call failed:`, failure.error);
        });
      }

      return {
        collateralRatio,
        governancePrice,
        collateralAmount,
      };
    } catch (error) {
      console.error("❌ Batch fetch failed, falling back to individual calls:", error);

      // Fallback to individual calls if multicall fails
      const [collateralRatio, governancePrice, collateralAmount] = await Promise.all([
        this.getCollateralRatio(),
        this.getGovernancePrice(),
        this.getDollarInCollateral(collateralIndex, dollarAmount),
      ]);

      return {
        collateralRatio,
        governancePrice,
        collateralAmount,
      };
    }
  }

  /**
   * Batch fetch all page load data in a single RPC call
   */
  async batchFetchPageLoadData(): Promise<BatchPageLoadData> {
    const publicClient = this._walletService.getPublicClient();

    try {
      const initialResults = await publicClient.multicall({
        contracts: [
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "getDollarPriceUsd",
          },
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "allCollaterals",
          },
        ],
      });

      const uusdPrice = initialResults[0].status === "success" ? (initialResults[0].result as bigint) : 0n;
      const collateralAddresses = initialResults[1].status === "success" ? (initialResults[1].result as Address[]) : [];

      if (collateralAddresses.length === 0) {
        return { uusdPrice, collateralOptions: [] };
      }

      const collateralInfoContracts = collateralAddresses.map((address) => ({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "collateralInformation" as const,
        args: [address] as const,
      }));

      const collateralInfoResults = await publicClient.multicall({
        contracts: collateralInfoContracts,
      });

      const collateralOptions: CollateralOption[] = collateralInfoResults
        .map((result, i) => {
          if (result.status === "success") {
            const info = result.result as {
              index: bigint;
              symbol: string;
              mintingFee: bigint;
              redemptionFee: bigint;
              missingDecimals: bigint;
              isEnabled: boolean;
              isMintPaused: boolean;
              isRedeemPaused: boolean;
            };
            return {
              index: Number(info.index),
              name: info.symbol,
              address: collateralAddresses[i],
              mintingFee: Number(formatUnits(info.mintingFee, 6)),
              redemptionFee: Number(formatUnits(info.redemptionFee, 6)),
              missingDecimals: Number(info.missingDecimals),
              isEnabled: Boolean(info.isEnabled),
              isMintPaused: Boolean(info.isMintPaused),
              isRedeemPaused: Boolean(info.isRedeemPaused),
            } as CollateralOption;
          }
          return null;
        })
        .filter((o): o is CollateralOption => o !== null && Boolean(o.isEnabled) && !o.isMintPaused);

      return { uusdPrice, collateralOptions };
    } catch (error) {
      console.error("❌ Page load batch fetch failed, falling back to individual calls:", error);
      const uusdPrice = await this.getDollarPriceUsd();
      // This part will be slow, but it's a fallback
      const publicClient = this._walletService.getPublicClient();
      const addresses = (await publicClient.readContract({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "allCollaterals",
      })) as Address[];
      const options = await Promise.all(
        addresses.map(async (address) => {
          const info = (await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "collateralInformation",
            args: [address],
          })) as {
            index: bigint;
            symbol: string;
            mintingFee: bigint;
            redemptionFee: bigint;
            missingDecimals: bigint;
            isEnabled: boolean;
            isMintPaused: boolean;
            isRedeemPaused: boolean;
          };
          return {
            index: Number(info.index),
            name: info.symbol,
            address: address,
            mintingFee: Number(formatUnits(info.mintingFee, 6)),
            redemptionFee: Number(formatUnits(info.redemptionFee, 6)),
            missingDecimals: Number(info.missingDecimals),
            isEnabled: Boolean(info.isEnabled),
            isMintPaused: Boolean(info.isMintPaused),
            isRedeemPaused: Boolean(info.isRedeemPaused),
          };
        })
      );
      const collateralOptions = options.filter((o) => Boolean(o.isEnabled) && !o.isMintPaused);
      return { uusdPrice, collateralOptions };
    }
  }

  /**
   * Get token allowance for a specific owner and spender
   */
  async getAllowance(tokenAddress: Address, owner: Address, spender: Address): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();
    return (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  }

  /**
   * Get pending redemption balance for a user and collateral
   */
  async getRedeemCollateralBalance(userAddress: Address, collateralIndex: number): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();
    return (await publicClient.readContract({
      address: ADDRESSES.DIAMOND,
      abi: DIAMOND_ABI,
      functionName: "getRedeemCollateralBalance",
      args: [userAddress, BigInt(collateralIndex)],
    })) as bigint;
  }

  /**
   * Approve a token for spending by a spender
   */
  async approveToken(tokenAddress: Address, spender: Address, amount: bigint = maxUint256): Promise<string> {
    this._walletService.validateConnection();
    const walletClient = this._walletService.getWalletClient();
    const publicClient = this._walletService.getPublicClient();
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const args = [spender, amount];

    // Estimate gas with fallback handling
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateContractGas({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args,
        account,
      });
    } catch {
      // Fallback gas limit for approval operations
      gasEstimate = 100000n;
    }

    // Add 20% buffer to gas estimate
    const gasLimit = gasEstimate + (gasEstimate * 20n) / 100n;

    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args,
      account,
      chain: this._walletService.getChain(),
      gas: gasLimit,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Execute mint dollar transaction
   */
  async mintDollar(
    collateralIndex: number,
    dollarAmount: bigint,
    dollarOutMin: bigint = 0n,
    maxCollateralIn: bigint = maxUint256,
    maxGovernanceIn: bigint = maxUint256,
    isOneToOne: boolean = false
  ): Promise<string> {
    this._walletService.validateConnection();
    const walletClient = this._walletService.getWalletClient();
    const publicClient = this._walletService.getPublicClient();
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const args: readonly [bigint, bigint, bigint, bigint, bigint, boolean] = [
      BigInt(collateralIndex),
      dollarAmount,
      dollarOutMin,
      maxCollateralIn,
      maxGovernanceIn,
      isOneToOne,
    ];

    // Estimate gas with oracle error detection
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateContractGas({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "mintDollar",
        args,
        account,
      });
    } catch (estimationError: unknown) {
      // Analyze oracle error with enhanced messaging
      const errorMessage = (estimationError as Error).message || String(estimationError);
      const oracleAnalysis = analyzeOracleError(errorMessage);

      if (oracleAnalysis.isOracleIssue) {
        const refreshEstimate = getOracleRefreshEstimate();
        const alternatives = getAlternativeActions();

        const enhancedMessage = [
          oracleAnalysis.userMessage,
          ...oracleAnalysis.suggestions,
          "",
          `🕒 ${refreshEstimate}`,
          "",
          "Alternative actions:",
          ...alternatives,
        ].join("\n");

        throw new Error(enhancedMessage);
      }

      // For other gas estimation failures, use fallback

      gasEstimate = 500000n;
    }

    // Add 20% buffer to gas estimate
    const gasLimit = gasEstimate + (gasEstimate * 20n) / 100n;

    const hash = await walletClient.writeContract({
      address: ADDRESSES.DIAMOND,
      abi: DIAMOND_ABI,
      functionName: "mintDollar",
      args,
      account,
      chain: this._walletService.getChain(),
      gas: gasLimit,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Execute redeem dollar transaction
   */
  async redeemDollar(collateralIndex: number, dollarAmount: bigint, governanceOutMin: bigint = 0n, collateralOutMin: bigint = 0n): Promise<string> {
    this._walletService.validateConnection();
    const walletClient = this._walletService.getWalletClient();
    const publicClient = this._walletService.getPublicClient();
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const args: readonly [bigint, bigint, bigint, bigint] = [BigInt(collateralIndex), dollarAmount, governanceOutMin, collateralOutMin];

    // Estimate gas with oracle error detection
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateContractGas({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: "redeemDollar",
        args,
        account,
      });
    } catch (estimationError: unknown) {
      // Analyze error message for specific contract errors
      const errorMessage = estimationError instanceof Error ? estimationError.message : String(estimationError);

      // Check for specific contract errors first
      if (errorMessage.includes("Dollar price too high")) {
        throw new Error(
          "Cannot redeem at this time: The current UUSD price is too high relative to collateral prices. This is a safety mechanism to protect the protocol. Please try again later."
        );
      }

      if (errorMessage.includes("Collateral disabled")) {
        throw new Error("Redemptions are temporarily disabled for this collateral type. Please try again later or use a different collateral.");
      }

      if (errorMessage.includes("Insufficient collateral")) {
        throw new Error("Insufficient collateral in the protocol to fulfill this redemption. Please try a smaller amount.");
      }

      // Analyze oracle error with enhanced messaging
      const oracleAnalysis = analyzeOracleError(errorMessage);

      if (oracleAnalysis.isOracleIssue) {
        const refreshEstimate = getOracleRefreshEstimate();
        const alternatives = getAlternativeActions();

        const enhancedMessage = [
          oracleAnalysis.userMessage,
          ...oracleAnalysis.suggestions,
          "",
          `🕒 ${refreshEstimate}`,
          "",
          "Alternative actions:",
          ...alternatives,
        ].join("\n");

        throw new Error(enhancedMessage);
      }

      // For other gas estimation failures, use fallback

      gasEstimate = 400000n;
    }

    // Add 20% buffer to gas estimate
    const gasLimit = gasEstimate + (gasEstimate * 20n) / 100n;

    const hash = await walletClient.writeContract({
      address: ADDRESSES.DIAMOND,
      abi: DIAMOND_ABI,
      functionName: "redeemDollar",
      args,
      account,
      chain: this._walletService.getChain(),
      gas: gasLimit,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Collect pending redemption
   */
  async collectRedemption(collateralIndex: number): Promise<string> {
    this._walletService.validateConnection();
    const walletClient = this._walletService.getWalletClient();
    const publicClient = this._walletService.getPublicClient();
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const hash = await walletClient.writeContract({
      address: ADDRESSES.DIAMOND,
      abi: DIAMOND_ABI,
      functionName: "collectRedemption",
      args: [BigInt(collateralIndex)],
      account,
      chain: this._walletService.getChain(),
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Check allowances for both collateral and governance tokens
   */
  async checkMintAllowances(
    collateralAddress: Address,
    account: Address,
    collateralNeeded: bigint,
    governanceNeeded: bigint
  ): Promise<{ collateralAllowance: bigint; governanceAllowance: bigint }> {
    const [collateralAllowance, governanceAllowance] = await Promise.all([
      collateralNeeded > 0n ? this.getAllowance(collateralAddress, account, ADDRESSES.DIAMOND) : maxUint256,
      governanceNeeded > 0n ? this.getAllowance(ADDRESSES.GOVERNANCE, account, ADDRESSES.DIAMOND) : maxUint256,
    ]);

    return { collateralAllowance, governanceAllowance };
  }

  /**
   * Check UUSD allowance for redeem operations
   */
  async checkRedeemAllowance(account: Address, amount: bigint): Promise<bigint> {
    if (amount <= 0n) return maxUint256;
    return this.getAllowance(ADDRESSES.DOLLAR, account, ADDRESSES.DIAMOND);
  }

  /**
   * Get comprehensive protocol settings
   */
  async getProtocolSettings(collateralIndex: number = 0): Promise<ProtocolSettings> {
    const publicClient = this._walletService.getPublicClient();

    try {
      const results = await publicClient.multicall({
        contracts: [
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "collateralRatio",
          },
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "getDollarPriceUsd",
          },
          {
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: "allCollaterals",
          },
        ],
      });

      const collateralRatio = results[0].status === "success" ? (results[0].result as bigint) : 0n;
      const currentUUSDPrice = results[1].status === "success" ? (results[1].result as bigint) : 0n;
      const collateralAddresses = results[2].status === "success" ? (results[2].result as Address[]) : [];

      // Get collateral-specific info if addresses available
      let collateralInfo: {
        isMintPaused: boolean;
        isRedeemPaused: boolean;
        mintingFee: bigint;
        redemptionFee: bigint;
      } | null = null;
      if (collateralAddresses.length > collateralIndex) {
        collateralInfo = (await publicClient.readContract({
          address: ADDRESSES.DIAMOND,
          abi: DIAMOND_ABI,
          functionName: "collateralInformation",
          args: [collateralAddresses[collateralIndex]],
        })) as {
          isMintPaused: boolean;
          isRedeemPaused: boolean;
          mintingFee: bigint;
          redemptionFee: bigint;
        };
      }

      // Calculate percentage for UI display
      const collateralRatioPercentage = formatUnits(collateralRatio, 6);
      const governanceRatioPercentage = 100 - Number(collateralRatioPercentage);

      return {
        collateralRatio,
        collateralRatioPercentage: Number(collateralRatioPercentage),
        governanceRatioPercentage,
        mintPaused: collateralInfo ? Boolean(collateralInfo.isMintPaused) : false,
        redeemPaused: collateralInfo ? Boolean(collateralInfo.isRedeemPaused) : false,
        mintingFee: collateralInfo ? collateralInfo.mintingFee : 0n,
        redemptionFee: collateralInfo ? collateralInfo.redemptionFee : 0n,
        currentUUSDPrice,
        isFullyCollateralized: collateralRatio >= 1000000n,
        isFullyAlgorithmic: collateralRatio === 0n,
        isFractional: collateralRatio > 0n && collateralRatio < 1000000n,
      };
    } catch (error) {
      console.error("Failed to fetch protocol settings:", error);
      throw new Error(`Cannot load protocol settings: ${error}`);
    }
  }
}

/**
 * Interface for comprehensive protocol settings
 */
export interface ProtocolSettings {
  collateralRatio: bigint;
  collateralRatioPercentage: number;
  governanceRatioPercentage: number;
  mintPaused: boolean;
  redeemPaused: boolean;
  mintingFee: bigint;
  redemptionFee: bigint;
  currentUUSDPrice: bigint;
  isFullyCollateralized: boolean;
  isFullyAlgorithmic: boolean;
  isFractional: boolean;
}
