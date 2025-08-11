import { type Address, type Hash, parseEther, formatEther, maxUint256 } from 'viem';
import type { WalletService } from './wallet-service.ts';
import type { ContractService } from './contract-service.ts';

/**
 * Curve Pool ABI for swaps
 */
const CURVE_POOL_ABI = [
    {
        name: 'exchange',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'i', type: 'int128' },
            { name: 'j', type: 'int128' },
            { name: 'dx', type: 'uint256' },
            { name: 'min_dy', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }]
    },
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
] as const;

/**
 * Swap transaction parameters
 */
export interface SwapParams {
    fromToken: 'LUSD' | 'UUSD';
    toToken: 'LUSD' | 'UUSD';
    amountIn: bigint;
    minAmountOut: bigint;
    slippageTolerance?: number; // Default 0.5%
}

/**
 * Swap transaction result
 */
export interface SwapResult {
    hash: Hash;
    amountIn: bigint;
    amountOut: bigint;
    fromToken: string;
    toToken: string;
}

/**
 * Service for executing swaps through Curve pool
 */
export class SwapService {
    private walletService: WalletService;
    private contractService: ContractService;

    // Curve LUSD/UUSD pool on mainnet
    private readonly CURVE_POOL_ADDRESS: Address = '0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f';
    private readonly LUSD_INDEX = 0n;
    private readonly UUSD_INDEX = 1n;

    // Token addresses
    private readonly LUSD_ADDRESS: Address = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
    private readonly UUSD_ADDRESS: Address = '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103';

    private readonly DEFAULT_SLIPPAGE = 0.005; // 0.5%

    constructor(walletService: WalletService, contractService: ContractService) {
        this.walletService = walletService;
        this.contractService = contractService;
    }

