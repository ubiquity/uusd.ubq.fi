import { ethers } from "ethers";
import { appState, collateralOptions, diamondContract, dollarContract, governanceSpotPrice, lusdPrice, provider, userSigner } from "../main";
import { debounce } from "../utils";
import { CollateralOption, fetchCollateralOptions, populateCollateralDropdown } from "../common/collateral";
import { toggleSlippageSettings } from "../common/render-slippage-toggle";
import { renderErrorInModal } from "../common/display-popup-modal";

let currentOutput: {
  collateralRedeemed: ethers.BigNumber;
  governanceRedeemed: ethers.BigNumber;
  redemptionFeeInDollar: ethers.BigNumber;
} | null = null;

export async function loadRedeemPage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      // load Redeem HTML
      const response = await fetch("redeem.html");
      const html = await response.text();
      contentArea.innerHTML = html;

      // setup toggle for slippage settings
      toggleSlippageSettings();

      // add collateral options to dropdown
      await populateCollateralDropdown(collateralOptions);

      // handle collateral input
      handleCollateralInput(collateralOptions);

      // handle slippage checks
      handleSlippageInput();
    } catch (error) {
      console.error("Error loading redeem page:", error);
    }
  }
}

/**
 * Calculates how much collateral and governance the user gets, and how much redemption fee
 * is taken from the UUSD. The user inputs a UUSD amount and the collateral to redeem.
 */
async function calculateRedeemOutput(
  selectedCollateral: CollateralOption,
  dollarAmount: ethers.BigNumber
): Promise<{
  collateralRedeemed: ethers.BigNumber;
  governanceRedeemed: ethers.BigNumber;
  redemptionFeeInDollar: ethers.BigNumber;
}> {
  let collateralRatio: ethers.BigNumber;
  let governancePrice: ethers.BigNumber;
  let collateralOut: ethers.BigNumber | null = null;

  try {
    collateralRatio = await diamondContract.collateralRatio();
  } catch (err) {
    console.error("Failed to get collateral ratio:", err);
    throw new Error("Failed to compute redemption output, please try again later.");
  }

  try {
    governancePrice = await diamondContract.getGovernancePriceUsd();
  } catch (err) {
    console.error("Failed to get governance price:", err);
    throw new Error("Failed to compute redemption output, please try again later.");
  }

  const poolPricePrecision = ethers.BigNumber.from("1000000");
  const redemptionFee = ethers.utils.parseUnits(selectedCollateral.redemptionFee.toString(), 6);

  // Subtract fee from the user-provided UUSD
  const dollarAfterFee = dollarAmount.mul(poolPricePrecision.sub(redemptionFee)).div(poolPricePrecision);
  const redemptionFeeInDollar = dollarAmount.sub(dollarAfterFee);

  let collateralRedeemed: ethers.BigNumber;
  let governanceRedeemed: ethers.BigNumber;

  // For partial or 100% collateral, we need getDollarInCollateral
  const needsCollateralCall = collateralRatio.gte(poolPricePrecision) || !collateralRatio.isZero();

  if (needsCollateralCall) {
    try {
      // We do a single getDollarInCollateral call for the "dollarAfterFee"
      collateralOut = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAfterFee);
    } catch (err) {
      console.error("Failed to get collateral quote:", err);
      throw new Error("Failed to compute redemption output, please try again later.");
    }
  }

  // Now decide how to split between collateral & governance
  if (collateralRatio.gte(poolPricePrecision)) {
    // 100% collateral
    collateralRedeemed = collateralOut ?? ethers.BigNumber.from(0);
    governanceRedeemed = ethers.BigNumber.from(0);
  } else if (collateralRatio.isZero()) {
    // 0% collateral => all governance
    collateralRedeemed = ethers.BigNumber.from(0);
    governanceRedeemed = dollarAfterFee.mul(poolPricePrecision).div(governancePrice);
  } else {
    // Partial
    const out = collateralOut ?? ethers.BigNumber.from(0);
    collateralRedeemed = out.mul(collateralRatio).div(poolPricePrecision);
    governanceRedeemed = dollarAfterFee.mul(poolPricePrecision.sub(collateralRatio)).div(governancePrice);
  }

  return { collateralRedeemed, governanceRedeemed, redemptionFeeInDollar };
}

/**
 * Sets up the user input logic for "UUSD to redeem" and updates the displayed quotes (collateral & governance out).
 * Also sets the redeem button to "Loading..." while computing quotes,
 * then triggers linkRedeemButton() to check allowances and finalize the button state.
 */
