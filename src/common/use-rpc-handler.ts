import { JsonRpcProvider } from "@ethersproject/providers";
import { createRpcProvider } from "./create-rpc-provider.ts";

/**
 * Creates and returns an RPC provider for the specified network
 *
 * @param networkId - The network/chain ID
 * @returns A JsonRpcProvider instance configured for the network
 */
export async function useRpcHandler(networkId: number): Promise<JsonRpcProvider> {
  if (!networkId) {
    throw new Error("Network ID not set");
  }

  // Use the new adapter to create the provider
  // The adapter handles RPC selection on the server side automatically
  return createRpcProvider(networkId) as unknown as JsonRpcProvider;
}
