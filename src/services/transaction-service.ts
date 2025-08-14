import { type Address, maxUint256 } from "viem";
import { ADDRESSES } from "../contracts/constants.ts";
import { validateTransactionParams } from "../utils/validation-utils.ts";
import type { WalletService } from "./wallet-service.ts";
import type { ContractService, CollateralOption } from "./contract-service.ts";
import type { PriceService, MintPriceResult } from "./price-service.ts";
import { BASIS_POINTS_DIVISOR } from "../constants/numeric-constants.ts";

/**
 * Interface for transaction execution events
 */
export interface TransactionEvents {
  onTransactionStart?: (operation: string) => void;
  onTransactionSubmitted?: (operation: string, hash: string) => void;
  onTransactionSuccess?: (operation: string, hash: string) => void;
  onTransactionError?: (operation: string, error: Error) => void;
  onApprovalNeeded?: (tokenSymbol: string) => void;
  onApprovalComplete?: (tokenSymbol: string) => void;
}

/**
 * Interface for mint transaction parameters
 */
export interface MintTransactionParams {
  collateralIndex: number;
  dollarAmount: bigint;
  isForceCollateralOnly: boolean;
}

/**
 * Interface for redeem transaction parameters
 */
export interface RedeemTransactionParams {
  collateralIndex: number;
  dollarAmount: bigint;
}

/**
 * Enum for transaction operation types
 */
export enum TransactionOperation {
  MINT = "mint",
  REDEEM = "redeem",
  COLLECT_REDEMPTION = "collect_redemption",
  APPROVE_COLLATERAL = "approve_collateral",
  APPROVE_GOVERNANCE = "approve_governance",
  APPROVE_DOLLAR = "approve_dollar",
}

/**
 * Service responsible for orchestrating multi-step transaction flows
 */
export class TransactionService {
  private _walletService: WalletService;
  private _contractService: ContractService;
  private _priceService: PriceService;
  private _events: TransactionEvents = {};

  constructor(walletService: WalletService, contractService: ContractService, priceService: PriceService) {
    this._walletService = walletService;
    this._contractService = contractService;
    this._priceService = priceService;
  }

  /**
   * Set event handlers for transaction events
   */
  setEventHandlers(events: TransactionEvents) {
    this._events = { ...this._events, ...events };
  }

