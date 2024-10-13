import { OrderBookApi, OrderParameters, OrderQuoteSideKindSell, SupportedChainId } from "@cowprotocol/cow-sdk";
import { Token } from "./types";
import { utils } from "ethers";
import { backendAddress, mainnet, sepolia } from "./constants";
import { appState } from "./main";

const LUSD_MAINNET: Token = {
  symbol: "LUSD",
  name: "LUSD Stablecoin",
  address: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
  decimals: 18,
  chainId: mainnet,
  logoURI: "not-needed",
};

const UBQ_MAINNET: Token = {
  symbol: "UBQ",
  name: "Ubiquity",
  address: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0",
  decimals: 18,
  chainId: mainnet,
  logoURI: "not-needed",
};

const LUSD_SEPOLIA: Token = {
  symbol: "WETH",
  name: "WETH",
  address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  decimals: 18,
  chainId: sepolia,
  logoURI: "not-needed",
};

const UBQ_SEPOLIA: Token = {
  symbol: "WETH",
  name: "WETH",
  address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  decimals: 18,
  chainId: sepolia,
  logoURI: "not-needed",
};

/**
 * Returns the appropriate LUSD and UBQ tokens based on the selected chain.
 */
function getTokensForChain(chainId: number) {
  if (chainId === sepolia) {
    return { LUSD: LUSD_SEPOLIA, UBQ: UBQ_SEPOLIA };
  }
  return { LUSD: LUSD_MAINNET, UBQ: UBQ_MAINNET };
}

/**
 * This function returns swap quotes to convert 95% of input into LUSD and 5% into UBQ.
 */
export async function quoteSwaps(input: Token, inputAmount: number) {
  const isConnected = appState.getIsConnectedState();
  const selectedChainId = appState.getChainId() as number as SupportedChainId;
  const orderBookApi = new OrderBookApi({ chainId: selectedChainId });

  if (!isConnected || !backendAddress) throw new Error("User not connected");
  if (![mainnet, sepolia].includes(selectedChainId)) throw new Error("Invalid network");

  const { LUSD, UBQ } = getTokensForChain(selectedChainId);

  console.log("LUSD,UBQ", LUSD, UBQ);
  let quoteLusd = null;
  let quoteUbq = null;

  if (input.address !== LUSD.address) {
    const quoteRequestLusd = {
      sellToken: input.address,
      buyToken: LUSD.address,
      from: backendAddress,
      receiver: backendAddress,
      sellAmountBeforeFee: utils
        .parseUnits((0.95 * inputAmount).toString(), input.decimals)
        .toString(),
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
      sellAmountBeforeFee: utils
        .parseUnits((0.05 * inputAmount).toString(), input.decimals)
        .toString(),
      kind: OrderQuoteSideKindSell.SELL,
    };
    quoteUbq = (await orderBookApi.getQuote(quoteRequestUbq)).quote;
    console.log("UBQ Quote:", quoteUbq);
  }

  const feesInInputCurrency = await calculateSwapFees(input, quoteLusd, quoteUbq);
  return { quoteLusd, quoteUbq, feesInInputCurrency };
}

/**
 * Calculates the total fees from the given quotes.
 */
export async function calculateSwapFees(
  input: Token,
  quoteLusd: OrderParameters | null,
  quoteUbq: OrderParameters | null
) {
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