import { formatEther, formatUnits, parseEther, type Address } from 'viem';
import type { PriceService } from './price-service.ts';
import type { CurvePriceService } from './curve-price-service.ts';
import type { ContractService } from './contract-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';

/**
 * Route types for optimal execution
 */
export type RouteType = 'mint' | 'redeem' | 'swap';

/**
 * Direction of the exchange
 */
export type ExchangeDirection = 'deposit' | 'withdraw';

/**
 * Result of optimal route calculation
 */
export interface OptimalRouteResult {
    routeType: RouteType;
    expectedOutput: bigint;
    inputAmount: bigint;
    direction: ExchangeDirection;
    marketPrice: bigint;
    pegPrice: bigint; // Always 1.000000 (6 decimals)
    savings: {
        amount: bigint;
        percentage: number;
    };
    reason: string;
    isEnabled: boolean;
    disabledReason?: string;
}

/**
 * Service to determine optimal route for LUSD ↔ UUSD exchanges
 */
export class OptimalRouteService {
    private priceService: PriceService;
    private curvePriceService: CurvePriceService;
    private contractService: ContractService;
    private readonly PEG_PRICE = 1000000n; // $1.00 with 6 decimals

    constructor(
        priceService: PriceService,
        curvePriceService: CurvePriceService,
        contractService: ContractService
    ) {
        this.priceService = priceService;
        this.curvePriceService = curvePriceService;
        this.contractService = contractService;
    }

    /**
     * Get optimal route for depositing LUSD to get UUSD
     * Compares: mint vs swap
     */
    async getOptimalDepositRoute(lusdAmount: bigint): Promise<OptimalRouteResult> {
        try {
            // Get current market conditions
            const [lusdPrice, marketPrice] = await Promise.all([
                this.contractService.getLUSDOraclePrice(),
                this.curvePriceService.getUUSDMarketPrice(this.PEG_PRICE)
            ]);

            const dollarAmount = parseEther(formatUnits(lusdAmount, 18));

            // Calculate mint output
            const mintResult = await this.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly: false
            });

            // Calculate swap output (LUSD → UUSD via Curve)
            const swapOutputUUSD = await this.getSwapOutput(lusdAmount, 'LUSD', 'UUSD');

            // Determine optimal route
            let routeType: RouteType;
            let expectedOutput: bigint;
            let reason: string;
            let isEnabled = true;
            let disabledReason: string | undefined;

            if (!mintResult.isMintingAllowed) {
                // Minting disabled, use swap
                routeType = 'swap';
                expectedOutput = swapOutputUUSD;
                reason = 'Minting disabled due to price conditions. Using Curve swap.';
            } else if (marketPrice < this.PEG_PRICE) {
                // UUSD trading below peg - mint is better (1:1 ratio)
                routeType = 'mint';
                expectedOutput = mintResult.totalDollarMint;
                reason = `UUSD below peg ($${formatUnits(marketPrice, 6)}). Minting gives better rate.`;
            } else {
                // UUSD trading above peg - compare outputs
                if (swapOutputUUSD > mintResult.totalDollarMint) {
                    routeType = 'swap';
                    expectedOutput = swapOutputUUSD;
                    reason = `UUSD above peg ($${formatUnits(marketPrice, 6)}). Curve swap gives more UUSD.`;
                } else {
                    routeType = 'mint';
                    expectedOutput = mintResult.totalDollarMint;
                    reason = 'Minting provides better rate than swap.';
                }
            }

            // Calculate alternative output for savings comparison
            const alternativeOutput = routeType === 'mint' ? swapOutputUUSD : mintResult.totalDollarMint;
            const savings = this.calculateSavings(expectedOutput, alternativeOutput);