  /**
   * Execute complete mint workflow with approval handling
   */
  async executeMint(params: MintTransactionParams): Promise<string> {
    const { collateralIndex, dollarAmount, isForceCollateralOnly } = params;

    console.log("ExecuteMint called with params:", {
      collateralIndex,
      dollarAmount: dollarAmount.toString(),
      isForceCollateralOnly,
    });

    // Validate wallet connection
    try {
      this._walletService.validateConnection();
    } catch (error) {
      console.error("❌ Wallet validation failed:", error);
      throw error;
    }

    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    // Validate transaction parameters
    const validation = validateTransactionParams(dollarAmount, collateralIndex, account);
    if (!validation.isValid) {
      console.error("❌ Parameter validation failed:", validation.error);
      throw new Error(validation.error);
    }

    try {
      this._events.onTransactionStart?.(TransactionOperation.MINT);

      // Get collateral info and calculate mint amounts
      const collateral = this._priceService.getCollateralByIndex(collateralIndex);
      if (!collateral) {
        console.error("❌ Collateral not found for index:", collateralIndex);
        throw new Error(`Collateral with index ${collateralIndex} not found`);
      }

      const mintResult = await this._priceService.calculateMintOutput({
        dollarAmount,
        collateralIndex,
        isForceCollateralOnly,
      });
      console.log("✅ Mint calculation result:", {
        totalDollarMint: mintResult.totalDollarMint.toString(),
        collateralNeeded: mintResult.collateralNeeded.toString(),
        governanceNeeded: mintResult.governanceNeeded.toString(),
      });

      // Handle approvals if needed

      await this._handleMintApprovals(collateral, account, mintResult);

      // Execute mint transaction with slippage tolerance
      // Add 0.5% slippage tolerance
      const slippageBasisPoints = 50n; // 0.5%
      const basisPointsDivisor = BASIS_POINTS_DIVISOR;

      // Reduce minimum output by slippage amount
      const dollarOutMin = (mintResult.totalDollarMint * (basisPointsDivisor - slippageBasisPoints)) / basisPointsDivisor;

      // Increase maximum inputs by slippage amount
      const maxCollateralIn = (mintResult.collateralNeeded * (basisPointsDivisor + slippageBasisPoints)) / basisPointsDivisor;
      const maxGovernanceIn = (mintResult.governanceNeeded * (basisPointsDivisor + slippageBasisPoints)) / basisPointsDivisor;

      console.log("🔄 Executing mint transaction with params:", {
        collateralIndex,
        dollarAmount: dollarAmount.toString(),
        dollarOutMin: dollarOutMin.toString(),
        maxCollateralIn: maxCollateralIn.toString(),
        maxGovernanceIn: maxGovernanceIn.toString(),
        isForceCollateralOnly,
      });

      try {
        const hash = await this._contractService.mintDollar(
          collateralIndex,
          dollarAmount,
          dollarOutMin, // Minimum acceptable output (with slippage)
          maxCollateralIn, // Maximum collateral to spend (with slippage)
          maxGovernanceIn, // Maximum governance to spend (with slippage)
          isForceCollateralOnly
        );

        this._events.onTransactionSubmitted?.(TransactionOperation.MINT, hash);
        this._events.onTransactionSuccess?.(TransactionOperation.MINT, hash);
        return hash;
      } catch (contractError: unknown) {
        console.error("❌ Mint transaction failed:", contractError);

        const contractErrorMessage = (contractError as Error).message;
        // Check if this is already an enhanced oracle error from ContractService
        if (
          contractErrorMessage?.includes("💡 Oracle Price Feed Issue Detected") ||
          contractErrorMessage?.includes("Oracle keepers will update") ||
          contractErrorMessage?.includes("Alternative actions:")
        ) {
          this._events.onTransactionError?.(TransactionOperation.MINT, contractError as Error);
          throw contractError;
        }

        // Check if this is a raw stale oracle data error
        if (
          contractErrorMessage?.toLowerCase().includes("stale stable/usd data") ||
          (contractErrorMessage?.toLowerCase().includes("stale") && contractErrorMessage?.toLowerCase().includes("data"))
        ) {
          const oracleError = new Error(
            `Price oracle data is outdated. The LUSD price feed needs to be updated by oracle keepers. This usually resolves within a few minutes. Please try again later, or consider using a different collateral type if available.`
          );
          this._events.onTransactionError?.(TransactionOperation.MINT, oracleError);
          throw oracleError;
        }

        // Enhanced error handling with specific messages for non-oracle errors
        const enhancedError = this._enhanceErrorMessage(contractError as Error, "mint");
        this._events.onTransactionError?.(TransactionOperation.MINT, enhancedError);
        throw enhancedError;
      }
    } catch (error) {
      console.error("❌ General mint error:", error);
      // Re-throw if already processed
      throw error;
    }
  }

