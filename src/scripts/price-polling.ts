import { createPublicClient, formatUnits, http, WatchBlocksReturnType } from "viem";
import { mainnet } from "viem/chains";
import { getCollateralUsdBalance, getDollarPriceUsd, getGovernancePriceUsd } from "./faucet";
import { governancePriceText, totalCollateralValueText, uusdPriceText } from "./ui";
import { toSignificantFigures } from "./utils";

const subscriptions: WatchBlocksReturnType[] = [];

export function watchForPrices() {
  if (uusdPriceText !== null && governancePriceText !== null && totalCollateralValueText !== null) {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    const sub0 = publicClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getDollarPriceUsd();
        uusdPriceText.innerText = `$${toSignificantFigures(formatUnits(priceUsd, 6))}`;
      },
    });

    const sub1 = publicClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getGovernancePriceUsd();
        governancePriceText.innerText = `$${toSignificantFigures(formatUnits(priceUsd, 6))}`;
      },
    });

    const sub2 = publicClient.watchBlocks({
      onBlock: async () => {
        const priceUsd = await getCollateralUsdBalance();
        totalCollateralValueText.innerText = `$${toSignificantFigures(formatUnits(priceUsd, 18))}`;
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

export function getPricesOnLaunch() {
  void (async () => {
    if (uusdPriceText !== null && governancePriceText !== null && totalCollateralValueText !== null) {
      const uusdPriceInUsd = await getDollarPriceUsd();
      uusdPriceText.innerText = `$${toSignificantFigures(formatUnits(uusdPriceInUsd, 6))}`;

      const governanceTokenPriceInUsd = await getGovernancePriceUsd();
      governancePriceText.innerText = `$${toSignificantFigures(formatUnits(governanceTokenPriceInUsd, 6))}`;

      const totalCollateralValueInUsd = await getCollateralUsdBalance();
      totalCollateralValueText.innerText = `$${toSignificantFigures(formatUnits(totalCollateralValueInUsd, 18))}`;
    }
  })();
}
