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
    // reason: string;
    isEnabled: boolean;
    disabledReason?: string;
    // UBQ-related information for mixed operations
    ubqAmount?: bigint; // Amount of UBQ for mixed redemptions
    isUbqOperation?: boolean; // Whether this involves UBQ
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
    async getOptimalDepositRoute(lusdAmount: bigint, isForceCollateralOnly: boolean = false): Promise<OptimalRouteResult> {
        try {
            // Get current market conditions with timeout protection
            const marketConditionsPromise = Promise.all([
                this.contractService.getLUSDOraclePrice(),
                this.curvePriceService.getUUSDMarketPrice(this.PEG_PRICE)
            ]);

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Market conditions timeout')), 10000);
            });

            const [lusdPrice, marketPrice] = await Promise.race([marketConditionsPromise, timeoutPromise]) as [bigint, bigint];

            const dollarAmount = parseEther(formatUnits(lusdAmount, 18));

            // Calculate both mint options with timeout protection
            const mixedMintPromise = this.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly: false
            });

            const collateralOnlyMintPromise = this.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly: true
            });

            const mintTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Mint calculation timeout')), 10000);
            });

            const [mixedMintResult, collateralOnlyMintResult] = await Promise.race([
                Promise.all([mixedMintPromise, collateralOnlyMintPromise]),
                mintTimeoutPromise
            ]) as [any, any];

            // Calculate swap output (LUSD → UUSD via Curve)
            const swapOutputUUSD = await this.getSwapOutput(lusdAmount, 'LUSD', 'UUSD');

            // Determine optimal route based on user preference and market conditions
            let routeType: RouteType;
            let expectedOutput: bigint;
            // let reason: string;
            let isEnabled = true;
            let disabledReason: string | undefined;

            if (!mixedMintResult.isMintingAllowed) {
                // Minting disabled, use swap
                routeType = 'swap';
                expectedOutput = swapOutputUUSD;
                // reason = 'Minting disabled due to price conditions. Using Curve swap.';
            } else if (isForceCollateralOnly) {
                // User explicitly chose LUSD-only mode - always use collateral-only mint
                routeType = 'mint';
                expectedOutput = collateralOnlyMintResult.totalDollarMint;
                // reason = 'LUSD-only mode: Using 100% LUSD (no UBQ discount).';
            } else {
                // User allows UBQ discount - always use mixed mint to show the discount
                routeType = 'mint';
                expectedOutput = mixedMintResult.totalDollarMint;

                // Calculate discount percentage: ((mixed - collateralOnly) / collateralOnly) * 100
                const mixedOutput = BigInt(mixedMintResult.totalDollarMint);
                const collateralOnlyOutput = BigInt(collateralOnlyMintResult.totalDollarMint);
                const discountBigInt = (mixedOutput - collateralOnlyOutput) * 10000n / collateralOnlyOutput;
                const discount = Number(discountBigInt) / 100;
                // reason = `Minting with 95% LUSD + 5% UBQ.`;
            }

            // Calculate alternative output for savings comparison
            const allOutputs = [swapOutputUUSD, mixedMintResult.totalDollarMint, collateralOnlyMintResult.totalDollarMint];
            const alternativeOutput = allOutputs.filter(output => output !== expectedOutput).reduce((max, current) => current > max ? current : max, 0n);
            const savings = this.calculateSavings(expectedOutput, alternativeOutput);

            return {
                routeType,
                expectedOutput,
                inputAmount: lusdAmount,
                direction: 'deposit',
                marketPrice,
                pegPrice: this.PEG_PRICE,
                savings,
                // reason,
                isEnabled,
                disabledReason,
                // Add UBQ information for mixed minting
                ubqAmount: (routeType === 'mint' && !isForceCollateralOnly) ? mixedMintResult.governanceNeeded : undefined,
                isUbqOperation: (routeType === 'mint' && !isForceCollateralOnly)
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
                    // reason: 'Using Curve swap (fallback due to calculation error).',
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
     * NOTE: For withdrawing, we should NEVER return 'mint' as a route type
     */
    async getOptimalWithdrawRoute(uusdAmount: bigint, isLusdOnlyRedemption: boolean = false): Promise<OptimalRouteResult> {
        console.log('🔍 Calculating optimal withdraw route for', formatEther(uusdAmount), 'UUSD');

        try {
            console.log('📝 Step 1: Getting market conditions...');
            // Get current market conditions
            let lusdPrice: bigint;
            let marketPrice: bigint;

            try {
                console.log('📝 Step 1a: Getting LUSD oracle price...');
                lusdPrice = await this.contractService.getLUSDOraclePrice();
                console.log('📝 Step 1b: Getting UUSD market price...');
                marketPrice = await this.curvePriceService.getUUSDMarketPrice(this.PEG_PRICE);
            } catch (error) {
                console.error('❌ Error getting market conditions:', error);
                throw new Error(`Failed to get market conditions: ${error}`);
            }

            console.log('📊 Market conditions:', {
                lusdPrice: formatUnits(lusdPrice, 6),
                marketPrice: formatUnits(marketPrice, 6),
                pegPrice: formatUnits(this.PEG_PRICE, 6)
            });

            console.log('📝 Step 2: Calculating redeem output...');

            // Calculate redeem output with oracle error handling
            let redeemResult;
            try {
                console.log('📝 Step 2a: Calling calculateRedeemOutput...');

                // For LUSD-only redemption, we can skip governance price entirely
                const skipGovernancePrice = isLusdOnlyRedemption;

                // Add timeout to prevent hanging
                const redeemPromise = this.priceService.calculateRedeemOutput(
                    {
                        dollarAmount: uusdAmount,
                        collateralIndex: LUSD_COLLATERAL.index
                    },
                    skipGovernancePrice
                );

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Redeem calculation timeout')), 10000);
                });

                redeemResult = await Promise.race([redeemPromise, timeoutPromise]) as any;
                console.log('📝 Step 2b: Redeem calculation successful');
            } catch (error) {
                console.error('❌ Error calculating redeem output:', error);

                // Check if it's an oracle error and we can fall back to swap-only
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('Stale data') || errorMessage.includes('oracle')) {
                    console.log('🔮 Oracle stale, falling back to swap route for calculations');

                    // Calculate swap output and return swap-only result
                    try {
                        const swapOutputLUSD = await this.getSwapOutput(uusdAmount, 'UUSD', 'LUSD');
                        console.log('🔄 Using swap fallback due to oracle issues');

                        return {
                            routeType: 'swap' as const,
                            expectedOutput: swapOutputLUSD,
                            inputAmount: uusdAmount,
                            direction: 'withdraw' as const,
                            marketPrice: this.PEG_PRICE, // Fallback price
                            pegPrice: this.PEG_PRICE,
                            savings: { amount: 0n, percentage: 0 },
                            isEnabled: true,
                            disabledReason: 'Oracle data temporarily unavailable - using Curve swap'
                        };
                    } catch (swapError) {
                        console.error('❌ Swap fallback also failed:', swapError);
                        throw new Error(`Both redeem and swap calculations failed: ${error}`);
                    }
                }

                throw new Error(`Failed to calculate redeem output: ${error}`);
            }

            // Calculate swap output (UUSD → LUSD via Curve)
            let swapOutputLUSD;
            try {
                console.log('📝 Step 2c: Calculating swap output...');
                swapOutputLUSD = await this.getSwapOutput(uusdAmount, 'UUSD', 'LUSD');
                console.log('📝 Step 2d: Swap calculation successful');
            } catch (error) {
                console.error('❌ Error calculating swap output:', error);
                throw new Error(`Failed to calculate swap output: ${error}`);
            }

            console.log('💰 Output comparison:', {
                redeemLUSD: formatEther(redeemResult.collateralRedeemed),
                redeemUBQ: formatEther(redeemResult.governanceRedeemed),
                swapLUSD: formatEther(swapOutputLUSD),
                isRedeemingAllowed: redeemResult.isRedeemingAllowed,
                isLusdOnlyRedemption
            });

            // Determine optimal route - ONLY redeem or swap for withdrawals
            let routeType: RouteType;
            let expectedOutput: bigint;
            // let reason: string;
            let isEnabled = true;
            let disabledReason: string | undefined;

            if (!redeemResult.isRedeemingAllowed) {
                // Redeeming disabled, use swap
                routeType = 'swap';
                expectedOutput = swapOutputLUSD;
                // reason = 'Redeeming disabled due to price conditions. Using Curve swap.';
                console.log('🔄 Route: swap (redeeming disabled)');
            } else if (isLusdOnlyRedemption) {
                // User explicitly chose LUSD-only redemption
                // Compare swap vs redeem for pure LUSD output
                if (swapOutputLUSD > redeemResult.collateralRedeemed) {
                    routeType = 'swap';
                    expectedOutput = swapOutputLUSD;
                    // reason = 'LUSD-only mode: Curve swap provides more LUSD than redemption.';
                    console.log('🔄 Route: swap (LUSD-only, swap better)');
                } else {
                    routeType = 'redeem';
                    expectedOutput = redeemResult.collateralRedeemed;
                    // reason = 'LUSD-only mode: Redeeming gives better LUSD rate (100% LUSD).';
                    console.log('🔄 Route: redeem (LUSD-only, redeem better)');
                }
            } else {
                // User allows mixed redemption (95% LUSD + 5% UBQ) - PRIORITIZE REDEEM TO GET UBQ
                // When user wants mixed redemption, we should prioritize redeem to give them the UBQ bonus
                routeType = 'redeem';
                expectedOutput = redeemResult.collateralRedeemed;
                // reason = `Mixed redemption: Get ${formatEther(redeemResult.collateralRedeemed)} LUSD + ${formatEther(redeemResult.governanceRedeemed)} UBQ bonus!`;
                console.log('🔄 Route: redeem (mixed redemption prioritized for UBQ bonus)');
            }


            // Calculate alternative output for savings comparison
            const alternativeOutput = routeType === 'redeem' ? swapOutputLUSD : redeemResult.collateralRedeemed;
            const savings = this.calculateSavings(expectedOutput, alternativeOutput);

            const result = {
                routeType,
                expectedOutput,
                inputAmount: uusdAmount,
                direction: 'withdraw' as const,
                marketPrice,
                pegPrice: this.PEG_PRICE,
                savings,
                // reason,
                isEnabled,
                disabledReason,
                // Add UBQ information for mixed redemptions
                ubqAmount: (routeType === 'redeem' && !isLusdOnlyRedemption) ? redeemResult.governanceRedeemed : undefined,
                isUbqOperation: (routeType === 'redeem' && !isLusdOnlyRedemption)
            };

            console.log('✅ Final withdraw route:', result);
            return result;

        } catch (error) {
            console.error('Error calculating optimal withdraw route:', error);

            // Fallback to swap if calculations fail
            try {
                const swapOutput = await this.getSwapOutput(uusdAmount, 'UUSD', 'LUSD');
                console.log('🔄 Using fallback swap route');
                return {
                    routeType: 'swap',
                    expectedOutput: swapOutput,
                    inputAmount: uusdAmount,
                    direction: 'withdraw',
                    marketPrice: this.PEG_PRICE,
                    pegPrice: this.PEG_PRICE,
                    savings: { amount: 0n, percentage: 0 },
                    // reason: 'Using Curve swap (fallback due to calculation error).',
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

        // const savingsText = result.savings.percentage > 0
            // ? ` (Save ${result.savings.percentage.toFixed(2)}%)`
            // : '';

        return `${direction}: ${actionText} ${inputAmount} ${inputToken} → ${outputAmount} ${outputToken}`;
    }
}
