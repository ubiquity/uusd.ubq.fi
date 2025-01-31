import { ethers } from "ethers";
import { appState, diamondContract, dollarContract, governanceSpotPrice, lusdPrice, provider, userSigner } from "../main";
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

      // fetch collateral options
      const collateralOptions = await fetchCollateralOptions();

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
  const collateralRatio = await diamondContract.collateralRatio();
  const governancePrice = await diamondContract.getGovernancePriceUsd();
  const poolPricePrecision = ethers.BigNumber.from("1000000");
  const redemptionFee = ethers.utils.parseUnits(selectedCollateral.redemptionFee.toString(), 6);

  // Subtract fee from the user-provided UUSD
  const dollarAfterFee = dollarAmount.mul(poolPricePrecision.sub(redemptionFee)).div(poolPricePrecision);
  const redemptionFeeInDollar = dollarAmount.sub(dollarAfterFee);

  let collateralRedeemed: ethers.BigNumber;
  let governanceRedeemed: ethers.BigNumber;

  if (collateralRatio.gte(poolPricePrecision)) {
    // 100% collateral
    collateralRedeemed = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAfterFee);
    governanceRedeemed = ethers.BigNumber.from(0);
  } else if (collateralRatio.isZero()) {
    // 0% collateral => all governance
    collateralRedeemed = ethers.BigNumber.from(0);
    governanceRedeemed = dollarAfterFee.mul(poolPricePrecision).div(governancePrice);
  } else {
    // partial
    const collateralOut = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAfterFee);
    collateralRedeemed = collateralOut.mul(collateralRatio).div(poolPricePrecision);
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

    // Immediately set button to loading while we compute output
    setButtonLoading(true);

    try {
      const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
      if (selectedCollateral) {
        currentOutput = await calculateRedeemOutput(selectedCollateral, dollarAmount);
        displayRedeemOutput(currentOutput, selectedCollateral);

        // Once done, link the redeem button
        // which will check allowances and set the final text
        await linkRedeemButton(collateralOptions);
      }
    } catch (err) {
      console.error("Error computing redemption output:", err);
      renderErrorInModal(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setButtonLoading(false);
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
  type ButtonAction = "APPROVE_UUSD" | "REDEEM" | "DISABLED";
  let buttonAction: ButtonAction = "DISABLED";

  // Helper to set a quick loading state on the button
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

    // We only have one token to check here: UUSD
    // If the user is redeeming X UUSD, we need to check if allowance >= X
    try {
      setButtonLoading(true, "Checking allowance...");
      const userAddress = await userSigner.getAddress();
      const rawDollarBalance: ethers.BigNumber = await dollarContract.balanceOf(userAddress);
      const formattedDollarBalance = ethers.utils.formatUnits(rawDollarBalance, 18);

      // Put the user balance in the page: "123.45 UUSD"
      if (balanceToFill) {
        balanceToFill.textContent = `Your balance: ${formattedDollarBalance} UUSD`;
      }

      const neededUusd = ethers.utils.parseUnits(dollarAmountRaw, 18);
      if (neededUusd.isZero()) {
        return;
      }

      const allowance = await dollarContract.connect(userSigner).allowance(userAddress, diamondContract.address);
      console.log("UUSD allowance is: ", allowance.toString());

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
      console.error(err);
    } finally {
      setButtonLoading(false);
    }
  };

  // We watch changes to the input to re-check the allowance
  collateralSelect.addEventListener("change", updateButtonState);
  dollarAmountInput.addEventListener("input", updateButtonState);

  redeemButton.addEventListener("click", async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
    if (!selectedCollateral) return;

    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);

    // use provided slippage values or default to min/max
    const collateralOutMin = collateralOutMinInput.value ? ethers.utils.parseUnits(collateralOutMinInput.value, 18) : ethers.BigNumber.from("0");
    const governanceOutMin = governanceOutMinInput.value ? ethers.utils.parseUnits(governanceOutMinInput.value, 18) : ethers.BigNumber.from("0");

    try {
      if (buttonAction === "APPROVE_UUSD") {
        setButtonLoading(true, "Approving UUSD...");
        const tx = await dollarContract.connect(userSigner).approve(diamondContract.address, ethers.constants.MaxUint256);
        await tx.wait();

        // Re-check state
        await updateButtonState();
      } else if (buttonAction === "REDEEM") {
        setButtonLoading(true, "Redeeming...");
        const signerDiamondContract = diamondContract.connect(userSigner);

        console.log("Redeem Input", {
          selectedCollateralIndex: parseInt(selectedCollateralIndex),
          dollarAmount: dollarAmount.toString(),
          governanceOutMin: governanceOutMin.toString(),
          collateralOutMin: collateralOutMin.toString(),
        });

        // 1) Redeem
        await signerDiamondContract.redeemDollar(parseInt(selectedCollateralIndex), dollarAmount, governanceOutMin, collateralOutMin);

        // Wait for 2 blocks before initiating the collection
        await new Promise((resolve) => {
          const startBlock = provider().blockNumber;

          const checkBlock = () => {
            void (async () => {
              const currentBlock = await provider().getBlockNumber();
              if (currentBlock >= startBlock + 3) {
                resolve(null);
              } else {
                setTimeout(checkBlock, 1000); // Check every sec
              }
            })();
          };

          checkBlock();
        });

        // After waiting for 2 blocks, initiate the collection
        await signerDiamondContract.collectRedemption(parseInt(selectedCollateralIndex));

        alert("Redemption collected successfully!");
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      renderErrorInModal(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setButtonLoading(false);
    }
  });

  // Initialize the button state on page load
  await updateButtonState();
}
