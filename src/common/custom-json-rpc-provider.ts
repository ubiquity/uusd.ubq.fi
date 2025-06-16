import { JsonRpcProvider } from "@ethersproject/providers";
import { Permit2RpcClient, JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { providersUrl } from "../constants.ts";

/**
 * Custom JsonRpcProvider that uses Permit2 RPC client for requests with fallback
 */
export class CustomJsonRpcProvider extends JsonRpcProvider {
  private rpcClient: Permit2RpcClient;
  private chainId: number;
  private fallbackProvider: JsonRpcProvider | null = null;
  private useFallback = false;

  constructor(rpcClient: Permit2RpcClient, chainId: number) {
    // Initialize with a dummy URL since we'll override the send method
    super({ url: "https://rpc.ubq.fi", skipFetchSetup: true });
    this.rpcClient = rpcClient;
    this.chainId = chainId;
  }

  private getFallbackProvider(): JsonRpcProvider {
    if (!this.fallbackProvider) {
      const mainnetUrl = providersUrl[1]; // https://eth.drpc.org
      console.log("Initializing fallback provider:", mainnetUrl);
      this.fallbackProvider = new JsonRpcProvider(mainnetUrl);
    }
    return this.fallbackProvider;
  }

  override async send(method: string, params: Array<any>): Promise<any> {
    // If fallback is enabled, use the standard provider
    if (this.useFallback) {
      return this.getFallbackProvider().send(method, params);
    }

    try {
      const payload = {
        jsonrpc: "2.0" as const,
        method,
        params,
        id: this._nextId++,
      };

      const response = await this.rpcClient.request<JsonRpcResponse>(this.chainId, payload);

      if (response && typeof response === 'object' && 'error' in response && response.error) {
        throw new Error(response.error.message || 'RPC request failed');
      }

      if (response && typeof response === 'object' && 'result' in response) {
        return response.result;
      }

      throw new Error('Invalid RPC response');
    } catch (error) {
      console.warn("Permit2 RPC request failed, switching to fallback provider:", error);
      this.useFallback = true;
      return this.getFallbackProvider().send(method, params);
    }
  }
}