            return {
                routeType,
                expectedOutput,
                inputAmount: lusdAmount,
                direction: 'deposit',
                marketPrice,
                pegPrice: this.PEG_PRICE,
                savings,
                reason,
                isEnabled,
                disabledReason
            };

        } catch (error) {
            console.error('Error calculating optimal deposit route:', error);

            // Fallback to swap if calculations fail
            try {
                const swapOutput = await this.getSwapOutput(lusdAmount, 'LUSD', 'UUSD');
                return {
                    routeType: 'swap',
                    expectedOutput: swapOutput,
                    inputAmount: lusdAmount,
                    direction: 'deposit',
                    marketPrice: this.PEG_PRICE,
                    pegPrice: this.PEG_PRICE,
                    savings: { amount: 0n, percentage: 0 },
                    reason: 'Using Curve swap (fallback due to calculation error).',
                    isEnabled: true
                };
            } catch (swapError) {
                throw new Error(`Failed to calculate optimal route: ${error}`);
            }
        }
    }

    /**
     * Get optimal route for withdrawing UUSD to get LUSD
     * Compares: redeem vs swap
     */
    async getOptimalWithdrawRoute(uusdAmount: bigint): Promise<OptimalRouteResult> {
        try {
            // Get current market conditions
            const [lusdPrice, marketPrice] = await Promise.all([
                this.contractService.getLUSDOraclePrice(),
                this.curvePriceService.getUUSDMarketPrice(this.PEG_PRICE)
            ]);

            // Calculate redeem output
            const redeemResult = await this.priceService.calculateRedeemOutput({
                dollarAmount: uusdAmount,
                collateralIndex: LUSD_COLLATERAL.index
            });

            // Calculate swap output (UUSD → LUSD via Curve)
            const swapOutputLUSD = await this.getSwapOutput(uusdAmount, 'UUSD', 'LUSD');

            // Determine optimal route
            let routeType: RouteType;
            let expectedOutput: bigint;
            let reason: string;
            let isEnabled = true;
            let disabledReason: string | undefined;

            if (!redeemResult.isRedeemingAllowed) {
                // Redeeming disabled, use swap
                routeType = 'swap';
                expectedOutput = swapOutputLUSD;
                reason = 'Redeeming disabled due to price conditions. Using Curve swap.';
            } else if (marketPrice > this.PEG_PRICE) {
                // UUSD trading above peg - redeem is better (1:1 ratio)
                routeType = 'redeem';
                expectedOutput = redeemResult.collateralRedeemed;
                reason = `UUSD above peg ($${formatUnits(marketPrice, 6)}). Redeeming gives better rate.`;
            } else {
                // UUSD trading below peg - compare outputs
                if (swapOutputLUSD > redeemResult.collateralRedeemed) {
                    routeType = 'swap';
                    expectedOutput = swapOutputLUSD;
                    reason = `UUSD below peg ($${formatUnits(marketPrice, 6)}). Curve swap gives more LUSD.`;
                } else {
                    routeType = 'redeem';
                    expectedOutput = redeemResult.collateralRedeemed;
                    reason = 'Redeeming provides better rate than swap.';
                }
            }

            // Calculate alternative output for savings comparison
            const alternativeOutput = routeType === 'redeem' ? swapOutputLUSD : redeemResult.collateralRedeemed;
            const savings = this.calculateSavings(expectedOutput, alternativeOutput);

            return {
                routeType,
                expectedOutput,
                inputAmount: uusdAmount,
                direction: 'withdraw',
                marketPrice,
                pegPrice: this.PEG_PRICE,
                savings,
                reason,
                isEnabled,
                disabledReason
            };

        } catch (error) {
            console.error('Error calculating optimal withdraw route:', error);

            // Fallback to swap if calculations fail
            try {
                const swapOutput = await this.getSwapOutput(uusdAmount, 'UUSD', 'LUSD');
                return {
                    routeType: 'swap',
                    expectedOutput: swapOutput,
                    inputAmount: uusdAmount,
                    direction: 'withdraw',
                    marketPrice: this.PEG_PRICE,
                    pegPrice: this.PEG_PRICE,
                    savings: { amount: 0n, percentage: 0 },
                    reason: 'Using Curve swap (fallback due to calculation error).',
                    isEnabled: true
                };
            } catch (swapError) {
                throw new Error(`Failed to calculate optimal route: ${error}`);
            }
        }
    }

    /**
     * Get swap output from Curve pool
     */
    private async getSwapOutput(amount: bigint, fromToken: 'LUSD' | 'UUSD', toToken: 'LUSD' | 'UUSD'): Promise<bigint> {
        if (fromToken === toToken) {
            throw new Error('Cannot swap same token');
        }

        if (fromToken === 'LUSD' && toToken === 'UUSD') {
            // For LUSD → UUSD, we need to calculate based on the amount
            // Since CurvePriceService.getUUSDMarketPrice expects LUSD price and returns UUSD price per unit,
            // we need to simulate the actual swap amount
            const publicClient = this.curvePriceService['walletService'].getPublicClient();
            return await publicClient.readContract({
                address: '0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f',
                abi: [
                    {
                        name: 'get_dy',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [
                            { name: 'i', type: 'int128' },
                            { name: 'j', type: 'int128' },
                            { name: 'dx', type: 'uint256' }
                        ],
                        outputs: [{ type: 'uint256' }]
                    }
                ],
                functionName: 'get_dy',
                args: [0n, 1n, amount] // LUSD index 0, UUSD index 1
            }) as bigint;
        } else if (fromToken === 'UUSD' && toToken === 'LUSD') {
            // Use existing method for UUSD → LUSD
            return this.curvePriceService.getLUSDForUUSD(amount);
        } else {
            throw new Error(`Unsupported swap pair: ${fromToken} → ${toToken}`);
        }
    }

    /**
     * Calculate savings between two options
     */
    private calculateSavings(optimalOutput: bigint, alternativeOutput: bigint): { amount: bigint; percentage: number } {
        if (alternativeOutput === 0n) {
            return { amount: 0n, percentage: 0 };
        }

        const savingsAmount = optimalOutput > alternativeOutput ? optimalOutput - alternativeOutput : 0n;
        const savingsPercentage = savingsAmount > 0n
            ? Number((savingsAmount * 10000n) / alternativeOutput) / 100 // Convert to percentage with 2 decimals
            : 0;

        return {
            amount: savingsAmount,
            percentage: savingsPercentage
        };
    }

    /**
     * Format route result for display
     */
    formatRouteDisplay(result: OptimalRouteResult): string {
        const direction = result.direction === 'deposit' ? 'Deposit' : 'Withdraw';
        const inputToken = result.direction === 'deposit' ? 'LUSD' : 'UUSD';
        const outputToken = result.direction === 'deposit' ? 'UUSD' : 'LUSD';

        const inputAmount = formatEther(result.inputAmount);
        const outputAmount = formatEther(result.expectedOutput);

        let actionText = '';
        switch (result.routeType) {
            case 'mint':
                actionText = 'Minting';
                break;
            case 'redeem':
                actionText = 'Redeeming';
                break;
            case 'swap':
                actionText = 'Swapping via Curve';
                break;
        }

        const savingsText = result.savings.percentage > 0
            ? ` (Save ${result.savings.percentage.toFixed(2)}%)`
            : '';

        return `${direction}: ${actionText} ${inputAmount} ${inputToken} → ${outputAmount} ${outputToken}${savingsText}`;
    }
}
