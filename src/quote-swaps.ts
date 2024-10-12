import { OrderBookApi, OrderQuoteSideKindSell } from "@cowprotocol/cow-sdk";
import { Token } from "./fetch-tokens";
import { utils } from "ethers";
import { mainnet } from "./constants";
import { appState } from "./main";

export async function quoteSwaps(input: Token, inputAmount: number) {
  const isConnected = appState.getIsConnectedState();
  const address = appState.getAddress();
  const selectedChainId = appState.getChainId();

  const orderBookApi = new OrderBookApi({ chainId: mainnet });

  if (!isConnected || !address) throw Error("User not connected");
  if (selectedChainId !== mainnet) throw Error("Invalid network");

  // 95% of input amount to LUSD
  let quoteRequest = {
    sellToken: input.address,
    buyToken: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", // LUSD
    from: address,
    receiver: address,
    sellAmountBeforeFee: utils.parseUnits((0.95 * inputAmount).toString(), input.decimals).toString(),
    kind: OrderQuoteSideKindSell.SELL,
  };

  const { quote: quoteLusd } = await orderBookApi.getQuote(quoteRequest);
  console.log("LUSD:", quoteLusd);

  // 5% of input amount to UBQ
  quoteRequest = {
    sellToken: input.address,
    buyToken: "0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0", // UBQ
    from: address,
    receiver: address,
    sellAmountBeforeFee: utils.parseUnits((0.05 * inputAmount).toString(), input.decimals).toString(),
    kind: OrderQuoteSideKindSell.SELL,
  };

  const { quote: quoteUbq } = await orderBookApi.getQuote(quoteRequest);
  console.log("UBQ:", quoteUbq);

  return { quoteLusd, quoteUbq };
}