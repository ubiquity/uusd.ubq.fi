import { type PublicClient, type Address } from "viem";
import { getRpcUrl } from "../../tools/config";

/**
 * RPC request structure for batching
 */
interface RPCRequest {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
}

/**
 * RPC response structure
 */
interface RPCResponse {
  id: number;
  jsonrpc: "2.0";
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Batch request result
 */
export interface BatchRequestResult {
  blocks: unknown[];
  prices: bigint[];
  errors: string[];
}

/**
 * Service for batching RPC requests to improve performance
 */
export class RPCBatchService {
  private _requestId = 1;
  private _pendingRequests: Array<{
    blockNumbers: bigint[];
    curvePoolAddress: Address;
    testAmount: bigint;
    publicClient: PublicClient;
    resolve: (result: BatchRequestResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private _debounceTimer: number | null = null;
  private readonly _debounceMs = 25;

  /**
   * Batch multiple block and contract calls into a single RPC request with 25ms debouncing
   */
  async batchHistoryRequests(publicClient: PublicClient, blockNumbers: bigint[], curvePoolAddress: Address, testAmount: bigint): Promise<BatchRequestResult> {
    return new Promise((resolve, reject) => {
      // Add this request to pending queue
      this._pendingRequests.push({
        blockNumbers,
        curvePoolAddress,
        testAmount,
        publicClient,
        resolve,
        reject,
      });

      // Clear existing timer and set new one
      if (this._debounceTimer) {
        window.clearTimeout(this._debounceTimer);
      }

      this._debounceTimer = window.setTimeout(() => {
        void this._processBatchedRequests().catch((error) => {
          console.error("Error processing batched RPC requests:", error);
        });
      }, this._debounceMs);
    });
  }

  /**
   * Process all pending requests in a single batch
   */
  private async _processBatchedRequests(): Promise<void> {
    const requests = [...this._pendingRequests];
    this._pendingRequests = [];
    this._debounceTimer = null;

    if (requests.length === 0) return;

    console.log(`🚀 Processing ${requests.length} debounced RPC batch requests`);

    // Combine all block numbers from all pending requests
    const allBlockNumbers = new Set<bigint>();
    requests.forEach((req) => {
      req.blockNumbers.forEach((block) => allBlockNumbers.add(block));
    });

    const uniqueBlockNumbers = Array.from(allBlockNumbers);
    console.log(`📦 Total unique blocks to batch: ${uniqueBlockNumbers.length}`);

    try {
      // Execute single large batch for all unique blocks
      const result = await this._executeBatchRequests(
        requests[0].publicClient, // Use first client (they should all be the same)
        uniqueBlockNumbers,
        requests[0].curvePoolAddress, // Use first address (should be same)
        requests[0].testAmount // Use first amount (should be same)
      );

      // Resolve all pending requests with appropriate subsets of the data
      requests.forEach((req) => {
        const filteredResult = this._filterResultForRequest(result, req.blockNumbers);
        req.resolve(filteredResult);
      });
    } catch (error) {
      // Reject all pending requests with the same error
      requests.forEach((req) => {
        req.reject(error as Error);
      });
    }
  }

  /**
   * Filter batch result to only include data for specific block numbers
   */
  private _filterResultForRequest(fullResult: BatchRequestResult, _requestedBlocks: bigint[]): BatchRequestResult {
    // For simplicity, return the full result for now
    // In a more advanced implementation, we could filter by specific blocks
    return fullResult;
  }

  /**
   * Execute the actual batch RPC requests
   */
  private async _executeBatchRequests(
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
      const blockRequestId = this._getNextId();
      blockRequestIds.push(blockRequestId);

      requests.push({
        id: blockRequestId,
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
      });
    }

    // Create batch requests for price data (get_dy calls)
    for (const blockNumber of blockNumbers) {
      const priceRequestId = this._getNextId();
      priceRequestIds.push(priceRequestId);

      // Encode get_dy function call
      const functionSelector = "0x5e0d443f"; // get_dy(int128,int128,uint256)
      const params = this._encodeGetDyParams(0n, 1n, testAmount); // LUSD_INDEX=0, UUSD_INDEX=1
      const data = functionSelector + params;

      requests.push({
        id: priceRequestId,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: curvePoolAddress,
            data: data,
          },
          `0x${blockNumber.toString(16)}`,
        ],
      });
    }

    try {
      // Get RPC URL from the public client
      const rpcUrl = getRpcUrl();

      // Execute batched request using standard JSON-RPC 2.0 batch format
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          ["Content-Type"]: "application/json",
        },
        body: JSON.stringify(requests), // Send array directly as JSON-RPC 2.0 batch
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responses: RPCResponse[] = await response.json();

      // Process responses
      const blocks: unknown[] = [];
      const prices: bigint[] = [];
      const errors: string[] = [];

      // Process block responses
      for (let i = 0; i < blockRequestIds.length; i++) {
        const blockRequestId = blockRequestIds[i];
        const response = responses.find((r) => r.id === blockRequestId);

        if (response?.error) {
          errors.push(`Block ${blockNumbers[i]}: ${response.error.message}`);
          blocks.push(null);
        } else if (response?.result) {
          const blockResult = response.result as Record<string, unknown>;
          blocks.push({
            ...blockResult,
            timestamp: BigInt(blockResult.timestamp as string),
          });
        } else {
          errors.push(`Block ${blockNumbers[i]}: No response`);
          blocks.push(null);
        }
      }

      // Process price responses
      for (let i = 0; i < priceRequestIds.length; i++) {
        const priceRequestId = priceRequestIds[i];
        const response = responses.find((r) => r.id === priceRequestId);

        if (response?.error) {
          errors.push(`Price ${blockNumbers[i]}: ${response.error.message}`);
          prices.push(0n);
        } else if (response?.result && response.result !== "0x") {
          try {
            const priceResult = BigInt(response.result as string);
            // Calculate UUSD price correctly:
            // If get_dy(0, 1, 1 LUSD) returns X UUSD, then 1 UUSD = (1 LUSD) / X
            // Price in 6 decimal precision: (1 LUSD * 1e6) / (X UUSD)
            const lusdPriceUsd = 1000000n; // $1.00 in 6 decimal precision

            if (priceResult > 0n) {
              // Calculate exchange rate: how many LUSD per UUSD
              // If testAmount LUSD (1e18) gets you priceResult UUSD (1e18),
              // then 1 UUSD costs (testAmount / priceResult) LUSD
              // Convert to 6-decimal precision: (testAmount * 1e6) / priceResult
              const uusdPrice = (testAmount * lusdPriceUsd) / priceResult;
              prices.push(uusdPrice);
            } else {
              throw new Error(`Invalid price result (0) for block ${blockNumbers[i]}`);
            }
          } catch {
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
      console.error("❌ Batch RPC request failed:", error);
      throw new Error(`Batch RPC request failed: ${error}`);
    }
  }

  /**
   * Encode parameters for get_dy function call
   */
  private _encodeGetDyParams(i: bigint, j: bigint, dx: bigint): string {
    // Pad each parameter to 32 bytes (64 hex characters)
    const paddedI = i.toString(16).padStart(64, "0");
    const paddedJ = j.toString(16).padStart(64, "0");
    const paddedDx = dx.toString(16).padStart(64, "0");

    return paddedI + paddedJ + paddedDx;
  }

  /**
   * Get next request ID
   */
  private _getNextId(): number {
    return this._requestId++;
  }
}
