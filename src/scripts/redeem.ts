import { type WriteContractErrorType, createPublicClient, http, parseUnits } from "viem";
import { collectionRedemption, getAllCollaterals, getCollateralInformation, redeemDollar } from "./faucet";
import { collateralSelect, collectRedemptionButton, dollarInput, redeemDollarButton } from "./ui";
import { mainnet } from "viem/chains";
import { ToastActions } from "./toast";

let selectedCollateralIndex = 0;
let dollarAmount = 0;
let blockOfRedemption = BigInt(0);

const toastActions = new ToastActions();
const pubClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

(() => {
  setInterval(() => {
    if (redeemDollarButton !== null) {
      redeemDollarButton.disabled = dollarAmount <= 0;
    }
  }, 500);
})();

void (async () => {
  pubClient.watchBlocks({
    onBlock: async (block) => {
      const currentBlock = Number(block.number);
      toastActions.showToast({
        toastType: "info",
        msg: `New block mined: ${currentBlock}`,
      });

      try {
        const bOfRedemption = Number(blockOfRedemption);
        collectRedemptionButton.disabled = bOfRedemption === 0 || currentBlock - bOfRedemption < 2;
      } catch (error) {
        const err = error as Error;
        toastActions.showToast({
          toastType: "error",
          msg: err.message,
        });
      }
    },
  });
})();

export async function initCollateralList() {
  if (collateralSelect !== null) {
    const collaterals = await getAllCollaterals();
    const collateralInformation = await Promise.all(collaterals.map(getCollateralInformation));

    const options = collateralInformation.map((info) => {
      const option = document.createElement("option");

      option.value = String(info.index);
      option.innerText = info.symbol;

      return option;
    });

    options.forEach((option) => {
      collateralSelect.appendChild(option);
    });
  }
}

export async function initUiEvents() {
  if (collateralSelect !== null) {
    collateralSelect.addEventListener("change", (ev) => {
      selectedCollateralIndex = Number((ev.target as HTMLSelectElement).value);
    });
  }

  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (redeemDollarButton !== null) {
    redeemDollarButton.addEventListener("click", async () => {
      try {
        redeemDollarButton.disabled = true;
        const dollarAmountBi = parseUnits(dollarAmount.toString(), 18);
        const txHash = await redeemDollar(BigInt(selectedCollateralIndex), dollarAmountBi);
        redeemDollarButton.disabled = false;
        blockOfRedemption = await pubClient.getBlockNumber();
        toastActions.showToast({
          toastType: "success",
          msg: `Successfully redeemed: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
        });
      } catch (error) {
        redeemDollarButton.disabled = false;
        const err = error as WriteContractErrorType;
        toastActions.showToast({
          toastType: "error",
          msg: err.name,
        });
      }
    });
  }

  if (collectRedemptionButton !== null) {
    collectRedemptionButton.addEventListener("click", async () => {
      try {
        collectRedemptionButton.disabled = true;
        const txHash = await collectionRedemption(BigInt(selectedCollateralIndex));
        collectRedemptionButton.disabled = false;
        toastActions.showToast({
          toastType: "success",
          msg: `Successfully collected redemption: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
        });
      } catch (error) {
        collectRedemptionButton.disabled = false;
        const err = error as WriteContractErrorType;
        toastActions.showToast({
          toastType: "error",
          msg: err.name,
        });
      }
    });
  }
}
