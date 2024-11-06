import { ethers } from "ethers";
import { appState, diamondContract, governanceSpotPrice, userSigner } from "../main";
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
      populateCollateralDropdown(collateralOptions);

      // handle collateral input
      handleCollateralInput(collateralOptions);

      // handle slippage checks
      handleSlippageInput();

      // link redeem button
      await linkRedeemButton();
    } catch (error) {
      console.error("Error loading redeem page:", error);
    }
  }
}

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
  const dollarAfterFee = dollarAmount.mul(poolPricePrecision.sub(redemptionFee)).div(poolPricePrecision);
  const redemptionFeeInDollar = dollarAmount.sub(dollarAfterFee);

  let collateralRedeemed: ethers.BigNumber;
  let governanceRedeemed: ethers.BigNumber;

  if (collateralRatio.gte(poolPricePrecision)) {
    collateralRedeemed = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAfterFee);
    governanceRedeemed = ethers.BigNumber.from(0);
  } else if (collateralRatio.isZero()) {
    collateralRedeemed = ethers.BigNumber.from(0);
    governanceRedeemed = dollarAfterFee.mul(poolPricePrecision).div(governancePrice);
  } else {
    const collateralOut = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAfterFee);
    collateralRedeemed = collateralOut.mul(collateralRatio).div(poolPricePrecision);
    governanceRedeemed = dollarAfterFee.mul(poolPricePrecision.sub(collateralRatio)).div(governancePrice);
  }

  return { collateralRedeemed, governanceRedeemed, redemptionFeeInDollar };
}

function handleCollateralInput(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;

  const debouncedInputHandler = debounce(async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);

    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);

    if (selectedCollateral) {
      currentOutput = await calculateRedeemOutput(selectedCollateral, dollarAmount);
      displayRedeemOutput(currentOutput, selectedCollateral);
    }
  }, 300); // 300ms debounce

  dollarAmountInput.addEventListener("input", debouncedInputHandler);
}

function handleSlippageInput() {
  const collateralOutMinInput = document.getElementById("collateralOutMin") as HTMLInputElement;
  const governanceOutMinInput = document.getElementById("governanceOutMin") as HTMLInputElement;

  const debouncedSlippageCheck = debounce(() => {
    if (!currentOutput) return;

    const collateralOutMin = collateralOutMinInput.value ? ethers.utils.parseUnits(collateralOutMinInput.value, 18) : ethers.BigNumber.from("0");
    const governanceOutMin = governanceOutMinInput.value ? ethers.utils.parseUnits(governanceOutMinInput.value, 18) : ethers.BigNumber.from("0");

    if (currentOutput.collateralRedeemed.lt(collateralOutMin)) {
      alert("Collateral slippage exceeded");
    } else if (currentOutput.governanceRedeemed.lt(governanceOutMin)) {
      alert("Governance slippage exceeded");
    }
  }, 1000); // 1s debounce

  collateralOutMinInput.addEventListener("input", debouncedSlippageCheck);
  governanceOutMinInput.addEventListener("input", debouncedSlippageCheck);
}

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

  const formattedCollateralRedeemed = parseFloat(ethers.utils.formatUnits(output.collateralRedeemed, 18 - selectedCollateral.missingDecimals)).toFixed(2);

  const formattedGovernanceRedeemed = parseFloat(ethers.utils.formatUnits(output.governanceRedeemed, 18)).toFixed(2);
  const formattedRedemptionFeeInDollar = parseFloat(ethers.utils.formatUnits(output.redemptionFeeInDollar, 18)).toFixed(2);

  // Calculate dollar value of governance redeemed
  const governanceDollarValue = output.governanceRedeemed.mul(ethers.utils.parseUnits(governanceSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedGovernanceDollarValue = parseFloat(ethers.utils.formatUnits(governanceDollarValue, 18)).toFixed(2);

  if (collateralRedeemedElement) {
    collateralRedeemedElement.textContent = `${formattedCollateralRedeemed} ${selectedCollateral.name}`;
  }
  if (governanceRedeemedElement) {
    governanceRedeemedElement.textContent = `${formattedGovernanceRedeemed} UBQ ($${formattedGovernanceDollarValue})`;
  }
  if (redemptionFeeElement) {
    redemptionFeeElement.textContent = `${selectedCollateral.redemptionFee * 100}% (${formattedRedemptionFeeInDollar} UUSD)`;
  }
}

async function linkRedeemButton() {
  const redeemButton = document.getElementById("redeemButton") as HTMLButtonElement;
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;

  const updateButtonState = async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = dollarAmountRaw ? ethers.utils.parseUnits(dollarAmountRaw, 18) : null;

    redeemButton.disabled = !appState.getIsConnectedState() || !selectedCollateralIndex || !dollarAmount || dollarAmount.isZero();
  };

  collateralSelect.addEventListener("change", updateButtonState);
  dollarAmountInput.addEventListener("input", updateButtonState);

  redeemButton.addEventListener("click", async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);
    const collateralOutMin = ethers.BigNumber.from("0");
    const governanceOutMin = ethers.BigNumber.from("0");

    try {
      const signerDiamondContract = diamondContract.connect(userSigner);

      await signerDiamondContract.redeemDollar(parseInt(selectedCollateralIndex), dollarAmount, governanceOutMin, collateralOutMin);

      // After redeemDollar succeeds, initiate the collection
      await signerDiamondContract.collectRedemption(parseInt(selectedCollateralIndex));

      alert("Redemption collected successfully!");
    } catch (error) {
      console.error("Redemption transaction or collection failed:", error);
      renderErrorInModal(error instanceof Error ? error : new Error(String(error)));
    }
  });

  // Initialize the button state on page load
  await updateButtonState();
}
