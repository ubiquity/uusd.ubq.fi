import { BaseError, parseUnits } from "viem";
import { getAllCollaterals, getCollateralInformation, mintDollar } from "./faucet";
import {
  allowanceButton,
  collateralInput,
  collateralSelect,
  dollarInput,
  governanceCheckBox,
  governanceFormControl,
  governanceInput,
  minDollarInput,
  mintButton,
} from "./ui";
import { approveToSpend, getAllowance, getTokenDecimals } from "./erc20";
import { getConnectedClient } from "./connect-wallet";
import { diamondAddress as diamond, dollarAddress as dollar, ubqAddress as ubq } from "./constants.json";
import { ToastActions } from "./toast";
import { publicClient } from "./shared";

const diamondAddress = diamond as `0x${string}`;
const dollarAddress = dollar as `0x${string}`;
const ubqAddress = ubq as `0x${string}`;

let selectedCollateralIndex = 0;
let dollarAmount = 0;
let dollarOutMin = 0;
let maxCollateralIn = 0;
let maxGovernanceIn = 0;
let isOneToOne = true;

const collateralRecord: Record<string | number, `0x${string}`> = {};
const toastActions = new ToastActions();

const pathName = "mint";
const transactionReverted = "Transaction was reverted";

let canDisableButtonsAtIntervals = true;