  /**
   * Execute complete redeem workflow with approval handling
   */
  async executeRedeem(params: RedeemTransactionParams): Promise<string> {
    const { collateralIndex, dollarAmount } = params;

    console.log("ExecuteRedeem called with params:", {
      collateralIndex,
      dollarAmount: dollarAmount.toString(),
    });

    // Validate wallet connection
    try {
      this._walletService.validateConnection();
    } catch (error) {
      console.error("❌ Wallet validation failed:", error);
      throw error;
    }

    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    // Validate transaction parameters
    const validation = validateTransactionParams(dollarAmount, collateralIndex, account);
    if (!validation.isValid) {
      console.error("❌ Parameter validation failed:", validation.error);
      throw new Error(validation.error);
    }

    try {
      this._events.onTransactionStart?.(TransactionOperation.REDEEM);

      // Check if there's a pending redemption to collect first

      const redeemBalance = await this._contractService.getRedeemCollateralBalance(account, collateralIndex);

      if (redeemBalance > 0n) {
        // Collect existing redemption first
        return this.executeCollectRedemption(collateralIndex);
      }

      // Calculate redeem output for slippage protection

      const redeemResult = await this._priceService.calculateRedeemOutput({
        dollarAmount,
        collateralIndex,
      });
      console.log("✅ Redeem calculation result:", {
        collateralRedeemed: redeemResult.collateralRedeemed.toString(),
        governanceRedeemed: redeemResult.governanceRedeemed.toString(),
      });

      // Handle UUSD approval if needed

      await this._handleRedeemApproval(account, dollarAmount);

      // Execute redeem transaction with slippage tolerance
      // Add 0.5% slippage tolerance
      const slippageBasisPoints = 50n; // 0.5%
      const basisPointsDivisor = BASIS_POINTS_DIVISOR;

      // Reduce minimum outputs by slippage amount
      const governanceOutMin = (redeemResult.governanceRedeemed * (basisPointsDivisor - slippageBasisPoints)) / basisPointsDivisor;
      const collateralOutMin = (redeemResult.collateralRedeemed * (basisPointsDivisor - slippageBasisPoints)) / basisPointsDivisor;

      console.log("🔄 Executing redeem transaction with params:", {
        collateralIndex,
        dollarAmount: dollarAmount.toString(),
        governanceOutMin: governanceOutMin.toString(),
        collateralOutMin: collateralOutMin.toString(),
      });

      const hash = await this._contractService.redeemDollar(
        collateralIndex,
        dollarAmount,
        governanceOutMin, // Minimum governance tokens expected (with slippage)
        collateralOutMin // Minimum collateral expected (with slippage)
      );

      this._events.onTransactionSuccess?.(TransactionOperation.REDEEM, hash);
      return hash;
    } catch (error) {
      console.error("❌ General redeem error:", error);

      // Check if this is already an enhanced error from ContractService
      const redeemErrorMessage = (error as Error).message;
      if (
        redeemErrorMessage.includes("Cannot redeem at this time:") ||
        redeemErrorMessage.includes("Redemptions are temporarily disabled") ||
        redeemErrorMessage.includes("Insufficient collateral in the protocol") ||
        redeemErrorMessage.includes("💡 Oracle Price Feed Issue Detected") ||
        redeemErrorMessage.includes("Oracle keepers will update") ||
        redeemErrorMessage.includes("Alternative actions:")
      ) {
        this._events.onTransactionError?.(TransactionOperation.REDEEM, error as Error);
        throw error;
      }

      // Enhanced error handling with specific messages for redeem errors
      const enhancedError = this._enhanceErrorMessage(error as Error, "redeem");
      this._events.onTransactionError?.(TransactionOperation.REDEEM, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Execute collect redemption transaction
   */
  async executeCollectRedemption(collateralIndex: number): Promise<string> {
    // Validate wallet connection
    this._walletService.validateConnection();

    try {
      this._events.onTransactionStart?.(TransactionOperation.COLLECT_REDEMPTION);

      const hash = await this._contractService.collectRedemption(collateralIndex);

      this._events.onTransactionSuccess?.(TransactionOperation.COLLECT_REDEMPTION, hash);
      return hash;
    } catch (error) {
      this._events.onTransactionError?.(TransactionOperation.COLLECT_REDEMPTION, error as Error);
      throw error;
    }
  }

  /**
   * Check if user has pending redemption for any collateral
   */
  async checkForPendingRedemptions(account: Address): Promise<CollateralOption | null> {
    const collaterals = this._priceService.getCollateralOptions();

    for (const collateral of collaterals) {
      const balance = await this._contractService.getRedeemCollateralBalance(account, collateral.index);

      if (balance > 0n) {
        return collateral;
      }
    }

    return null;
  }

  /**
   * Get required approvals for mint operation
   */
  async getMintApprovalStatus(
    collateral: CollateralOption,
    account: Address,
    mintResult: MintPriceResult
  ): Promise<{
    needsCollateralApproval: boolean;
    needsGovernanceApproval: boolean;
    collateralAllowance: bigint;
    governanceAllowance: bigint;
  }> {
    const { collateralAllowance, governanceAllowance } = await this._contractService.checkMintAllowances(
      collateral.address,
      account,
      mintResult.collateralNeeded,
      mintResult.governanceNeeded
    );

    return {
      needsCollateralApproval: mintResult.collateralNeeded > 0n && collateralAllowance < mintResult.collateralNeeded,
      needsGovernanceApproval: mintResult.governanceNeeded > 0n && governanceAllowance < mintResult.governanceNeeded,
      collateralAllowance,
      governanceAllowance,
    };
  }

  /**
   * Get required approval for redeem operation
   */
  async getRedeemApprovalStatus(
    account: Address,
    amount: bigint
  ): Promise<{
    needsApproval: boolean;
    allowance: bigint;
  }> {
    const allowance = await this._contractService.checkRedeemAllowance(account, amount);

    return {
      needsApproval: amount > 0n && allowance < amount,
      allowance,
    };
  }

  /**
   * Handle mint approvals sequentially
   */
  private async _handleMintApprovals(collateral: CollateralOption, account: Address, mintResult: MintPriceResult): Promise<void> {
    const approvalStatus = await this.getMintApprovalStatus(collateral, account, mintResult);

    // Handle collateral approval first
    if (approvalStatus.needsCollateralApproval) {
      this._events.onApprovalNeeded?.(collateral.name);

      await this._contractService.approveToken(collateral.address, ADDRESSES.DIAMOND, maxUint256);

      this._events.onApprovalComplete?.(collateral.name);
    }

    // Then handle governance approval
    if (approvalStatus.needsGovernanceApproval) {
      this._events.onApprovalNeeded?.("UBQ");

      await this._contractService.approveToken(ADDRESSES.GOVERNANCE, ADDRESSES.DIAMOND, maxUint256);

      this._events.onApprovalComplete?.("UBQ");
    }
  }

  /**
   * Handle redeem approval
   */
  private async _handleRedeemApproval(account: Address, amount: bigint): Promise<void> {
    const approvalStatus = await this.getRedeemApprovalStatus(account, amount);

    if (approvalStatus.needsApproval) {
      this._events.onApprovalNeeded?.("UUSD");

      await this._contractService.approveToken(ADDRESSES.DOLLAR, ADDRESSES.DIAMOND, maxUint256);

      this._events.onApprovalComplete?.("UUSD");
    }
  }

  /**
   * Enhance error messages for better user experience
   */
  private _enhanceErrorMessage(error: Error, _operation: string): Error {
    const errorMessage = error.message.toLowerCase();

    // User rejection - keep user-friendly message
    if (errorMessage.includes("rejected") || errorMessage.includes("denied") || errorMessage.includes("user rejected")) {
      return new Error("Transaction was cancelled by user.");
    }

    // Gas-related errors - keep helpful guidance for gas issues
    if (
      (errorMessage.includes("insufficient gas") ||
        errorMessage.includes("out of gas") ||
        errorMessage.includes("gas required exceeds") ||
        errorMessage.includes("gas limit")) &&
      !errorMessage.includes("rejected") &&
      !errorMessage.includes("denied")
    ) {
      return new Error("Transaction failed due to insufficient gas. This may be caused by high network congestion. Please try again with higher gas settings.");
    }

    // For all other errors, return the raw error message
    return error;
  }
}
