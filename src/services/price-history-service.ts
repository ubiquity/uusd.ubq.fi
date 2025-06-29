import { type Address, type PublicClient, type Log, parseEther } from 'viem';
import type { WalletService } from './wallet-service.ts';

/**
 * Historical price data point
 */
export interface PriceDataPoint {
    timestamp: number;
    price: bigint; // Price in 6 decimal precision (1000000 = $1.00)
    blockNumber: bigint;
}

/**
 * Configuration for price history queries
 */
export interface PriceHistoryConfig {
    maxDataPoints: number;
    timeRangeHours: number;
    sampleIntervalMinutes: number;
}

/**
 * Curve Pool TokenExchange event structure
 */
interface TokenExchangeEvent {
    buyer: Address;
    sold_id: bigint;
    tokens_sold: bigint;
    bought_id: bigint;
    tokens_bought: bigint;
}

/**
 * Service for reconstructing UUSD price history from blockchain data
 */
export class PriceHistoryService {
    private walletService: WalletService;
    private readonly CURVE_POOL_ADDRESS: Address = '0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f';
    private readonly LUSD_INDEX = 0n;
    private readonly UUSD_INDEX = 1n;

    // Curve pool TokenExchange event signature
    private readonly TOKEN_EXCHANGE_TOPIC = '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140';

    private cache: Map<string, PriceDataPoint[]> = new Map();
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    constructor(walletService: WalletService) {
        this.walletService = walletService;
    }

    /**
     * Get UUSD price history for the specified time range
     */
    async getUUSDPriceHistory(config: PriceHistoryConfig = {
        maxDataPoints: 24,
        timeRangeHours: 24,
        sampleIntervalMinutes: 60
    }): Promise<PriceDataPoint[]> {
        const cacheKey = `${config.timeRangeHours}h_${config.maxDataPoints}pts`;

        // Check cache first
        if (this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey) || [];
        }

