import { parseUnits, BaseError } from "viem";
import { collectionRedemption, getAllCollaterals, getCollateralInformation, redeemDollar } from "./faucet";
import {
  allowanceButton,
  collateralFormControl,
  dollarFormControl,
  collateralSelect,
  collectRedemptionButton,
  dollarInput,
  governanceFormControl,
  minCollateralInput,
  minGovernanceInput,
  redeemDollarButton,
} from "./ui";
import { ToastActions } from "./toast";
import { approveToSpend, getTokenDecimals } from "./erc20";
import { diamondAddress as diamond, dollarAddress as dollar, ubqAddress as ubq } from "./constants.json";
import { getConnectedClient } from "./connect-wallet";
import { publicClient } from "./shared";
import milliseconds from "mocha/lib/ms";

const diamondAddress = diamond as `0x${string}`;
const dollarAddress = dollar as `0x${string}`;
const ubqAddress = ubq as `0x${string}`;

let selectedCollateral: `0x${string}` | null = null;
let dollarAmount = 0;
let governanceOutMin = 0;
let collateralOutMin = 0;
let blockOfRedemption = BigInt(0);

let canDisableButtonsAtIntervals = true;

// Track dollar decimals
let dollarDecimals = 18;

// Track governance decimals
let governanceDecimals = 18;

// Track collateral decimals
let collateralDecimals = 18;

// Track dollar spend allowance
let dollarSpendAllowance = BigInt(0);

const collateralRecord: Record<string, bigint> = {};
const toastActions = new ToastActions();

const pathName = "redeem";
const transactionReverted = "transactionReverted";

