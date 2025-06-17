import type { Address } from 'viem';

export interface CollateralOption {
    index: number;
    name: string;
    address: Address;
    mintingFee: number;
    redemptionFee: number;
    missingDecimals: number;
    isEnabled?: boolean;
    isMintPaused?: boolean;
}

export interface MintOutput {
    totalDollarMint: bigint;
    collateralNeeded: bigint;
    governanceNeeded: bigint;
}

export interface RedeemOutput {
    collateralRedeemed: bigint;
    governanceRedeemed: bigint;
}

export interface ContractAddresses {
    readonly DIAMOND: Address;
    readonly DOLLAR: Address;
    readonly GOVERNANCE: Address;
    readonly PERMIT2: Address;
}