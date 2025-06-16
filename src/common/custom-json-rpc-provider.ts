import { JsonRpcProvider } from "@ethersproject/providers";
import { Permit2RpcClient, JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { providersUrl } from "../constants.ts";

/**
 * Custom JsonRpcProvider that uses Permit2 RPC client for requests with fallback
 */
export class CustomJsonRpcProvider extends JsonRpcProvider {
  private _rpcClient: Permit2RpcClient;
  private _chainId: number;
  private _fallbackProvider: JsonRpcProvider | null = null;
  private _useFallback = false;

  constructor(rpcClient: Permit2RpcClient, chainId: number) {
    // Initialize with a dummy URL since we'll override the send method
    super({ url: "https://rpc.ubq.fi", skipFetchSetup: true });
    this._rpcClient = rpcClient;
    this._chainId = chainId;
  }

  private _getFallbackProvider(): JsonRpcProvider {
    if (!this._fallbackProvider) {
      const mainnetUrl = providersUrl[1]; // https://eth.drpc.org
      console.log("Initializing fallback provider:", mainnetUrl);
      this._fallbackProvider = new JsonRpcProvider(mainnetUrl);
    }
    return this._fallbackProvider;
  }

  override async send(method: string, params: Array<unknown>): Promise<unknown> {
    // If fallback is enabled, use the standard provider
    if (this._useFallback) {
      return this._getFallbackProvider().send(method, params);
    }

    try {
      const payload = {
        jsonrpc: "2.0" as const,
        method,
        params,
        id: this._nextId++,
      };

      const response = await this._rpcClient.request<JsonRpcResponse>(this._chainId, payload);

      if (response && typeof response === "object" && "error" in response && response.error) {
        const errorMessage = response.error.message || "RPC request failed";

        // Detect oracle staleness errors specifically
        if (errorMessage.includes("Stale Stable/USD data") || (errorMessage.includes("Stale") && errorMessage.includes("USD"))) {
          console.warn("Oracle staleness detected in RPC call:", {
            method,
            params: params.slice(0, 2), // Log first 2 params for debugging (avoid logging sensitive data)
            error: errorMessage,
          });

          // Throw a specific oracle staleness error that the application can handle gracefully
          throw new Error(`Oracle data temporarily stale: ${errorMessage}`);
        }

        throw new Error(errorMessage);
      }

      if (response && typeof response === "object" && "result" in response) {
        return response.result;
      }

      throw new Error("Invalid RPC response");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Don't switch to fallback for oracle staleness - both providers will have the same issue
      if (errorMessage.includes("Oracle data temporarily stale") || errorMessage.includes("Stale Stable/USD data")) {
        console.warn("Oracle staleness error - not switching to fallback (same issue expected):", errorMessage);
        throw error; // Re-throw the oracle staleness error for proper handling
      }

      // For other errors, switch to fallback provider
      console.warn("Permit2 RPC request failed, switching to fallback provider:", error);
      this._useFallback = true;
      return this._getFallbackProvider().send(method, params);
    }
  }
}
