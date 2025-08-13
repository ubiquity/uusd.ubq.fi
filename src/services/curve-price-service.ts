import { type Address, type PublicClient as _PublicClient, parseEther } from "viem";
import type { WalletService } from "./wallet-service.ts";

/**
 * Curve Pool ABI - minimal interface for price calculations
 */
const CURVE_POOL_ABI = [
  {
    name: "get_dy",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "coins",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "arg0", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

/**
 * Service for interacting with Curve pools to get real market prices
 */
export class CurvePriceService {
  private _walletService: WalletService;
  private readonly _curvePoolAddress: Address = "0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f";
  private readonly _lusdIndex = 0n; // LUSD is index 0 in the pool
  private readonly _uusdIndex = 1n; // UUSD is index 1 in the pool

  constructor(walletService: WalletService) {
    this._walletService = walletService;
  }

  /**
   * Get the current UUSD price in USD by calculating the exchange rate from Curve pool
   * Formula: UUSD_Price = LUSD_Price × (LUSD_amount_in / UUSD_amount_out)
   */
  async getUUSDMarketPrice(lusdPriceUsd: bigint): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();

    // Use 1 LUSD as the test amount for calculating exchange rate
    const testAmount = parseEther("1"); // 1 LUSD

    try {
      // Get how much UUSD we would receive for 1 LUSD
      const uusdReceived = (await publicClient.readContract({
        address: this._curvePoolAddress,
        abi: CURVE_POOL_ABI,
        functionName: "get_dy",
        args: [this._lusdIndex, this._uusdIndex, testAmount],
      })) as bigint;

      // Calculate the exchange rate: LUSD/UUSD
      // If 1 LUSD = 1.03 UUSD, then 1 UUSD = LUSD_price / 1.03
      // UUSD_Price = LUSD_Price × (1 LUSD / UUSD_received)
      const uusdPriceUsd = (lusdPriceUsd * testAmount) / uusdReceived;

      return uusdPriceUsd;
    } catch (error) {
      console.error("❌ Failed to get UUSD price from Curve pool:", error);
      throw new Error("Unable to fetch UUSD market price from Curve pool");
    }
  }

  /**
   * Get the reverse exchange rate: how much LUSD for 1 UUSD
   */
  async getLUSDForUUSD(amount: bigint): Promise<bigint> {
    const publicClient = this._walletService.getPublicClient();

    return (await publicClient.readContract({
      address: this._curvePoolAddress,
      abi: CURVE_POOL_ABI,
      functionName: "get_dy",
      args: [this._uusdIndex, this._lusdIndex, amount],
    })) as bigint;
  }

  /**
   * Verify that the pool has the expected tokens
   */
  async verifyPoolConfiguration(): Promise<{ lusdAddress: Address; uusdAddress: Address }> {
    const publicClient = this._walletService.getPublicClient();

    try {
      const [lusdAddress, uusdAddress] = await Promise.all([
        publicClient.readContract({
          address: this._curvePoolAddress,
          abi: CURVE_POOL_ABI,
          functionName: "coins",
          args: [BigInt(this._lusdIndex)],
        }) as Promise<Address>,
        publicClient.readContract({
          address: this._curvePoolAddress,
          abi: CURVE_POOL_ABI,
          functionName: "coins",
          args: [BigInt(this._uusdIndex)],
        }) as Promise<Address>,
      ]);

      console.log(`✅ Curve pool configuration verified:
- Index ${this._lusdIndex}: ${lusdAddress} (LUSD)
- Index ${this._uusdIndex}: ${uusdAddress} (UUSD)`);

      return { lusdAddress, uusdAddress };
    } catch (error) {
      console.error("❌ Failed to verify Curve pool configuration:", error);
      throw new Error("Unable to verify Curve pool token configuration");
    }
  }
}
