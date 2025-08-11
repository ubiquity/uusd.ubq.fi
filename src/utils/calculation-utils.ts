import { parseUnits } from 'viem';
import type { Address } from 'viem';

/**
 * Interface for collateral information needed in calculations
 */
export interface CollateralInfo {
    index: number;
    name: string;
    address: Address;
    mintingFee: number;
    redemptionFee: number;
    missingDecimals: number;
}

/**
 * Interface for mint calculation inputs
 */
export interface MintCalculationInput {
    dollarAmount: bigint;
    collateralRatio: bigint;
    governancePrice: bigint;
    collateralAmount: bigint; // Amount from getDollarInCollateral
    mintingFee: number;
    isForceCollateralOnly: boolean;
}

/**
 * Interface for mint calculation output
 */
export interface MintCalculationOutput {
    totalDollarMint: bigint;
    collateralNeeded: bigint;
    governanceNeeded: bigint;
}

/**
 * Interface for redeem calculation inputs
 */
export interface RedeemCalculationInput {
    dollarAmount: bigint;
    collateralRatio: bigint;
    governancePrice: bigint;
    collateralAmount: bigint; // Amount from getDollarInCollateral
    redemptionFee: number;
}

/**
 * Interface for redeem calculation output
 */
export interface RedeemCalculationOutput {
    collateralRedeemed: bigint;
    governanceRedeemed: bigint;
}

/**
 * Pure function to calculate mint output based on collateral ratio and amounts
 */
export function calculateMintAmounts(input: MintCalculationInput): MintCalculationOutput {
    const poolPricePrecision = 1000000n;
    let collateralNeeded: bigint;
    let governanceNeeded: bigint;

    if (input.isForceCollateralOnly || input.collateralRatio >= poolPricePrecision) {
        // 100% collateral mode
        collateralNeeded = input.collateralAmount;
        governanceNeeded = 0n;
    } else if (input.collateralRatio === 0n) {
        // 100% governance mode
        collateralNeeded = 0n;
        governanceNeeded = (input.dollarAmount * poolPricePrecision) / input.governancePrice;
    } else {
        // Mixed mode: split between collateral and governance
        const dollarForCollateral = (input.dollarAmount * input.collateralRatio) / poolPricePrecision;
        const dollarForGovernance = input.dollarAmount - dollarForCollateral;

        collateralNeeded = (input.collateralAmount * input.collateralRatio) / poolPricePrecision;
        governanceNeeded = (dollarForGovernance * poolPricePrecision) / input.governancePrice;
    }

    // Check if governance collateral is being used (indicates mixed mode with UBQ)
    const hasGovernanceCollateral = governanceNeeded > 0n;
    const totalDollarMint = calculateMintFeeOutputWithBonus(input.dollarAmount, input.mintingFee, hasGovernanceCollateral);

    return { totalDollarMint, collateralNeeded, governanceNeeded };
}

/**
 * Pure function to calculate redeem output based on collateral ratio and amounts
 */
export function calculateRedeemAmounts(input: RedeemCalculationInput): RedeemCalculationOutput {
    const poolPricePrecision = 1000000n;

    let collateralRedeemed: bigint;
    let governanceRedeemed: bigint;

    if (input.collateralRatio >= poolPricePrecision) {
        // 100% collateral mode
        const dollarAfterFee = calculateRedeemFeeOutput(input.dollarAmount, input.redemptionFee);
        collateralRedeemed = input.collateralAmount;
        governanceRedeemed = 0n;
    } else if (input.collateralRatio === 0n) {
        // 100% governance mode - apply bonus since only UBQ is redeemed
        const dollarAfterFee = calculateRedeemFeeOutputWithBonus(input.dollarAmount, input.redemptionFee, true);
        collateralRedeemed = 0n;
        governanceRedeemed = (dollarAfterFee * poolPricePrecision) / input.governancePrice;
    } else {
        // Mixed mode - apply bonus since UBQ is part of redemption
        const dollarAfterFee = calculateRedeemFeeOutputWithBonus(input.dollarAmount, input.redemptionFee, true);
        collateralRedeemed = (input.collateralAmount * input.collateralRatio) / poolPricePrecision;
        governanceRedeemed = (dollarAfterFee * (poolPricePrecision - input.collateralRatio)) / input.governancePrice;
    }

    return { collateralRedeemed, governanceRedeemed };
}

/**
 * Pure function to calculate mint fee output
 */
export function calculateMintFeeOutput(dollarAmount: bigint, mintingFeePercent: number): bigint {
    const poolPricePrecision = 1000000n;
    const mintingFee = parseUnits(mintingFeePercent.toString(), 6);
    return (dollarAmount * (poolPricePrecision - mintingFee)) / poolPricePrecision;
}

/**
 * Pure function to calculate mint fee output with protocol supporter bonus
 */
export function calculateMintFeeOutputWithBonus(dollarAmount: bigint, mintingFeePercent: number, hasGovernanceCollateral: boolean): bigint {
    const poolPricePrecision = 1000000n;
    const mintingFee = parseUnits(mintingFeePercent.toString(), 6);
    let feeAdjustedAmount = (dollarAmount * (poolPricePrecision - mintingFee)) / poolPricePrecision;

    // Apply 5% protocol supporter bonus if using governance (UBQ) collateral
    if (hasGovernanceCollateral) {
        const protocolSupporterBonus = 50000n; // 5% in basis points (5 * 10000)
        feeAdjustedAmount = (feeAdjustedAmount * (poolPricePrecision + protocolSupporterBonus)) / poolPricePrecision;
    }

    return feeAdjustedAmount;
}

/**
 * Pure function to calculate redeem fee output
 */
export function calculateRedeemFeeOutput(dollarAmount: bigint, redemptionFeePercent: number): bigint {
    const poolPricePrecision = 1000000n;
    const redemptionFee = parseUnits(redemptionFeePercent.toString(), 6);
    return (dollarAmount * (poolPricePrecision - redemptionFee)) / poolPricePrecision;
}

/**
 * Pure function to calculate redeem fee output with protocol supporter bonus
 */
export function calculateRedeemFeeOutputWithBonus(dollarAmount: bigint, redemptionFeePercent: number, hasGovernanceRedemption: boolean): bigint {
    const poolPricePrecision = 1000000n;
    const redemptionFee = parseUnits(redemptionFeePercent.toString(), 6);
    let feeAdjustedAmount = (dollarAmount * (poolPricePrecision - redemptionFee)) / poolPricePrecision;

    // Apply 5% protocol supporter bonus if receiving governance (UBQ) tokens
    if (hasGovernanceRedemption) {
        const protocolSupporterBonus = 50000n; // 5% in basis points (5 * 10000)
        feeAdjustedAmount = (feeAdjustedAmount * (poolPricePrecision + protocolSupporterBonus)) / poolPricePrecision;
    }

    return feeAdjustedAmount;
}

/**
 * Pure function to calculate dollar amount for collateral in mixed mode
 */
export function calculateDollarForCollateral(dollarAmount: bigint, collateralRatio: bigint): bigint {
    const poolPricePrecision = 1000000n;
    return (dollarAmount * collateralRatio) / poolPricePrecision;
}

/**
 * Pure function to calculate dollar amount for governance in mixed mode
 */
export function calculateDollarForGovernance(dollarAmount: bigint, collateralRatio: bigint): bigint {
    const dollarForCollateral = calculateDollarForCollateral(dollarAmount, collateralRatio);
    return dollarAmount - dollarForCollateral;
}
