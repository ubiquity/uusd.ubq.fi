import { JsonRpcProvider } from "@ethersproject/providers";
import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import { CustomJsonRpcProvider } from "./custom-json-rpc-provider.ts";
import { providersUrl } from "../constants.ts";

/**
 * Creates a provider for mainnet with fallback support
 * Tries Permit2 RPC first, falls back to standard mainnet RPC if unavailable
 */
export function createRpcProvider(chainId: number): JsonRpcProvider {
  console.log("Creating RPC provider for chain ID:", chainId);

  // Production-ready: Only support mainnet (chain ID 1)
  // Remove localhost/Anvil support to prevent connection attempts
  if (chainId !== 1) {
    console.warn(`Unsupported chain ID: ${chainId}. Defaulting to mainnet (1).`);
    chainId = 1;
  }

  try {
    // Try to create the Permit2 RPC client for mainnet
    const rpcClient = createRpcClient({
      baseUrl: "https://rpc.ubq.fi",
    });

    // Create a custom provider that uses the new RPC client
    console.log("Using Permit2 RPC client for enhanced functionality");
    return new CustomJsonRpcProvider(rpcClient, chainId) as unknown as JsonRpcProvider;
  } catch (error) {
    console.warn("Permit2 RPC client unavailable, falling back to standard mainnet RPC:", error);

    // Fallback to standard mainnet RPC
    const mainnetUrl = providersUrl[1]; // https://eth.drpc.org
    console.log("Using fallback mainnet RPC:", mainnetUrl);
    return new JsonRpcProvider(mainnetUrl);
  }
}
