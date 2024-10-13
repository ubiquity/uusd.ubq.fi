import { backendAddress } from "./constants";
import { OrderBookApi, OrderParameters, OrderSigningUtils, SigningScheme, SupportedChainId, UnsignedOrder } from "@cowprotocol/cow-sdk";
import { appState, backendSigner } from "./main";
import { allowance, approve } from "./web3-utils";

export async function executeSwaps(quoteLusd: OrderParameters | null, quoteUbq: OrderParameters | null, slippage: number = 0.01) {
  const selectedChainId = appState.getChainId() as number as SupportedChainId;
  const spender = "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110"; // GPv2VaultRelayer common address for mainnet and sepolia

  const orderBookApi = new OrderBookApi({ chainId: selectedChainId });
  const expirationTime = Math.round((Date.now() + 1_800_000) / 1000); // 30 minutes expiration time

  if (quoteLusd) {
    if (BigInt(await allowance(quoteLusd.sellToken, backendAddress, spender, backendSigner)) < BigInt(quoteLusd.sellAmount)) {
        await approve(quoteLusd.sellToken, spender, quoteLusd.sellAmount, backendSigner);
    }
    console.log("Executing LUSD Order in ", selectedChainId, " with slipagge ", slippage);
    const lusdOrder: UnsignedOrder = {
      ...quoteLusd,
      buyAmount: (parseFloat(quoteLusd.buyAmount) * (1 - slippage)).toString(),
      feeAmount: "0",
      receiver: backendAddress,
      validTo: expirationTime,
      partiallyFillable: false,
    };

    const lusdSignedOrder = await OrderSigningUtils.signOrder(lusdOrder, selectedChainId, backendSigner);
    const lusdOrderId = await orderBookApi.sendOrder({
      ...lusdOrder,
      signingScheme: lusdSignedOrder.signingScheme as string as SigningScheme,
      signature: lusdSignedOrder.signature,
    });
    const order = await orderBookApi.getOrder(lusdOrderId);
    console.log("LUSD Order:", order);
  }

  if (quoteUbq) {
    if(BigInt(await allowance(quoteUbq.sellToken, backendAddress, spender, backendSigner)) < BigInt(quoteUbq.sellAmount)) {
        await approve(quoteUbq.sellToken, spender, quoteUbq.sellAmount, backendSigner);
    }

    console.log("Executing UBQ Order in ", selectedChainId, " with slipagge ", slippage);
    const ubqOrder: UnsignedOrder = {
      ...quoteUbq,
      buyAmount: (parseFloat(quoteUbq.buyAmount) * (1 - slippage)).toString(),
      feeAmount: "0",
      receiver: backendAddress,
      validTo: expirationTime,
      partiallyFillable: false,
    };

    const ubqSignedOrder = await OrderSigningUtils.signOrder(ubqOrder, selectedChainId, backendSigner);
    const ubqOrderId = await orderBookApi.sendOrder({
      ...ubqOrder,
      signingScheme: ubqSignedOrder.signingScheme as string as SigningScheme,
      signature: ubqSignedOrder.signature,
    });
    const order = await orderBookApi.getOrder(ubqOrderId);
    console.log("UBQ Order:", order);
  }

  console.log("Swaps executed successfully!");
}   