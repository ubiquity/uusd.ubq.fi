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

        collateralNeeded = input.collateralAmount;
        governanceNeeded = (dollarForGovernance * poolPricePrecision) / input.governancePrice;
    }

    const totalDollarMint = calculateMintFeeOutput(input.dollarAmount, input.mintingFee);

    return { totalDollarMint, collateralNeeded, governanceNeeded };
}

/**
 * Pure function to calculate redeem output based on collateral ratio and amounts
 */
export function calculateRedeemAmounts(input: RedeemCalculationInput): RedeemCalculationOutput {
    const poolPricePrecision = 1000000n;
    const dollarAfterFee = calculateRedeemFeeOutput(input.dollarAmount, input.redemptionFee);

    let collateralRedeemed: bigint;
    let governanceRedeemed: bigint;

    if (input.collateralRatio >= poolPricePrecision) {
        // 100% collateral mode
        collateralRedeemed = input.collateralAmount;
        governanceRedeemed = 0n;
    } else if (input.collateralRatio === 0n) {
        // 100% governance mode
        collateralRedeemed = 0n;
        governanceRedeemed = (dollarAfterFee * poolPricePrecision) / input.governancePrice;
    } else {
        // Mixed mode
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
 * Pure function to calculate redeem fee output
 */
export function calculateRedeemFeeOutput(dollarAmount: bigint, redemptionFeePercent: number): bigint {
    const poolPricePrecision = 1000000n;
    const redemptionFee = parseUnits(redemptionFeePercent.toString(), 6);
    return (dollarAmount * (poolPricePrecision - redemptionFee)) / poolPricePrecision;
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