if (window.location.pathname.includes(pathName)) {
  (() => {
    setInterval(() => {
      const collateralAddress = collateralRecord[selectedCollateralIndex];
      const web3Client = getConnectedClient();

      if (allowanceButton !== null && canDisableButtonsAtIntervals) allowanceButton.disabled = web3Client === null || !collateralAddress || !web3Client.account;
      if (mintButton !== null && canDisableButtonsAtIntervals) mintButton.disabled = web3Client === null || !collateralAddress || !web3Client.account;

      const appendableText = "+UBQ";
      if (!isOneToOne) {
        if (!allowanceButton.innerText.includes(appendableText)) allowanceButton.innerText = allowanceButton.innerText.concat(appendableText);
      } else {
        allowanceButton.innerText = allowanceButton.innerText.replace(appendableText, "");
      }
    }, 500);
  })();

  void (() => {
    publicClient.watchBlocks({
      onBlock: async () => {
        try {
          const collateralAddress = collateralRecord[selectedCollateralIndex];
          const web3Client = getConnectedClient();

          if (collateralAddress && web3Client && web3Client.account) {
            await check(collateralAddress, web3Client);
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

async function check(collateralAddress: `0x${string}`, web3Client: ReturnType<typeof getConnectedClient>) {
  const collateralDecimals = await getTokenDecimals(collateralAddress);
  const governanceDecimals = await getTokenDecimals(ubqAddress);
  const maxCollatIn = parseUnits(maxCollateralIn.toString(), collateralDecimals);
  const maxGovernIn = parseUnits(maxGovernanceIn.toString(), governanceDecimals);
  const allowance0 = web3Client?.account ? await getAllowance(collateralAddress, web3Client.account.address, diamondAddress) : BigInt(0);
  const allowance1 = web3Client?.account ? await getAllowance(ubqAddress, web3Client.account.address, diamondAddress) : BigInt(0);
  const isAllowed = maxCollatIn > BigInt(0) && allowance0 >= maxCollatIn && (!isOneToOne ? maxGovernIn > BigInt(0) && allowance1 >= maxGovernIn : true);
  updateUiBasedOnAllowance(isAllowed);
}

function updateUiBasedOnAllowance(isAllowed: boolean) {
  if (isAllowed) {
    if (mintButton !== null && mintButton.classList.contains("hidden")) {
      mintButton.classList.remove("hidden");
      mintButton.classList.add("flex");
    }
    if (allowanceButton !== null && !allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.add("hidden");
      allowanceButton.classList.remove("flex");
    }
  } else {
    if (mintButton !== null && !mintButton.classList.contains("hidden")) {
      mintButton.classList.add("hidden");
      mintButton.classList.remove("flex");
    }
    if (allowanceButton !== null && allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.remove("hidden");
      allowanceButton.classList.add("flex");
    }
  }
}

export async function initCollateralList() {
  if (collateralSelect !== null && window.location.pathname.includes("mint")) {
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

function updateOneToOne() {
  if (governanceCheckBox !== null) {
    governanceCheckBox.addEventListener("click", (ev) => {
      setTimeout(() => {
        isOneToOne = !(ev.target as HTMLInputElement).checked;

        if (governanceFormControl !== null) {
          if (isOneToOne) {
            governanceFormControl.classList.add("hidden");
            governanceFormControl.classList.remove("flex");
          } else {
            governanceFormControl.classList.remove("hidden");
            governanceFormControl.classList.add("flex");
          }
        }
      }, 500);
    });
  }
}

function updateGovernanceAmount() {
  if (governanceInput !== null) {
    governanceInput.addEventListener("input", (ev) => {
      maxGovernanceIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateDollarAmounts() {
  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (minDollarInput !== null) {
    minDollarInput.addEventListener("input", (ev) => {
      dollarOutMin = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateCollateralAmount() {
  if (collateralInput !== null) {
    collateralInput.addEventListener("input", (ev) => {
      maxCollateralIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}

function updateAllowance() {
  if (allowanceButton !== null) {
    allowanceButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        allowanceButton.disabled = true;
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const collateralDecimals = await getTokenDecimals(collateralAddress);
        const allowedToSpendCollateral = parseUnits(maxCollateralIn.toString(), collateralDecimals);
        const collateralSpendtxHash = await approveToSpend(collateralAddress, diamondAddress, allowedToSpendCollateral);
        const transactionReceiptForCollateralSpendApproval = await publicClient.waitForTransactionReceipt({ hash: collateralSpendtxHash });

        if (transactionReceiptForCollateralSpendApproval.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully allowed to spend collateral: <a href="https://etherscan.io/tx/${collateralSpendtxHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }

        if (!isOneToOne) {
          const ubqDecimals = await getTokenDecimals(ubqAddress);
          const allowedToSpendUbq = parseUnits(maxGovernanceIn.toString(), ubqDecimals);
          const ubqSpendtxHash = await approveToSpend(ubqAddress, diamondAddress, allowedToSpendUbq);
          const transactionReceiptForUbqSpendApproval = await publicClient.waitForTransactionReceipt({ hash: ubqSpendtxHash });

          if (transactionReceiptForUbqSpendApproval.status === "success") {
            toastActions.showToast({
              toastType: "success",
              msg: `Successfully allowed to spend collateral: <a href="https://etherscan.io/tx/${ubqSpendtxHash}" target="_blank">View on explorer</a>`,
            });
          } else {
            throw new Error(transactionReverted);
          }
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

function mint() {
  if (mintButton !== null) {
    mintButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        mintButton.disabled = true;
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const collateralDecimals = await getTokenDecimals(collateralAddress);
        const dollarDecimals = await getTokenDecimals(dollarAddress);
        const governanceDecimals = await getTokenDecimals(ubqAddress);
        const allowedToSpend = parseUnits(maxCollateralIn.toString(), collateralDecimals);
        const dollarAmountInDecimals = parseUnits(dollarAmount.toString(), dollarDecimals);
        const dollarOutInDecimals = parseUnits(dollarOutMin.toString(), dollarDecimals);
        const governanceAmountInDecimals = parseUnits(maxGovernanceIn.toString(), governanceDecimals);
        const txHash = await mintDollar(
          BigInt(selectedCollateralIndex),
          dollarAmountInDecimals,
          dollarOutInDecimals,
          allowedToSpend,
          governanceAmountInDecimals,
          isOneToOne
        );
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully minted: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }
        canDisableButtonsAtIntervals = true;
        mintButton.disabled = false;
      } catch (error) {
        mintButton.disabled = false;
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

export async function initUiEvents() {
  if (window.location.pathname.includes(pathName)) {
    updateCollateralIndex();
    updateOneToOne();
    updateAllowance();
    updateCollateralAmount();
    updateCollateralIndex();
    updateDollarAmounts();
    updateGovernanceAmount();
    mint();
  }
}
