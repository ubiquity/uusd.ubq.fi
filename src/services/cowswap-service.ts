import { OrderKind, OrderStatus, SupportedChainId, TradingSdk, type EnrichedOrder } from "@cowprotocol/cow-sdk";
import type { OptimalRouteResult } from "./optimal-route-service";
import type { WalletService } from "./wallet-service";
import type { Address } from "viem";
import { INVENTORY_TOKENS } from "../types/inventory.types";
import { ViemAdapter } from "@cowprotocol/sdk-viem-adapter";

export class CowSwapService {
  private _walletService: WalletService;

  constructor(walletService: WalletService) {
    this._walletService = walletService;
  }

  getCowSwapSdk() {
    const adapter = new ViemAdapter({
      provider: this._walletService.getPublicClient(),
      walletClient: this._walletService.getWalletClient(),
    });

    return new TradingSdk(
      {
        chainId: SupportedChainId.MAINNET,
        appCode: "UBIQUITY_UUSD",
      },
      {},
      adapter
    );
  }

  async getDepositRoute(
    inputToken: {
      address: Address;
      symbol: string;
      decimals: number;
    },
    inputAmount: bigint
  ): Promise<OptimalRouteResult> {
    let routeResult: OptimalRouteResult;
    try {
      const quote = await this.getCowSwapSdk().getQuote({
        kind: OrderKind.SELL,
        sellToken: inputToken.address,
        sellTokenDecimals: inputToken.decimals,
        buyToken: INVENTORY_TOKENS.UUSD.address,
        buyTokenDecimals: 18,
        amount: inputAmount.toString(),
      });

      routeResult = {
        routeType: "cowswap",
        expectedOutput: BigInt(quote.quoteResults.quoteResponse.quote.buyAmount),
        inputAmount,
        inputToken: {
          address: inputToken.address,
          symbol: inputToken.symbol,
          decimals: inputToken.decimals,
        },
        outputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        direction: "deposit",
        marketPrice: 1n,
        pegPrice: 1n,
        savings: {
          amount: 0n,
          percentage: 0,
        },
        isEnabled: true,
        executeCowSwapOrder: quote.postSwapOrderFromQuote,
      };
    } catch (error) {
      console.error("Error getting CowSwap quote:", error);
      routeResult = {
        routeType: "cowswap",
        expectedOutput: 0n,
        inputAmount,
        inputToken: {
          address: inputToken.address,
          symbol: inputToken.symbol,
          decimals: inputToken.decimals,
        },
        outputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        direction: "deposit",
        marketPrice: 1n,
        pegPrice: 1n,
        savings: {
          amount: 0n,
          percentage: 0,
        },
        isEnabled: false,
        disabledReason: "Failed to get CowSwap quote",
      };
    }
    return routeResult;
  }

  async getWithdrawRoute(
    outputToken: {
      address: Address;
      symbol: string;
      decimals: number;
    },
    inputAmount: bigint
  ): Promise<OptimalRouteResult> {
    let routeResult: OptimalRouteResult;
    try {
      const quote = await this.getCowSwapSdk().getQuote({
        kind: OrderKind.SELL,
        sellToken: INVENTORY_TOKENS.UUSD.address,
        sellTokenDecimals: INVENTORY_TOKENS.UUSD.decimals,
        buyToken: outputToken.address,
        buyTokenDecimals: outputToken.decimals,
        amount: inputAmount.toString(),
      });

      routeResult = {
        routeType: "cowswap",
        expectedOutput: BigInt(quote.quoteResults.quoteResponse.quote.buyAmount),
        inputAmount,
        inputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        outputToken: {
          address: outputToken.address,
          symbol: outputToken.symbol,
          decimals: outputToken.decimals,
        },
        direction: "withdraw",
        marketPrice: 1n,
        pegPrice: 1n,
        savings: {
          amount: 0n,
          percentage: 0,
        },
        isEnabled: true,
        executeCowSwapOrder: quote.postSwapOrderFromQuote,
      };
    } catch (error) {
      console.error("Error getting CowSwap quote:", error);
      routeResult = {
        routeType: "cowswap",
        expectedOutput: 0n,
        inputAmount,
        inputToken: {
          address: INVENTORY_TOKENS.UUSD.address,
          symbol: INVENTORY_TOKENS.UUSD.symbol,
          decimals: INVENTORY_TOKENS.UUSD.decimals,
        },
        outputToken: {
          address: outputToken.address,
          symbol: outputToken.symbol,
          decimals: outputToken.decimals,
        },
        direction: "withdraw",
        marketPrice: 1n,
        pegPrice: 1n,
        savings: {
          amount: 0n,
          percentage: 0,
        },
        isEnabled: false,
        disabledReason: "Failed to get CowSwap quote",
      };
    }
    return routeResult;
  }

  async executeTransaction(route: OptimalRouteResult): Promise<EnrichedOrder> {
    if (route.routeType !== "cowswap" || !route.executeCowSwapOrder) {
      throw new Error("Invalid route for CowSwap execution");
    }

    const sellToken = route.inputToken.address;
    const account = this._walletService.getAccount();
    if (!account) {
      throw new Error("Wallet not connected");
    }

    const cowSwapSdk = this.getCowSwapSdk();
    const allowance = await cowSwapSdk.getCowProtocolAllowance({
      tokenAddress: sellToken,
      owner: account,
    });
    if (allowance < route.inputAmount) {
      const txHash = await cowSwapSdk.approveCowProtocol({
        tokenAddress: sellToken,
        amount: route.inputAmount,
      });
      const publicClient = this._walletService.getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    }
    const { orderId } = await route.executeCowSwapOrder();
    return await this.waitForOrderFill(orderId);
  }

  async waitForOrderFill(orderId: string): Promise<EnrichedOrder> {
    const cowSwapSdk = this.getCowSwapSdk();
    let orderStatus = await cowSwapSdk.getOrder({ orderUid: orderId });

    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    while (orderStatus.status === OrderStatus.OPEN) {
      if (Date.now() - startTime > timeout) {
        throw new Error("Timeout waiting for CowSwap order to fill");
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
      orderStatus = await cowSwapSdk.getOrder({ orderUid: orderId });
    }

    if (orderStatus.status === OrderStatus.CANCELLED) {
      throw new Error("CowSwap order was cancelled");
    }
    if (orderStatus.status === OrderStatus.EXPIRED) {
      throw new Error("CowSwap order has expired");
    }
    return orderStatus;
  }
}