function handleCollateralInput(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;
  const redeemButton = document.getElementById("redeemButton") as HTMLButtonElement;

  // Helper: Set button to "Failed" and disable it
  const setButtonFailed = () => {
    if (!redeemButton) return;
    redeemButton.disabled = true;
    redeemButton.textContent = "Failed";
  };

  // Helper: show "Loading..." or re-enable the button
  const setButtonLoading = (isLoading: boolean, loadingText = "Loading...") => {
    if (!redeemButton) return;
    if (isLoading) {
      redeemButton.disabled = true;
      redeemButton.textContent = loadingText;
    } else {
      redeemButton.disabled = false;
    }
  };

  const debouncedInputHandler = debounce(async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);

    // Only proceed if user has selected a collateral and typed > 0
    if (!selectedCollateralIndex || dollarAmount.isZero()) {
      return;
    }

    // Set button to loading while we compute output
    setButtonLoading(true);

    try {
      const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
      if (selectedCollateral) {
        currentOutput = await calculateRedeemOutput(selectedCollateral, dollarAmount);
        displayRedeemOutput(currentOutput, selectedCollateral);

        // Link the redeem button => checks allowances
        await linkRedeemButton(collateralOptions);
      }
    } catch (err) {
      console.error("Error computing redemption output:", err);
      renderErrorInModal(new Error("UUSD or UBQ prices are stale, please refresh the page."));
      setButtonFailed();
    }
  }, 300); // 300ms debounce

  dollarAmountInput.addEventListener("input", debouncedInputHandler);
  collateralSelect.addEventListener("change", debouncedInputHandler);
}

/**
 * For handling slippage thresholds in the input fields. If the computed output is below
 * the user's min, we show an error in a modal.
 */
function handleSlippageInput() {
  const collateralOutMinInput = document.getElementById("collateralOutMin") as HTMLInputElement;
  const governanceOutMinInput = document.getElementById("governanceOutMin") as HTMLInputElement;

  const debouncedSlippageCheck = debounce(() => {
    if (!currentOutput) return;

    const collateralOutMin = collateralOutMinInput.value ? ethers.utils.parseUnits(collateralOutMinInput.value, 18) : ethers.BigNumber.from("0");
    const governanceOutMin = governanceOutMinInput.value ? ethers.utils.parseUnits(governanceOutMinInput.value, 18) : ethers.BigNumber.from("0");

    if (currentOutput.collateralRedeemed.lt(collateralOutMin)) {
      renderErrorInModal(new Error("Collateral slippage exceeded"));
    } else if (currentOutput.governanceRedeemed.lt(governanceOutMin)) {
      renderErrorInModal(new Error("Governance slippage exceeded"));
    }
  }, 1000); // 1s debounce

  collateralOutMinInput.addEventListener("input", debouncedSlippageCheck);
  governanceOutMinInput.addEventListener("input", debouncedSlippageCheck);
}

/**
 * Renders the redeemed collateral, governance, and redemption fee to the page.
 */
