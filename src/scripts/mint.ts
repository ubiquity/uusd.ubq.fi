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

let selectedCollateral: `0x${string}` | null = null;
let dollarAmount = 0;
let dollarOutMin = 0;
let maxCollateralIn = 0;
let maxGovernanceIn = 0;
let isOneToOne = true;

// Variable to track collateral spend allowance, and render UI appropriately
let collateralSpendAllowance = BigInt(0);

// Variable to track ubq spend allowance
let ubqSpendAllowance = BigInt(0);

// Track collateral decimals
let collateralDecimals = 18;

// Track governance decimals
let governanceDecimals = 18;

// Track dollar decimals
let dollarDecimals = 18;

const collateralRecord: Record<string, bigint> = {};
const toastActions = new ToastActions();

const pathName = "mint";
const transactionReverted = "Transaction was reverted";

let canDisableButtonsAtIntervals = true;

if (window.location.pathname.includes(pathName)) {
  (() => {
    setInterval(async () => {
      checkAndUpdateUi();
    }, 50);
  })();
}

function checkAndUpdateUi() {
  // Check allowance
  const maxCollatIn = parseUnits(maxCollateralIn.toString(), collateralDecimals);
  const maxGovernIn = parseUnits(maxGovernanceIn.toString(), governanceDecimals);
  const isAllowed = collateralSpendAllowance > BigInt(0) && collateralSpendAllowance >= maxCollatIn && (!isOneToOne ? ubqSpendAllowance >= maxGovernIn : true);
  updateUiBasedOnAllowance(isAllowed);

  const web3Client = getConnectedClient();
  const isValidInputs = dollarAmount > 0;

  if (allowanceButton !== null && canDisableButtonsAtIntervals)
    allowanceButton.disabled = web3Client === null || !selectedCollateral || !web3Client.account || isAllowed || !isValidInputs;
  if (mintButton !== null && canDisableButtonsAtIntervals)
    mintButton.disabled = web3Client === null || !selectedCollateral || !web3Client.account || !isAllowed || !isValidInputs;

  const appendableText = "+UBQ";
  if (!isOneToOne) {
    if (!allowanceButton.innerText.includes(appendableText)) allowanceButton.innerText = allowanceButton.innerText.concat(appendableText);
  } else {
    allowanceButton.innerText = allowanceButton.innerText.replace(appendableText, "");
  }
}

async function checkAllowance() {
  const web3Client = getConnectedClient();

  if (web3Client && web3Client.account) {
    if (selectedCollateral) collateralSpendAllowance = await getAllowance(selectedCollateral, web3Client.account.address, diamondAddress);
    ubqSpendAllowance = await getAllowance(ubqAddress, web3Client.account.address, diamondAddress);
  }
}

async function loadGovernanceDecimals() {
  governanceDecimals = await getTokenDecimals(ubqAddress);
}

async function loadCollateralDecimals() {
  if (selectedCollateral) collateralDecimals = await getTokenDecimals(selectedCollateral);
}

async function loadDollarDecimals() {
  dollarDecimals = await getTokenDecimals(dollarAddress);
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
      collateralRecord[info.collateralAddress] = info.index;
    });

    const options = collateralInformation.map((info) => {
      const option = document.createElement("option");

      option.value = info.collateralAddress;
      option.innerText = info.symbol;

      collateralRecord;

      return option;
    });

    options.forEach((option) => {
      collateralSelect.appendChild(option);
    });
  }
}

function updateSelectedCollateral() {
  if (collateralSelect !== null) {
    collateralSelect.addEventListener("change", async (ev) => {
      selectedCollateral = (ev.target as HTMLSelectElement).value as `0x${string}`;
      await loadCollateralDecimals();
      await checkAllowance();
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
      maxGovernanceIn = Number((ev.target as HTMLInputElement).value);
    });
  }
}

function updateDollarAmounts() {
  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value);
    });
  }

  if (minDollarInput !== null) {
    minDollarInput.addEventListener("input", (ev) => {
      dollarOutMin = Number((ev.target as HTMLInputElement).value);
    });
  }
}

function updateCollateralAmount() {
  if (collateralInput !== null) {
    collateralInput.addEventListener("input", (ev) => {
      maxCollateralIn = Number((ev.target as HTMLInputElement).value);
    });
  }
}

function updateAllowance() {
  if (allowanceButton !== null) {
    allowanceButton.addEventListener("click", async () => {
      try {
        if (!selectedCollateral) return;

        canDisableButtonsAtIntervals = false;
        allowanceButton.disabled = true;

        const allowedToSpendCollateral = parseUnits(maxCollateralIn.toString(), collateralDecimals);

        if (allowedToSpendCollateral > collateralSpendAllowance) {
          const collateralSpendtxHash = await approveToSpend(selectedCollateral, diamondAddress, allowedToSpendCollateral);
          const transactionReceiptForCollateralSpendApproval = await publicClient.waitForTransactionReceipt({ hash: collateralSpendtxHash });

          if (transactionReceiptForCollateralSpendApproval.status === "success") {
            collateralSpendAllowance = allowedToSpendCollateral;

            toastActions.showToast({
              toastType: "success",
              msg: `Successfully allowed to spend collateral: <a href="https://etherscan.io/tx/${collateralSpendtxHash}" target="_blank">View on explorer</a>`,
            });
          } else {
            throw new Error(transactionReverted);
          }
        }

        if (!isOneToOne) {
          const allowedToSpendUbq = parseUnits(maxGovernanceIn.toString(), governanceDecimals);

          if (allowedToSpendUbq > ubqSpendAllowance) {
            const ubqSpendtxHash = await approveToSpend(ubqAddress, diamondAddress, allowedToSpendUbq);
            const transactionReceiptForUbqSpendApproval = await publicClient.waitForTransactionReceipt({ hash: ubqSpendtxHash });

            if (transactionReceiptForUbqSpendApproval.status === "success") {
              ubqSpendAllowance = allowedToSpendUbq;
              toastActions.showToast({
                toastType: "success",
                msg: `Successfully allowed to spend collateral: <a href="https://etherscan.io/tx/${ubqSpendtxHash}" target="_blank">View on explorer</a>`,
              });
            } else {
              throw new Error(transactionReverted);
            }
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
        if (!selectedCollateral) return;

        canDisableButtonsAtIntervals = false;
        mintButton.disabled = true;

        const allowedToSpend = parseUnits(maxCollateralIn.toString(), collateralDecimals);
        const dollarAmountInDecimals = parseUnits(dollarAmount.toString(), dollarDecimals);
        const dollarOutInDecimals = parseUnits(dollarOutMin.toString(), dollarDecimals);
        const governanceAmountInDecimals = parseUnits(maxGovernanceIn.toString(), governanceDecimals);
        const txHash = await mintDollar(
          collateralRecord[selectedCollateral],
          dollarAmountInDecimals,
          dollarOutInDecimals,
          allowedToSpend,
          governanceAmountInDecimals,
          isOneToOne
        );
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          collateralSpendAllowance = collateralSpendAllowance - allowedToSpend;
          ubqSpendAllowance = ubqSpendAllowance - governanceAmountInDecimals;

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
    void loadGovernanceDecimals();
    void loadDollarDecimals();
    updateSelectedCollateral();
    updateOneToOne();
    updateAllowance();
    updateCollateralAmount();
    updateSelectedCollateral();
    updateDollarAmounts();
    updateGovernanceAmount();
    mint();
  }
}
