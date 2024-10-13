import { backendAddress, mainnet } from "./constants";
import { OrderBookApi, OrderParameters, OrderSigningUtils, SigningScheme, UnsignedOrder } from "@cowprotocol/cow-sdk";
import { backendSigner } from "./main";

export async function executeSwaps(quoteLusd: OrderParameters | null, quoteUbq: OrderParameters | null) {

    const orderBookApi = new OrderBookApi({ chainId: mainnet });

    if(quoteLusd){
        const lusdOrder: UnsignedOrder = {
            ...quoteLusd,
            receiver: backendAddress,
            validTo: Math.round((Date.now() + 200_000) / 1000),
            partiallyFillable: false,
        };

        const lusdSignedOrder = await OrderSigningUtils.signOrder(lusdOrder, mainnet, backendSigner);
        const lusdOrderId = await orderBookApi.sendOrder({ ...lusdOrder, signingScheme: lusdSignedOrder.signingScheme as string as SigningScheme, signature: lusdSignedOrder.signature});
    }
    
    if(quoteUbq){
        const ubqOrder: UnsignedOrder = {
            ...quoteUbq,
            receiver: backendAddress,
            validTo: Math.round((Date.now() + 200_000) / 1000),
            partiallyFillable: false,
        };

        const ubqSignedOrder = await OrderSigningUtils.signOrder(ubqOrder, mainnet, backendSigner)
        const ubqOrderId = await orderBookApi.sendOrder({ ...ubqOrder, signingScheme: ubqSignedOrder.signingScheme as string as SigningScheme, signature: ubqSignedOrder.signature});
    }
}
