import { OrderBookApi, OrderParameters, OrderQuoteSideKindSell } from "@cowprotocol/cow-sdk";
import { Token } from "./fetch-tokens";
import { utils } from "ethers";
import { backendAddress, mainnet } from "./constants";
import { appState } from "./main";

const LUSD: Token = {
    symbol: "LUSD",
    name: "LUSD Stablecoin",
    address: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
    decimals: 18,
    chainId: mainnet,
    logoURI: "not-needed",
};

const UBQ: Token = {
    symbol: "UBQ",
    name: "Ubiquity",
    address: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0",
    decimals: 18,
    chainId: mainnet,
    logoURI: "not-needed",
};

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

  if (input.address !== LUSD.address) {
    const quoteRequestLusd = {
      sellToken: input.address,
      buyToken: LUSD.address,
      from: backendAddress,
      receiver: backendAddress,
      sellAmountBeforeFee: utils.parseUnits((0.95 * inputAmount).toString(), input.decimals).toString(),
      kind: OrderQuoteSideKindSell.SELL,
    };

    quoteLusd = (await orderBookApi.getQuote(quoteRequestLusd)).quote;
    console.log("LUSD Quote:", quoteLusd);
  }

  if (input.address !== UBQ.address) {
    const quoteRequestUbq = {
      sellToken: input.address,
      buyToken: UBQ.address,
      from: backendAddress,
      receiver: backendAddress,
      sellAmountBeforeFee: utils.parseUnits((0.05 * inputAmount).toString(), input.decimals).toString(),
      kind: OrderQuoteSideKindSell.SELL,
    };

    quoteUbq = (await orderBookApi.getQuote(quoteRequestUbq)).quote;
    console.log("UBQ Quote:", quoteUbq);
  }

  // If the input token is LUSD or UBQ that quote will be null and therefore that swap won't happen which means no fees
  const feesInInputCurrency = calculateSwapFees(input,quoteLusd, quoteUbq);

  return { quoteLusd, quoteUbq, feesInInputCurrency};
}

/**
 * This function will calculate the swap fees with the given quotes.
 * @param quoteLusd The quote for the LUSD swap (can be null)
 * @param quoteUbq The quote for the UBQ swap   (can be null)
 * @returns The total fees in the input token's currency
 */
export async function calculateSwapFees(input : Token, quoteLusd: OrderParameters | null, quoteUbq: OrderParameters | null) {
    let fees = 0;
    if (quoteLusd) {
        const lusdFee = utils.formatUnits(quoteLusd.feeAmount, input.decimals);
        console.log("LUSD Fee:", lusdFee);
        fees += parseFloat(lusdFee);
    }
    
    if (quoteUbq) {
        const ubqFee = utils.formatUnits(quoteUbq.feeAmount, input.decimals);
        console.log("UBQ Fee:", ubqFee);
        fees += parseFloat(ubqFee);
    }

    console.log("Total Fees:", fees);
    return fees;
}