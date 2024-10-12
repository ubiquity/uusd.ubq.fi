import { OrderBookApi, OrderQuoteSideKindSell } from "@cowprotocol/cow-sdk";
import { Token } from "./fetch-tokens";
import { utils } from "ethers";
import { backendAddress, mainnet } from "./constants";
import { appState } from "./main";

const LUSD_ADDRESS = "0x5f98805a4e8be255a32880fdec7f6728c6568ba0";
const UBQ_ADDRESS = "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0";

/**
 * This function will return quotes necessary to swap into a 95% LUSD and 5% UBQ split. 
 * It will be called with our backend address and not the user's.
 * It returns either a quote object or null if the swap is not necessary.
 * @param input The input token object
 * @param inputAmount The amount of input token without decimals
 * @returns Either a quote object or null if the swap is not necessary
 */
export async function quoteSwaps(input: Token, inputAmount: number) {
  const isConnected = appState.getIsConnectedState();
  const selectedChainId = appState.getChainId();

  const orderBookApi = new OrderBookApi({ chainId: mainnet });

  if (!isConnected || !backendAddress) throw Error("User not connected");
  if (selectedChainId !== mainnet) throw Error("Invalid network");

  let quoteLusd = null;
  let quoteUbq = null;

  if (input.address !== LUSD_ADDRESS) {
    const quoteRequestLusd = {
      sellToken: input.address,
      buyToken: LUSD_ADDRESS,
      from: backendAddress,
      receiver: backendAddress,
      sellAmountBeforeFee: utils.parseUnits((0.95 * inputAmount).toString(), input.decimals).toString(),
      kind: OrderQuoteSideKindSell.SELL,
    };

    quoteLusd = (await orderBookApi.getQuote(quoteRequestLusd)).quote;
    console.log("LUSD Quote:", quoteLusd);
  }

  if (input.address !== UBQ_ADDRESS) {
    const quoteRequestUbq = {
      sellToken: input.address,
      buyToken: UBQ_ADDRESS,
      from: backendAddress,
      receiver: backendAddress,
      sellAmountBeforeFee: utils.parseUnits((0.05 * inputAmount).toString(), input.decimals).toString(),
      kind: OrderQuoteSideKindSell.SELL,
    };

    quoteUbq = (await orderBookApi.getQuote(quoteRequestUbq)).quote;
    console.log("UBQ Quote:", quoteUbq);
  }

  // If the input token is LUSD or UBQ that quote will be null and therefore that swap won't happen which means no fees
  return { quoteLusd, quoteUbq };
}