function displayRedeemOutput(
  output: {
    collateralRedeemed: ethers.BigNumber;
    governanceRedeemed: ethers.BigNumber;
    redemptionFeeInDollar: ethers.BigNumber;
  },
  selectedCollateral: CollateralOption
) {
  const collateralRedeemedElement = document.getElementById("collateralRedeemed");
  const governanceRedeemedElement = document.getElementById("governanceRedeemed");
  const redemptionFeeElement = document.getElementById("redemptionFee");

  // Format the amounts for display
  const formattedCollateralRedeemed = parseFloat(ethers.utils.formatUnits(output.collateralRedeemed, 18 - selectedCollateral.missingDecimals)).toFixed(2);
  const formattedGovernanceRedeemed = parseFloat(ethers.utils.formatUnits(output.governanceRedeemed, 18)).toFixed(2);
  const formattedRedemptionFeeInDollar = parseFloat(ethers.utils.formatUnits(output.redemptionFeeInDollar, 18)).toFixed(2);

  // Calculate dollar values using spot prices
  const collateralDollarValue = output.collateralRedeemed.mul(ethers.utils.parseUnits(lusdPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedCollateralDollarValue = parseFloat(ethers.utils.formatUnits(collateralDollarValue, 18)).toFixed(2);

  const governanceDollarValue = output.governanceRedeemed.mul(ethers.utils.parseUnits(governanceSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedGovernanceDollarValue = parseFloat(ethers.utils.formatUnits(governanceDollarValue, 18)).toFixed(2);

  // Update the displayed values
  if (collateralRedeemedElement) {
    collateralRedeemedElement.textContent = `${formattedCollateralRedeemed} ${selectedCollateral.name} ($${formattedCollateralDollarValue})`;
  }
  if (governanceRedeemedElement) {
    governanceRedeemedElement.textContent = `${formattedGovernanceRedeemed} UBQ ($${formattedGovernanceDollarValue})`;
  }
  if (redemptionFeeElement) {
    redemptionFeeElement.textContent = `${selectedCollateral.redemptionFee * 100}% (${formattedRedemptionFeeInDollar} UUSD)`;
  }
}

/**
 * Connects the "redeem" button logic. Checks if the user’s UUSD allowance is sufficient,
 * shows "Approve UUSD" if not, or "Redeem" if it is. Also handles the transaction flow.
 */
async function linkRedeemButton(collateralOptions: CollateralOption[]) {
  const redeemButton = document.getElementById("redeemButton") as HTMLButtonElement;

  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;

  const collateralOutMinInput = document.getElementById("collateralOutMin") as HTMLInputElement;
  const governanceOutMinInput = document.getElementById("governanceOutMin") as HTMLInputElement;

  const balanceToFill = document.querySelector("#balance") as HTMLElement;

  // We'll track the button label state: "Approve UUSD" or "Redeem".
  type ButtonAction = "COLLECT" | "APPROVE_UUSD" | "REDEEM" | "DISABLED";
  let buttonAction: ButtonAction = "DISABLED";

  const setButtonLoading = (isLoading: boolean, loadingText?: string) => {
    if (isLoading) {
      redeemButton.disabled = true;
      if (loadingText) redeemButton.textContent = loadingText;
    } else {
      redeemButton.disabled = false;
    }
  };

  const updateButtonState = async () => {
    // Default to disabled
    buttonAction = "DISABLED";
    redeemButton.disabled = true;
    redeemButton.textContent = "Redeem";

    // If not connected or no input yet, just disable.
    if (!appState.getIsConnectedState()) {
      return;
    }

    const selectedCollateralIndex = collateralSelect.value;
    if (!selectedCollateralIndex) {
      return;
    }

    const dollarAmountRaw = dollarAmountInput.value;
    if (!dollarAmountRaw || dollarAmountRaw === "0") {
      return;
    }

    // If we have no computed output yet, or it's zero, disable as well.
    if (!currentOutput) {
      return;
    }

    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
    if (!selectedCollateral) {
      return;
    }

    setButtonLoading(true, "Checking allowance...");

    try {
      const userAddress = await userSigner.getAddress();

      // 1) Check if there's already a redemption to collect
      let redeemCollateralBalance: ethers.BigNumber;
      try {
        redeemCollateralBalance = await diamondContract.getRedeemCollateralBalance(userAddress, parseInt(selectedCollateralIndex));
      } catch (err) {
        console.error("Failed to check redeemCollateralBalance:", err);
        renderErrorInModal(new Error("Failed to check redeemable balance, please try again later."));
        redeemButton.disabled = true;
        redeemButton.textContent = "Failed";
        return;
      }

      // If user has something to collect, skip allowance checks
      if (redeemCollateralBalance.gt(0)) {
        buttonAction = "COLLECT";
        redeemButton.disabled = false;
        redeemButton.textContent = "Collect Redemption";
        return;
      }

      // 2) If nothing to collect, proceed to check user UUSD balance & allowance for new redemption
      let rawDollarBalance: ethers.BigNumber;
      try {
        rawDollarBalance = await dollarContract.balanceOf(userAddress);
      } catch (err) {
        console.error("Failed to get UUSD balance:", err);
        renderErrorInModal(new Error("Failed to get balance, please try again later."));
        redeemButton.disabled = true;
        redeemButton.textContent = "Failed";
        return;
      }

      const formattedDollarBalance = ethers.utils.formatUnits(rawDollarBalance, 18);

      // Put the user balance in the page: "123.45 UUSD"
      if (balanceToFill) {
        balanceToFill.textContent = `Your balance: ${formattedDollarBalance} UUSD`;
      }

      // 2) Check allowance
      const neededUusd = ethers.utils.parseUnits(dollarAmountRaw, 18);
      if (neededUusd.isZero()) {
        return;
      }

      let allowance: ethers.BigNumber;
      try {
        allowance = await dollarContract.allowance(userAddress, diamondContract.address);
      } catch (err) {
        console.error("Failed to get UUSD allowance:", err);
        renderErrorInModal(new Error("Failed to get allowance, please try again later."));
        redeemButton.disabled = true;
        redeemButton.textContent = "Failed";
        return;
      }

      console.log("UUSD allowance is:", allowance.toString());

      if (allowance.lt(neededUusd)) {
        buttonAction = "APPROVE_UUSD";
        redeemButton.disabled = false;
        redeemButton.textContent = "Approve UUSD";
      } else {
        buttonAction = "REDEEM";
        redeemButton.disabled = false;
        redeemButton.textContent = "Redeem";
      }
    } catch (err) {
      console.error("Unexpected error in updateButtonState:", err);
      renderErrorInModal(new Error("Failed to check redemption, please try again later."));
      redeemButton.disabled = true;
      redeemButton.textContent = "Failed";
    } finally {
      setButtonLoading(false);
    }
  };

  // We watch changes to the input to re-check the allowance
  collateralSelect.addEventListener("change", updateButtonState);
  dollarAmountInput.addEventListener("input", updateButtonState);

  const handleRedeemClick = async () => {
    redeemButton.disabled = true; // prevent double click

    const selectedCollateralIndex = collateralSelect.value;
    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
    if (!selectedCollateral) return;

    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);

    // use provided slippage values or default to min/max
    const collateralOutMin = collateralOutMinInput.value ? ethers.utils.parseUnits(collateralOutMinInput.value, 18) : ethers.BigNumber.from("0");
    const governanceOutMin = governanceOutMinInput.value ? ethers.utils.parseUnits(governanceOutMinInput.value, 18) : ethers.BigNumber.from("0");

    const signerDiamondContract = diamondContract.connect(userSigner);

    try {
      if (buttonAction === "COLLECT") {
        setButtonLoading(true, "Collecting...");

        console.log("Collect Redeem Input", {
          selectedCollateralIndex: parseInt(selectedCollateralIndex),
        });

        await signerDiamondContract.collectRedemption(parseInt(selectedCollateralIndex));

        alert("Collected redemption successfully!");
        // Re-check the state (allow user to do new redemption if no pending)
        await updateButtonState();
      } else if (buttonAction === "APPROVE_UUSD") {
        setButtonLoading(true, "Approving UUSD...");
        const tx = await signerDiamondContract.approve(diamondContract.address, ethers.constants.MaxUint256);
        await tx.wait();

        await updateButtonState();
      } else if (buttonAction === "REDEEM") {
        setButtonLoading(true, "Redeeming...");

        console.log("Redeem Input", {
          selectedCollateralIndex: parseInt(selectedCollateralIndex),
          dollarAmount: dollarAmount.toString(),
          governanceOutMin: governanceOutMin.toString(),
          collateralOutMin: collateralOutMin.toString(),
        });

        // 1) Redeem Transaction
        const tx = await signerDiamondContract.redeemDollar(parseInt(selectedCollateralIndex), dollarAmount, governanceOutMin, collateralOutMin);

        // 2) Wait for confirmation
        await tx.wait();

        // 3) Set button to waiting mode
        setButtonLoading(true, "Waiting for 2 blocks...");

        // 4) Wait for 2 block confirmations dynamically
        const startBlock = await provider().getBlockNumber();
        await new Promise<void>((resolve) => {
          const checkBlock = async () => {
            const currentBlock = await provider().getBlockNumber();
            if (currentBlock >= startBlock + 2) {
              resolve();
            } else {
              setTimeout(checkBlock, 5000); // Check every 5 seconds
            }
          };
          checkBlock();
        });

        // 5) Alert user that redemption is ready
        alert("Redemption confirmed, you may now collect your redemption.");

        // 6) Refresh button state
        await updateButtonState();
      }
    } catch (error) {
      let displayMessage = "Transaction failed.";
      console.error("Transaction failed:", error);

      if (error instanceof Error) {
        const message = error.message;

        if (message.includes("Too soon to collect redemption")) {
          displayMessage = "Your redemption is not yet ready to collect. Wait a minute and try again.";
        } else if (message.includes("UNPREDICTABLE_GAS_LIMIT")) {
          displayMessage = "Cannot estimate gas costs, please check if redemption is ready.";
        } else if (message.includes("User rejected the request.")){ 
          displayMessage = "Transaction rejected by user.";
        } else {
          displayMessage = message;
        }
      }

      renderErrorInModal(new Error(displayMessage));
    } finally {
      setButtonLoading(false);
      await updateButtonState();
    }
  };

  if(!redeemButton.hasAttribute("data-listenerAdded")) {
    redeemButton.addEventListener("click", handleRedeemClick);
    redeemButton.setAttribute("data-listenerAdded", "true");
  }

  // Initialize the button state on page load
  await updateButtonState();
}