if (window.location.pathname.includes(pathName)) {
  void (() => {
    publicClient.watchBlocks({
      onBlock: async (block) => {
        try {
          if (collectRedemptionButton !== null) {
            collectRedemptionButton.disabled = blockOfRedemption === BigInt(0) || block.number - blockOfRedemption < BigInt(2);
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

async function loadDollarDecimals() {
  dollarDecimals = await getTokenDecimals(dollarAddress);
}

async function loadGovernanceDecimals() {
  governanceDecimals = await getTokenDecimals(ubqAddress);
}

async function loadCollateralDecimals() {
  if (selectedCollateral) collateralDecimals = await getTokenDecimals(selectedCollateral);
}

function checkAndUpdateUi() {
  const connectedClient = getConnectedClient();

  const dAmount = parseUnits(dollarAmount.toString(), dollarDecimals);
  const isAllowed = dAmount > BigInt(0) && dollarSpendAllowance >= dAmount;

  const isValidInputs = dollarAmount > 0;

  updateUiBasedOnAllowance(isAllowed);

  if (allowanceButton !== null && canDisableButtonsAtIntervals)
    allowanceButton.disabled = connectedClient === null || !connectedClient.account || isAllowed || !selectedCollateral || !isValidInputs;
  if (redeemDollarButton !== null && canDisableButtonsAtIntervals)
    redeemDollarButton.disabled = connectedClient === null || !connectedClient.account || !isAllowed || !selectedCollateral || !isValidInputs;

  if(!allowanceButton.disabled)
    allowanceButton.classList.add("btn-primary");

    if(!redeemDollarButton.disabled)
    redeemDollarButton.classList.add("btn-primary");

  if (selectedCollateral !== null)
    collateralSelect.classList.add("select-primary");

  if (dollarAmount > 0)
    dollarFormControl.classList.add("input-primary");
  
  if (governanceOutMin > 0)
    governanceFormControl.classList.add("input-primary");

  if (collateralOutMin > 0)
    collateralFormControl.classList.add("input-primary");
    
}

function changeComponentsStateOnAllowanceRequired() {
  if (redeemDollarButton !== null && !redeemDollarButton.classList.contains("hidden")) {
    redeemDollarButton.classList.add("hidden");
    redeemDollarButton.classList.remove("flex");
  }
  if (allowanceButton !== null && allowanceButton.classList.contains("hidden")) {
    allowanceButton.classList.remove("hidden");
    allowanceButton.classList.add("flex");
  }

  const className = "input-primary";
  const replacementClass = "input-ghost";
  collateralFormControl.classList.replace(className, replacementClass);
  governanceFormControl.classList.replace(className, replacementClass);
  dollarFormControl.classList.replace(className, replacementClass);
}

function changeComponentsStateOnEnoughAllowance() {
  if (redeemDollarButton !== null && redeemDollarButton.classList.contains("hidden")) {
    redeemDollarButton.classList.remove("hidden");
    redeemDollarButton.classList.add("flex");
  }
  if (allowanceButton !== null && !allowanceButton.classList.contains("hidden")) {
    allowanceButton.classList.add("hidden");
    allowanceButton.classList.remove("flex");
  }

  const className = "input-ghost";
  const replacementClass = "input-primary";
  collateralFormControl.classList.replace(className, replacementClass);
  governanceFormControl.classList.replace(className, replacementClass);
  dollarFormControl.classList.replace(className, replacementClass);
}

function updateUiBasedOnAllowance(isAllowed: boolean) {
  if (isAllowed) {
    changeComponentsStateOnEnoughAllowance();
  } else {
    changeComponentsStateOnAllowanceRequired();
  }
}

export async function initCollateralList() {
  if (collateralSelect !== null && window.location.pathname.includes("redeem")) {
    const collaterals = await getAllCollaterals();
    const collateralInformation = await Promise.all(collaterals.map(getCollateralInformation));
    collateralInformation.forEach((info) => {
      collateralRecord[info.collateralAddress] = info.index;
    });

    const options = collateralInformation.map((info) => {
      const option = document.createElement("option");

      option.value = info.collateralAddress;
      option.innerText = info.symbol;

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
      checkAndUpdateUi();
    });
  }
}

function updateDollarAmounts() {
  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value);
      checkAndUpdateUi();
    });
  }
}

function updateGovernanceAmount() {
  if (minGovernanceInput !== null) {
    minGovernanceInput.addEventListener("input", (ev) => {
      governanceOutMin = Number((ev.target as HTMLInputElement).value);
      checkAndUpdateUi();
    });
  }
}

function updateCollateralAmount() {
  if (minCollateralInput !== null) {
    minCollateralInput.addEventListener("input", (ev) => {
      collateralOutMin = Number((ev.target as HTMLInputElement).value);
      checkAndUpdateUi();
    });
  }
}

function updateAllowance() {
  if (allowanceButton !== null) {
    allowanceButton.addEventListener("click", async () => {
      try {
        canDisableButtonsAtIntervals = false;
        allowanceButton.disabled = true;
        const allowedToBurnDollar = parseUnits(dollarAmount.toString(), dollarDecimals);

        if (allowedToBurnDollar > dollarSpendAllowance) {
          const txHash = await approveToSpend(dollarAddress, diamondAddress, allowedToBurnDollar);
          const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

          if (transactionReceipt.status === "success") {
            dollarSpendAllowance = allowedToBurnDollar;
            toastActions.showToast({
              toastType: "success",
              msg: `Successfully allowed to burn dollar: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
            });
          } else {
            throw new Error(transactionReverted);
          }
        }

        allowanceButton.disabled = false;        
        canDisableButtonsAtIntervals = true;
        checkAndUpdateUi();
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
        if (!selectedCollateral) return;
        canDisableButtonsAtIntervals = false;
        redeemDollarButton.disabled = true;

        const dollarAmountInDecimals = parseUnits(dollarAmount.toString(), dollarDecimals);
        const collateralOutMinInDecimals = parseUnits(collateralOutMin.toString(), collateralDecimals);
        const governanceOutMinInDecimals = parseUnits(governanceOutMin.toString(), governanceDecimals);
        const txHash = await redeemDollar(collateralRecord[selectedCollateral], dollarAmountInDecimals, governanceOutMinInDecimals, collateralOutMinInDecimals);
        blockOfRedemption = await publicClient.getBlockNumber();
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          dollarSpendAllowance = dollarSpendAllowance - dollarAmountInDecimals;
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully redeemed: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }

        canDisableButtonsAtIntervals = true;
        redeemDollarButton.disabled = false;
        checkAndUpdateUi();
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
        if (!selectedCollateral) return;
        canDisableButtonsAtIntervals = false;
        collectRedemptionButton.disabled = true;
        const txHash = await collectionRedemption(collateralRecord[selectedCollateral]);
        const transactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (transactionReceipt.status === "success") {
          toastActions.showToast({
            toastType: "success",
            msg: `Successfully collected: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
          });
        } else {
          throw new Error(transactionReverted);
        }

        canDisableButtonsAtIntervals = true;
        collectRedemptionButton.disabled = false;
        blockOfRedemption = BigInt(0);
        checkAndUpdateUi();
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
    void loadDollarDecimals();
    void loadGovernanceDecimals();
    updateSelectedCollateral();
    updateAllowance();
    updateDollarAmounts();
    updateCollateralAmount();
    updateGovernanceAmount();
    redeem();
    collectRedemption();
    checkAndUpdateUi();
  }
}
