import type { Address, PublicClient } from "viem";

/**
 * Parameters for a token balance batch request
 */
export interface TokenBalanceBatchParams {
  tokenAddress: Address;
  userAddress: Address;
}

/**
 * Result of a token balance batch request
 */
export interface TokenBalanceBatchResult {
  tokenAddress: Address;
  symbol: string;
  balance: bigint;
}

/**
 * Encode balanceOf function call data for ERC20 tokens
 */
function encodeBalanceOfCall(userAddress: Address): `0x${string}` {
  // ERC20 balanceOf(address) function selector: 0x70a08231
  const functionSelector = "70a08231"; // Remove 0x prefix to avoid double prefix
  // Remove 0x prefix and pad address to 32 bytes (64 hex characters)
  const paddedAddress = userAddress.slice(2).toLowerCase().padStart(64, "0");
  return `0x${functionSelector}${paddedAddress}`;
}

/**
 * Batch fetch ERC20 token balances using multicall pattern
 * This uses multiple individual eth_call requests but processes them more efficiently
 */
export async function batchFetchTokenBalances(
  publicClient: PublicClient,
  tokens: { address: Address; symbol: string }[],
  userAddress: Address
): Promise<TokenBalanceBatchResult[]> {
  // Create all the balance requests
  const balancePromises = tokens.map(async (token): Promise<TokenBalanceBatchResult> => {
    try {
      // Use eth_call directly for better performance
      const callData = encodeBalanceOfCall(userAddress);

      const result = await publicClient.call({
        to: token.address,
        data: callData,
      });

      // Parse the result (should be a 32-byte hex string representing the balance)
      const balance = result.data ? BigInt(result.data) : 0n;

      return {
        tokenAddress: token.address,
        symbol: token.symbol,
        balance,
      };
    } catch (error) {
      console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
      // Return zero balance on error to prevent the entire batch from failing
      return {
        tokenAddress: token.address,
        symbol: token.symbol,
        balance: 0n,
      };
    }
  });

  // Execute all requests in parallel (still faster than sequential)
  const results = await Promise.all(balancePromises);

  return results;
}

/**
 * Alternative implementation using the multicall contract pattern
 * This would be even more efficient but requires a multicall contract deployment
 */
export async function batchFetchTokenBalancesMulticall(
  publicClient: PublicClient,
  tokens: { address: Address; symbol: string }[],
  userAddress: Address
): Promise<TokenBalanceBatchResult[]> {
  // This would use a multicall contract to batch all the calls into a single transaction
  // For now, we'll use the simpler approach above
  // TODO: Implement when multicall contract address is available
  return batchFetchTokenBalances(publicClient, tokens, userAddress);
}
