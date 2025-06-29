import { type PublicClient, type Address } from 'viem';

/**
 * RPC request structure for batching
 */
interface RPCRequest {
    id: number;
    jsonrpc: '2.0';
    method: string;
    params: any[];
}

/**
 * RPC response structure
 */
interface RPCResponse {
    id: number;
    jsonrpc: '2.0';
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Batch request result
 */
export interface BatchRequestResult {
    blocks: any[];
    prices: bigint[];
    errors: string[];
}

/**
 * Service for batching RPC requests to improve performance
 */
export class RPCBatchService {
    private requestId = 1;

    /**
     * Batch multiple block and contract calls into a single RPC request
     */
    async batchHistoryRequests(
        publicClient: PublicClient,
        blockNumbers: bigint[],
        curvePoolAddress: Address,
        testAmount: bigint
    ): Promise<BatchRequestResult> {
        const requests: RPCRequest[] = [];
        const blockRequestIds: number[] = [];
        const priceRequestIds: number[] = [];

        // Create batch requests for block data
        for (const blockNumber of blockNumbers) {
            const blockRequestId = this.getNextId();
            blockRequestIds.push(blockRequestId);

            requests.push({
                id: blockRequestId,
                jsonrpc: '2.0',
                method: 'eth_getBlockByNumber',
                params: [`0x${blockNumber.toString(16)}`, false]
            });
        }

        // Create batch requests for price data (get_dy calls)
        for (const blockNumber of blockNumbers) {
            const priceRequestId = this.getNextId();
            priceRequestIds.push(priceRequestId);

            // Encode get_dy function call
            const functionSelector = '0x5e0d443f'; // get_dy(int128,int128,uint256)
            const params = this.encodeGetDyParams(0n, 1n, testAmount); // LUSD_INDEX=0, UUSD_INDEX=1
            const data = functionSelector + params;

            requests.push({
                id: priceRequestId,
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                    {
                        to: curvePoolAddress,
                        data: data
                    },
                    `0x${blockNumber.toString(16)}`
                ]
            });
        }

        try {
            // Get RPC URL from the public client
            const rpcUrl = this.extractRpcUrl(publicClient);

            // Execute batched request using standard JSON-RPC 2.0 batch format
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requests) // Send array directly as JSON-RPC 2.0 batch
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responses: RPCResponse[] = await response.json();

            // Process responses
            const blocks: any[] = [];
            const prices: bigint[] = [];
            const errors: string[] = [];

            // Process block responses
            for (let i = 0; i < blockRequestIds.length; i++) {
                const blockRequestId = blockRequestIds[i];
                const response = responses.find(r => r.id === blockRequestId);

                if (response?.error) {
                    errors.push(`Block ${blockNumbers[i]}: ${response.error.message}`);
                    blocks.push(null);
                } else if (response?.result) {
                    blocks.push({
                        ...response.result,
                        timestamp: BigInt(response.result.timestamp)
                    });
                } else {
                    errors.push(`Block ${blockNumbers[i]}: No response`);
                    blocks.push(null);
                }
            }

            // Process price responses
            for (let i = 0; i < priceRequestIds.length; i++) {
                const priceRequestId = priceRequestIds[i];
                const response = responses.find(r => r.id === priceRequestId);

                if (response?.error) {
                    errors.push(`Price ${blockNumbers[i]}: ${response.error.message}`);
                    prices.push(0n);
                } else if (response?.result && response.result !== '0x') {
                    try {
                        const priceResult = BigInt(response.result);
                        // Calculate UUSD price: LUSD_Price × (1 LUSD / UUSD_received)
                        const lusdPriceUsd = 1000000n; // $1.00 in 6 decimal precision
                        const uusdPrice = (lusdPriceUsd * testAmount) / priceResult;
                        prices.push(uusdPrice);
                    } catch (error) {
                        errors.push(`Price ${blockNumbers[i]}: Failed to parse result`);
                        prices.push(0n);
                    }
                } else {
                    errors.push(`Price ${blockNumbers[i]}: Empty result`);
                    prices.push(0n);
                }
            }

            return { blocks, prices, errors };
        } catch (error) {
            console.error('❌ Batch RPC request failed:', error);
            throw new Error(`Batch RPC request failed: ${error}`);
        }
    }

    /**
     * Extract RPC URL from viem public client
     */
    private extractRpcUrl(publicClient: PublicClient): string {
        // Get the transport from the public client
        const transport = publicClient.transport;

        // For HTTP transport, try to get the URL
        if ('url' in transport && typeof transport.url === 'string') {
            return transport.url;
        }

        // Environment-aware fallback
        if (typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' ||
             window.location.hostname === '127.0.0.1' ||
             window.location.hostname.includes('local'))) {
            return 'https://rpc.ubq.fi/1'; // Development: external endpoint
        }
        return 'rpc/1'; // Production: same-domain endpoint (uusd.ubq.fi/rpc/1)
    }

    /**
     * Encode parameters for get_dy function call
     */
    private encodeGetDyParams(i: bigint, j: bigint, dx: bigint): string {
        // Pad each parameter to 32 bytes (64 hex characters)
        const paddedI = i.toString(16).padStart(64, '0');
        const paddedJ = j.toString(16).padStart(64, '0');
        const paddedDx = dx.toString(16).padStart(64, '0');

        return paddedI + paddedJ + paddedDx;
    }

    /**
     * Get next request ID
     */
    private getNextId(): number {
        return this.requestId++;
    }
}
