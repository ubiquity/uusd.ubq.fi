import { formatEther, formatUnits, type Address } from 'viem';
import type { CollateralInfo } from './calculation-utils.ts';

/**
 * Interface for formatted mint output display
 */
export interface FormattedMintOutput {
    collateralNeeded: string;
    ubqNeeded: string;
    mintingFee: string;
    totalMinted: string;
}

/**
 * Interface for formatted redeem output display
 */
export interface FormattedRedeemOutput {
    collateralRedeemed: string;
    ubqRedeemed: string;
    redemptionFee: string;
}

/**
 * Pure function to format wallet address for display
 * Truncates address to show first 6 and last 4 characters
 */
export function formatAddress(address: Address): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Pure function to format token amount with proper decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
}

/**
 * Pure function to format Ether amount
 */
export function formatEtherAmount(amount: bigint): string {
    return formatEther(amount);
}

/**
 * Pure function to format collateral amount with missing decimals adjustment
 */
export function formatCollateralAmount(amount: bigint, missingDecimals: number): string {
    return formatUnits(amount, 18 - missingDecimals);
}

/**
 * Pure function to format percentage
 */
export function formatPercentage(percentage: number): string {
    return `${percentage}%`;
}

/**
 * Pure function to format mint output for display
 */
export function formatMintOutput(
    collateralNeeded: bigint,
    governanceNeeded: bigint,
    totalMinted: bigint,
    collateral: CollateralInfo
): FormattedMintOutput {
    return {
        collateralNeeded: `${formatCollateralAmount(collateralNeeded, collateral.missingDecimals)} ${collateral.name}`,
        ubqNeeded: `${formatEtherAmount(governanceNeeded)} UBQ`,
        mintingFee: formatPercentage(collateral.mintingFee),
        totalMinted: `${formatEtherAmount(totalMinted)} UUSD`
    };
}

/**
 * Pure function to format redeem output for display
 */
export function formatRedeemOutput(
    collateralRedeemed: bigint,
    governanceRedeemed: bigint,
    collateral: CollateralInfo
): FormattedRedeemOutput {
    return {
        collateralRedeemed: `${formatCollateralAmount(collateralRedeemed, collateral.missingDecimals)} ${collateral.name}`,
        ubqRedeemed: `${formatEtherAmount(governanceRedeemed)} UBQ`,
        redemptionFee: formatPercentage(collateral.redemptionFee * 100)
    };
}

/**
 * Pure function to format button text based on approval state
 */
export function formatApprovalButtonText(
    collateralNeeded: bigint,
    governanceNeeded: bigint,
    collateralAllowance: bigint,
    governanceAllowance: bigint,
    collateralName: string
): string {
    if (collateralNeeded > 0n && collateralAllowance < collateralNeeded) {
        return `Approve ${collateralName}`;
    }
    if (governanceNeeded > 0n && governanceAllowance < governanceNeeded) {
        return 'Approve UBQ';
    }
    return 'Mint UUSD';
}

/**
 * Pure function to format redeem button text based on state
 */
export function formatRedeemButtonText(
    amount: bigint,
    allowance: bigint,
    hasPendingRedemption: boolean
): string {
    if (hasPendingRedemption) {
        return 'Collect Redemption';
    }
    if (amount > 0n && allowance < amount) {
        return 'Approve UUSD';
    }
    return 'Redeem UUSD';
}

/**
 * Pure function to format loading button text
 */
export function formatLoadingButtonText(action: string): string {
    return `${action}...<span class="loading"></span>`;
}