    /**
     * Execute a swap through Curve pool
     */
    async executeSwap(params: SwapParams): Promise<SwapResult> {
        if (!this.walletService.isConnected()) {
            throw new Error('Wallet not connected');
        }

        const account = this.walletService.getAccount()!;

        // Validate swap parameters
        this.validateSwapParams(params);

        // Get token addresses and indices
        const { fromTokenAddress, toTokenAddress, fromIndex, toIndex } = this.getSwapTokenInfo(params);

        // Check and handle token approval
        await this.ensureTokenApproval(fromTokenAddress, account, params.amountIn);

        // Calculate minimum output with slippage protection
        const slippage = params.slippageTolerance || this.DEFAULT_SLIPPAGE;
        const minAmountOut = params.minAmountOut || this.calculateMinAmountOut(params.amountIn, slippage);

        try {
            // Execute the swap
            const walletClient = this.walletService.getWalletClient();
            const hash = await walletClient.writeContract({
                address: this.CURVE_POOL_ADDRESS,
                abi: CURVE_POOL_ABI,
                functionName: 'exchange',
                args: [fromIndex, toIndex, params.amountIn, minAmountOut],
                account,
                chain: this.walletService.getChain()
            });

            // Get actual output amount from transaction receipt
            const publicClient = this.walletService.getPublicClient();
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // For now, estimate the output (in production, parse from logs)
            const estimatedOutput = await this.getSwapQuoteInternal(params.amountIn, fromIndex, toIndex);

            return {
                hash,
                amountIn: params.amountIn,
                amountOut: estimatedOutput,
                fromToken: params.fromToken,
                toToken: params.toToken
            };

        } catch (error: any) {
            console.error('Swap transaction failed:', error);
            if (error.message.includes('ChainMismatchError')) {
                throw new Error('Wrong network. Please switch to Ethereum mainnet.');
            }
            throw new Error(`Swap failed: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * Get a quote for a swap without executing
     */
    async getSwapQuote(amountIn: bigint, fromToken: 'LUSD' | 'UUSD', toToken: 'LUSD' | 'UUSD'): Promise<bigint> {
        const { fromIndex, toIndex } = this.getSwapTokenInfo({ fromToken, toToken });
        return this.getSwapQuoteInternal(amountIn, fromIndex, toIndex);
    }

    /**
     * Get swap quote from Curve pool
     */
    private async getSwapQuoteInternal(amountIn: bigint, fromIndex: bigint, toIndex: bigint): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();

        return await publicClient.readContract({
            address: this.CURVE_POOL_ADDRESS,
            abi: CURVE_POOL_ABI,
            functionName: 'get_dy',
            args: [fromIndex, toIndex, amountIn]
        }) as bigint;
    }

    /**
     * Check token approval and approve if necessary
     */
    private async ensureTokenApproval(tokenAddress: Address, account: Address, amount: bigint): Promise<void> {
        const currentAllowance = await this.contractService.getAllowance(
            tokenAddress,
            account,
            this.CURVE_POOL_ADDRESS
        );

        if (currentAllowance < amount) {
            console.log(`Approving ${tokenAddress} for Curve pool...`);

            const approvalHash = await this.contractService.approveToken(
                tokenAddress,
                this.CURVE_POOL_ADDRESS,
                maxUint256 // Approve unlimited to save gas on future swaps
            );

            // Wait for approval to be mined
            const publicClient = this.walletService.getPublicClient();
            await publicClient.waitForTransactionReceipt({ hash: approvalHash as Hash });

            console.log(`✅ Token approval confirmed: ${approvalHash}`);
        }
    }

    /**
     * Get token addresses and indices for swap
     */
    private getSwapTokenInfo(params: Pick<SwapParams, 'fromToken' | 'toToken'>): {
        fromTokenAddress: Address;
        toTokenAddress: Address;
        fromIndex: bigint;
        toIndex: bigint;
    } {
        let fromTokenAddress: Address;
        let toTokenAddress: Address;
        let fromIndex: bigint;
        let toIndex: bigint;

        if (params.fromToken === 'LUSD') {
            fromTokenAddress = this.LUSD_ADDRESS;
            fromIndex = this.LUSD_INDEX;
        } else {
            fromTokenAddress = this.UUSD_ADDRESS;
            fromIndex = this.UUSD_INDEX;
        }

        if (params.toToken === 'LUSD') {
            toTokenAddress = this.LUSD_ADDRESS;
            toIndex = this.LUSD_INDEX;
        } else {
            toTokenAddress = this.UUSD_ADDRESS;
            toIndex = this.UUSD_INDEX;
        }

        return { fromTokenAddress, toTokenAddress, fromIndex, toIndex };
    }

    /**
     * Calculate minimum amount out with slippage protection
     */
    private calculateMinAmountOut(expectedAmount: bigint, slippageTolerance: number): bigint {
        const slippageBps = BigInt(Math.floor(slippageTolerance * 10000)); // Convert to basis points
        return (expectedAmount * (10000n - slippageBps)) / 10000n;
    }

    /**
     * Validate swap parameters
     */
    private validateSwapParams(params: SwapParams): void {
        if (params.fromToken === params.toToken) {
            throw new Error('Cannot swap same token');
        }

        if (params.amountIn <= 0n) {
            throw new Error('Amount in must be greater than 0');
        }

        if (params.minAmountOut < 0n) {
            throw new Error('Minimum amount out cannot be negative');
        }

        if (params.slippageTolerance && (params.slippageTolerance < 0 || params.slippageTolerance > 1)) {
            throw new Error('Slippage tolerance must be between 0 and 1 (0% to 100%)');
        }

        // Check supported tokens
        if (!['LUSD', 'UUSD'].includes(params.fromToken) || !['LUSD', 'UUSD'].includes(params.toToken)) {
            throw new Error('Only LUSD and UUSD tokens are supported');
        }
    }

    /**
     * Get pool address for external reference
     */
    getPoolAddress(): Address {
        return this.CURVE_POOL_ADDRESS;
    }

    /**
     * Get supported tokens
     */
    getSupportedTokens(): string[] {
        return ['LUSD', 'UUSD'];
    }
}
