import { createPublicClient, formatUnits, http, WatchBlocksReturnType } from "viem";
import { mainnet } from "viem/chains";
import { getCollateralUsdBalance, getDollarPriceUsd, getGovernancePriceUsd } from "./faucet";
import { governancePriceText, totalCollateralValueText, uusdPriceText } from "./ui";
import { toSf } from "./utils";

const subscriptions: WatchBlocksReturnType[] = [];

export function watchForPrices() {
  if (uusdPriceText !== null && governancePriceText !== null && totalCollateralValueText !== null) {
    const pubClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    const sub0 = pubClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getDollarPriceUsd();
        uusdPriceText.innerText = `$${toSf(formatUnits(priceUsd, 6))}`;
      },
    });

    const sub1 = pubClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getGovernancePriceUsd();
        governancePriceText.innerText = `$${toSf(formatUnits(priceUsd, 6))}`;
      },
    });

    const sub2 = pubClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getCollateralUsdBalance();
        totalCollateralValueText.innerText = `$${toSf(formatUnits(priceUsd, 6))}`;
      },
    });

    subscriptions.push(sub0, sub1, sub2);
  }
}

export function unwatchForPrices() {
  subscriptions.forEach((v) => {
    v();
  });
}
