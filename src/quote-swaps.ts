import { OrderBookApi, SupportedChainId, OrderQuoteSideKindSell } from "@cowprotocol/cow-sdk";
import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { Token } from "./fetch-tokens";
import { utils } from "ethers";

const chainId = SupportedChainId.MAINNET;

export async function quoteSwaps(input: Token, inputAmount: number) {
  const { address, isConnected } = useAppKitAccount();
  const { chainId: selectedChainId } = useAppKitNetwork();
  const orderBookApi = new OrderBookApi({ chainId });

  if (!isConnected || !address) throw Error("User not connected");
  if (chainId !== selectedChainId) throw Error("Invalid network");

  // 95% of input amount to LUSD
  let quoteRequest = {
    sellToken: input.address,
    buyToken: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", // LUSD
    from: address,
    receiver: address,
    sellAmountBeforeFee: utils.parseUnits((0.95 * inputAmount).toString(), input.decimals).toString(),
    kind: OrderQuoteSideKindSell.SELL,
  };
  console.log("LUSD req body: ", quoteRequest);

  try {
    const { quote: quoteLusd } = await orderBookApi.getQuote(quoteRequest);
    console.log("LUSD:", quoteLusd);
  } catch (error) {
    console.error("Error during the process:", error);
  }
  // 5% of input amount to UBQ
  quoteRequest = {
    sellToken: input.address,
    buyToken: "0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0", // UBQ
    from: address,
    receiver: address,
    sellAmountBeforeFee: utils.parseUnits((0.05 * inputAmount).toString(), input.decimals).toString(),
    kind: OrderQuoteSideKindSell.SELL,
  };

  console.log("UBQ req body: ", quoteRequest);

  const { quote: quoteUbq } = await orderBookApi.getQuote(quoteRequest);
  console.log("UBQ:", quoteUbq);
}