        try {
            const publicClient = this.walletService.getPublicClient();
            const currentBlock = await publicClient.getBlockNumber();

            // Calculate block range for the time period
            const targetBlocks = this.calculateBlockRange(currentBlock, config.timeRangeHours);

            // Try multiple strategies for getting price history
            const priceHistory = await this.fetchPriceHistoryMultiStrategy(
                publicClient,
                targetBlocks,
                config
            );

            // Cache the result
            this.cache.set(cacheKey, priceHistory);
            this.cacheTimestamp = Date.now();

            return priceHistory;
        } catch (error) {
            console.error('❌ Failed to fetch price history:', error);
            return [];
        }
    }

    /**
     * Fetch price history using multiple strategies for robustness
     */
    private async fetchPriceHistoryMultiStrategy(
        publicClient: PublicClient,
        targetBlocks: { fromBlock: bigint; toBlock: bigint },
        config: PriceHistoryConfig
    ): Promise<PriceDataPoint[]> {
        // Strategy 1: Try to get swap events from Curve pool
        try {
            const swapHistory = await this.fetchPriceFromSwapEvents(
                publicClient,
                targetBlocks,
                config
            );

            if (swapHistory.length > 0) {
                console.log(`✅ Got ${swapHistory.length} price points from swap events`);
                return swapHistory;
            }
        } catch (error) {
            console.warn('⚠️ Swap events strategy failed:', error);
        }

        // Strategy 2: Sample prices at regular intervals using get_dy calls
        try {
            const sampledHistory = await this.fetchPriceBySampling(
                publicClient,
                targetBlocks,
                config
            );

            if (sampledHistory.length > 0) {
                console.log(`✅ Got ${sampledHistory.length} price points from sampling`);
                return sampledHistory;
            }
        } catch (error) {
            console.warn('⚠️ Sampling strategy failed:', error);
        }

        // Fallback: Return empty array
        console.warn('⚠️ All price history strategies failed');
        return [];
    }

    /**
     * Fetch price history from Curve pool swap events
     */
    private async fetchPriceFromSwapEvents(
        publicClient: PublicClient,
        targetBlocks: { fromBlock: bigint; toBlock: bigint },
        config: PriceHistoryConfig
    ): Promise<PriceDataPoint[]> {
        try {
            // For now, we'll skip the event log strategy due to complex ABI parsing
            // and focus on the sampling strategy which is more reliable
            console.log('📊 Skipping swap events strategy, using sampling instead');
            return [];
        } catch (error) {
            console.warn('⚠️ Swap events strategy failed:', error);
            return [];
        }
    }

    /**
     * Fetch price history by sampling prices at regular intervals
     */
    private async fetchPriceBySampling(
        publicClient: PublicClient,
        targetBlocks: { fromBlock: bigint; toBlock: bigint },
        config: PriceHistoryConfig
    ): Promise<PriceDataPoint[]> {
        const pricePoints: PriceDataPoint[] = [];
        const blockRange = targetBlocks.toBlock - targetBlocks.fromBlock;
        const stepSize = blockRange / BigInt(config.maxDataPoints);

        for (let i = 0; i < config.maxDataPoints; i++) {
            const blockNumber = targetBlocks.fromBlock + (stepSize * BigInt(i));

            try {
                const [block, price] = await Promise.all([
                    publicClient.getBlock({ blockNumber }),
                    this.getPriceAtBlock(publicClient, blockNumber)
                ]);

                pricePoints.push({
                    timestamp: Number(block.timestamp),
                    price,
                    blockNumber
                });
            } catch (error) {
                console.warn(`Failed to get price at block ${blockNumber}:`, error);
            }
        }

        return pricePoints.filter(p => p.price > 0n);
    }

    /**
     * Get UUSD price at a specific block using get_dy call
     */
    private async getPriceAtBlock(publicClient: PublicClient, blockNumber: bigint): Promise<bigint> {
        const testAmount = parseEther('1'); // 1 LUSD

        try {
            const uusdReceived = await publicClient.readContract({
                address: this.CURVE_POOL_ADDRESS,
                abi: [{
                    name: 'get_dy',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [
                        { name: 'i', type: 'int128' },
                        { name: 'j', type: 'int128' },
                        { name: 'dx', type: 'uint256' }
                    ],
                    outputs: [{ type: 'uint256' }]
                }],
                functionName: 'get_dy',
                args: [this.LUSD_INDEX, this.UUSD_INDEX, testAmount],
                blockNumber
            }) as bigint;

            // Assuming LUSD is approximately $1.00, calculate UUSD price
            // UUSD_Price = LUSD_Price × (1 LUSD / UUSD_received)
            const lusdPriceUsd = 1000000n; // $1.00 in 6 decimal precision
            return (lusdPriceUsd * testAmount) / uusdReceived;
        } catch (error) {
            console.warn(`Failed to get price at block ${blockNumber}:`, error);
            return 0n;
        }
    }

    /**
     * Parse TokenExchange event from log data
     */
    private parseTokenExchangeEvent(log: Log): TokenExchangeEvent | null {
        try {
            // Basic parsing - in a real implementation, you'd use proper ABI decoding
            const data = log.data;
            const topics = log.topics;

            if (!data || topics.length < 1) return null;

            // This is a simplified parsing - in production, use proper ABI decoding libraries
            return {
                buyer: `0x${topics[1]?.slice(26)}` as Address,
                sold_id: BigInt(`0x${data.slice(2, 66)}`),
                tokens_sold: BigInt(`0x${data.slice(66, 130)}`),
                bought_id: BigInt(`0x${data.slice(130, 194)}`),
                tokens_bought: BigInt(`0x${data.slice(194, 258)}`)
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if the swap is between LUSD and UUSD
     */
    private isLUSDUUSDSwap(event: TokenExchangeEvent): boolean {
        return (event.sold_id === this.LUSD_INDEX && event.bought_id === this.UUSD_INDEX) ||
               (event.sold_id === this.UUSD_INDEX && event.bought_id === this.LUSD_INDEX);
    }

    /**
     * Calculate UUSD price from a swap event
     */
    private calculatePriceFromSwap(event: TokenExchangeEvent): bigint {
        const lusdPriceUsd = 1000000n; // Assume $1.00 in 6 decimal precision

        if (event.sold_id === this.LUSD_INDEX && event.bought_id === this.UUSD_INDEX) {
            // LUSD -> UUSD swap: price = (LUSD_amount / UUSD_amount) * LUSD_price
            return (event.tokens_sold * lusdPriceUsd) / event.tokens_bought;
        } else if (event.sold_id === this.UUSD_INDEX && event.bought_id === this.LUSD_INDEX) {
            // UUSD -> LUSD swap: price = (LUSD_amount / UUSD_amount) * LUSD_price
            return (event.tokens_bought * lusdPriceUsd) / event.tokens_sold;
        }

        return 0n;
    }

    /**
     * Calculate block range for a given time period
     */
    private calculateBlockRange(currentBlock: bigint, hours: number): { fromBlock: bigint; toBlock: bigint } {
        // Ethereum averages ~12 seconds per block
        const avgBlockTime = 12;
        const blocksPerHour = 3600 / avgBlockTime; // ~300 blocks per hour
        const targetBlocks = BigInt(Math.floor(hours * blocksPerHour));

        const fromBlock = currentBlock - targetBlocks;

        return {
            fromBlock: fromBlock > 0n ? fromBlock : 1n,
            toBlock: currentBlock
        };
    }

    /**
     * Check if cache is valid
     */
    private isCacheValid(cacheKey: string): boolean {
        return this.cache.has(cacheKey) &&
               (Date.now() - this.cacheTimestamp) < this.CACHE_TTL_MS;
    }

    /**
     * Clear the price history cache
     */
    clearCache(): void {
        this.cache.clear();
        this.cacheTimestamp = 0;
    }
}