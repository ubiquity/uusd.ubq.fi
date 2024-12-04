import { parseUnits, BaseError } from "viem";
import { collectionRedemption, getAllCollaterals, getCollateralInformation, redeemDollar } from "./faucet";
import { allowanceButton, collateralSelect, collectRedemptionButton, dollarInput, minCollateralInput, minGovernanceInput, redeemDollarButton } from "./ui";
import { ToastActions } from "./toast";
import { approveToSpend, getAllowance, getTokenDecimals } from "./erc20";
import { diamondAddress, dollarAddress, ubqAddress } from "./constants";
import { getConnectedClient } from "./connect-wallet";
import { publicClient } from "./shared";

let selectedCollateralIndex = 0;
let dollarAmount = 0;
let governanceOutMin = 0;
let collateralOutMin = 0;
let blockOfRedemption = BigInt(0);

let canDisableButtonsAtIntervals = true;

const collateralRecord: Record<string | number, `0x${string}`> = {};
const toastActions = new ToastActions();

const pathName = "redeem";
const transactionReverted = "transactionReverted";

if (window.location.pathname.includes(pathName)) {
  (() => {
    setInterval(() => {
      const connectedClient = getConnectedClient();

      if (redeemDollarButton !== null && canDisableButtonsAtIntervals) {
        redeemDollarButton.disabled = dollarAmount <= 0 || connectedClient === null || !connectedClient.account;
      }

      if (allowanceButton !== null && canDisableButtonsAtIntervals) allowanceButton.disabled = connectedClient === null || !connectedClient.account;
      if (redeemDollarButton !== null && canDisableButtonsAtIntervals) redeemDollarButton.disabled = connectedClient === null || !connectedClient.account;
    }, 500);
  })();

  void (() => {
    publicClient.watchBlocks({
      onBlock: async (block) => {
        const currentBlock = Number(block.number);
        const connectedClient = getConnectedClient();

        try {
          if (connectedClient) {
            await check(connectedClient);
          }
          const bOfRedemption = Number(blockOfRedemption);

          if (allowanceButton !== null && canDisableButtonsAtIntervals) allowanceButton.disabled = connectedClient === null || !connectedClient.account;
          if (redeemDollarButton !== null && canDisableButtonsAtIntervals) redeemDollarButton.disabled = connectedClient === null || !connectedClient.account;

          if (collectRedemptionButton !== null) {
            collectRedemptionButton.disabled = bOfRedemption === 0 || currentBlock - bOfRedemption < 2;
          }
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
}

async function check(web3Client: ReturnType<typeof getConnectedClient>) {
  const dollarDecimals = await getTokenDecimals(dollarAddress);
  const dAmount = parseUnits(dollarAmount.toString(), dollarDecimals);
  const allowance = web3Client?.account ? await getAllowance(dollarAddress, web3Client.account.address, diamondAddress) : BigInt(0);
  const isAllowed = dAmount > BigInt(0) && allowance >= dAmount;
  updateUiBasedOnAllowance(isAllowed);
}

function updateUiBasedOnAllowance(isAllowed: boolean) {
  if (isAllowed) {
    if (redeemDollarButton !== null && redeemDollarButton.classList.contains("hidden")) {
      redeemDollarButton.classList.remove("hidden");
      redeemDollarButton.classList.add("flex");
    }
    if (allowanceButton !== null && !allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.add("hidden");
      allowanceButton.classList.remove("flex");
    }
  } else {
    if (redeemDollarButton !== null && !redeemDollarButton.classList.contains("hidden")) {
      redeemDollarButton.classList.add("hidden");
      redeemDollarButton.classList.remove("flex");
    }
    if (allowanceButton !== null && allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.remove("hidden");
      allowanceButton.classList.add("flex");
    }
  }
}

export async function initCollateralList() {
  if (collateralSelect !== null && window.location.pathname.includes("redeem")) {
    const collaterals = await getAllCollaterals();
    const collateralInformation = await Promise.all(collaterals.map(getCollateralInformation));
    collateralInformation.forEach((info) => {
      collateralRecord[Number(info.index)] = info.collateralAddress;
    });

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

function updateCollateralIndex() {
  if (collateralSelect !== null) {
    collateralSelect.addEventListener("change", (ev) => {
      selectedCollateralIndex = Number((ev.target as HTMLSelectElement).value);
    });
  }
}

function updateDollarAmounts() {
  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateGovernanceAmount() {
  if (minGovernanceInput !== null) {
    minGovernanceInput.addEventListener("input", (ev) => {
      governanceOutMin = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateCollateralAmount() {
  if (minCollateralInput !== null) {
    minCollateralInput.addEventListener("input", (ev) => {
      collateralOutMin = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateAllowance() {
  if (allowanceButton !== null) {
    allowanceButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        allowanceButton.disabled = true;
        const dollarDecimals = await getTokenDecimals(dollarAddress);
        const allowedToBurnDollar = parseUnits(dollarAmount.toString(), dollarDecimals);
        const txHash = await approveToSpend(dollarAddress, diamondAddress, allowedToBurnDollar);
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully allowed to burn dollar: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }

        allowanceButton.disabled = false;
        canDisableButtonsAtIntervals = true;
      } catch (error) {
        allowanceButton.disabled = false;
        canDisableButtonsAtIntervals = true;
        const err = error as BaseError;
        toastActions.showToast({
          toastType: "error",
          msg: err.shortMessage ?? err.message,
        });
      }
    });
  }
}

function redeem() {
  if (redeemDollarButton !== null) {
    redeemDollarButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        redeemDollarButton.disabled = true;
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const collateralDecimals = await getTokenDecimals(collateralAddress);
        const dollarDecimals = await getTokenDecimals(dollarAddress);
        const governanceDecimals = await getTokenDecimals(ubqAddress);
        const dollarAmountInDecimals = parseUnits(dollarAmount.toString(), dollarDecimals);
        const collateralOutMinInDecimals = parseUnits(collateralOutMin.toString(), collateralDecimals);
        const governanceOutMinInDecimals = parseUnits(governanceOutMin.toString(), governanceDecimals);
        const txHash = await redeemDollar(BigInt(selectedCollateralIndex), dollarAmountInDecimals, governanceOutMinInDecimals, collateralOutMinInDecimals);
        canDisableButtonsAtIntervals = true;
        redeemDollarButton.disabled = false;
        blockOfRedemption = await publicClient.getBlockNumber();
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully redeemed: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }
      } catch (error) {
        canDisableButtonsAtIntervals = true;
        redeemDollarButton.disabled = false;
        const err = error as BaseError;
        toastActions.showToast({
          toastType: "error",
          msg: err.shortMessage ?? err.message,
        });
      }
    });
  }
}

function collectRedemption() {
  if (collectRedemptionButton !== null) {
    collectRedemptionButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        collectRedemptionButton.disabled = true;
        const txHash = await collectionRedemption(BigInt(selectedCollateralIndex));
        canDisableButtonsAtIntervals = true;
        collectRedemptionButton.disabled = false;
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully minted: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }
      } catch (error) {
        canDisableButtonsAtIntervals = true;
        collectRedemptionButton.disabled = false;
        const err = error as BaseError;
        toastActions.showToast({
          toastType: "error",
          msg: err.shortMessage ?? err.message,
        });
      }
    });
  }
}

export async function initUiEvents() {
  if (window.location.pathname.includes(pathName)) {
    updateCollateralIndex();
    updateAllowance();
    updateDollarAmounts();
    updateCollateralAmount();
    updateGovernanceAmount();
    redeem();
    collectRedemption();
  }
}
