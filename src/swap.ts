import { backendAddress } from "./constants";
import { OrderBookApi, OrderParameters, OrderSigningUtils, SigningScheme, SupportedChainId, UnsignedOrder } from "@cowprotocol/cow-sdk";
import { appState, backendSigner } from "./main";
import { approve, balanceOf } from "./web3-utils";

export async function executeSwaps(quoteLusd: OrderParameters | null, quoteUbq: OrderParameters | null) {
    const selectedChainId = appState.getChainId() as number as SupportedChainId;
    const spender = "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110"; // GPv2VaultRelayer common address for mainnet and sepolia

    const orderBookApi = new OrderBookApi({ chainId: selectedChainId});

    if(quoteLusd){
        await approve(quoteLusd.sellToken, spender, quoteLusd.sellAmount, backendSigner);
        
        console.log("Executing LUSD Order in ", selectedChainId, " ...");
        const lusdOrder: UnsignedOrder = {
            ...quoteLusd,
            feeAmount: "0",
            receiver: backendAddress,
            validTo: Math.round((Date.now() + 200_000) / 1000),
            partiallyFillable: false,
        };

        const lusdSignedOrder = await OrderSigningUtils.signOrder(lusdOrder, selectedChainId, backendSigner)
        const lusdOrderId = await orderBookApi.sendOrder({ ...lusdOrder, signingScheme: lusdSignedOrder.signingScheme as string as SigningScheme, signature: lusdSignedOrder.signature});
        const order = await orderBookApi.getOrder(lusdOrderId);
        console.log("LUSD Order:", order);}
    
    if(quoteUbq){
        await approve(quoteUbq.sellToken, spender, quoteUbq.sellAmount, backendSigner);

        console.log("Executing UBQ Order in ", selectedChainId, " ...");
        const ubqOrder: UnsignedOrder = {
            ...quoteUbq,
            feeAmount: "0",
            receiver: backendAddress,
            validTo: Math.round((Date.now() + 200_000) / 1000),
            partiallyFillable: false,
        };

        const ubqSignedOrder = await OrderSigningUtils.signOrder(ubqOrder, selectedChainId, backendSigner)
        const ubqOrderId = await orderBookApi.sendOrder({ ...ubqOrder, signingScheme: ubqSignedOrder.signingScheme as string as SigningScheme, signature: ubqSignedOrder.signature});
        const order = await orderBookApi.getOrder(ubqOrderId);
        console.log("UBQ Order:", order);
    }

    console.log("Swaps executed successfully!");
}