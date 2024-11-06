import { ethers } from "ethers";
import { appState, diamondContract, dollarSpotPrice, governanceSpotPrice, userSigner } from "../main";
import { debounce } from "../utils";
import { CollateralOption, fetchCollateralOptions, populateCollateralDropdown } from "../common/collateral";
import { toggleSlippageSettings } from "../common/render-slippage-toggle";
import { renderErrorInModal } from "../common/display-popup-modal";

let currentOutput: {
  totalDollarMint: ethers.BigNumber;
  collateralNeeded: ethers.BigNumber;
  governanceNeeded: ethers.BigNumber;
  mintingFeeInDollar: ethers.BigNumber;
} | null = null;

export async function loadMintPage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      // load Mint HTML
      const response = await fetch("mint.html");
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

      // link mint button
      await linkMintButton();
    } catch (error) {
      console.error("Error loading mint page:", error);
    }
  }
}

async function calculateMintOutput(
  selectedCollateral: CollateralOption,
  dollarAmount: ethers.BigNumber,
  isForceCollateralOnlyChecked: boolean
): Promise<{
  totalDollarMint: ethers.BigNumber;
  collateralNeeded: ethers.BigNumber;
  governanceNeeded: ethers.BigNumber;
  mintingFeeInDollar: ethers.BigNumber;
}> {
  const collateralRatio = await diamondContract.collateralRatio();
  const governancePrice = await diamondContract.getGovernancePriceUsd();
  const poolPricePrecision = ethers.BigNumber.from("1000000");

  let collateralNeeded: ethers.BigNumber;
  let governanceNeeded: ethers.BigNumber;

  if (isForceCollateralOnlyChecked || collateralRatio.gte(poolPricePrecision)) {
    collateralNeeded = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAmount);
    governanceNeeded = ethers.BigNumber.from(0);
  } else if (collateralRatio.isZero()) {
    collateralNeeded = ethers.BigNumber.from(0);
    governanceNeeded = dollarAmount.mul(poolPricePrecision).div(governancePrice);
  } else {
    const dollarForCollateral = dollarAmount.mul(collateralRatio).div(poolPricePrecision);
    const dollarForGovernance = dollarAmount.sub(dollarForCollateral);

    collateralNeeded = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarForCollateral);
    governanceNeeded = dollarForGovernance.mul(poolPricePrecision).div(governancePrice);
  }

  const mintingFee = ethers.utils.parseUnits(selectedCollateral.mintingFee.toString(), 6);
  // Calculate the dollar value of the minting fee
  const mintingFeeInDollar = await diamondContract.getDollarInCollateral(selectedCollateral.index, dollarAmount.mul(mintingFee).div(poolPricePrecision));

  const totalDollarMint = dollarAmount.mul(poolPricePrecision.sub(mintingFee)).div(poolPricePrecision);

  return { totalDollarMint, collateralNeeded, governanceNeeded, mintingFeeInDollar };
}

function handleCollateralInput(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;
  const forceCollateralOnly = document.getElementById("forceCollateralOnly") as HTMLInputElement;

  const debouncedInputHandler = debounce(async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);
    const isForceCollateralOnlyChecked = forceCollateralOnly.checked;

    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);

    if (selectedCollateral) {
      currentOutput = await calculateMintOutput(selectedCollateral, dollarAmount, isForceCollateralOnlyChecked);
      displayMintOutput(currentOutput, selectedCollateral);
    }
  }, 300); // 300ms debounce

  dollarAmountInput.addEventListener("input", debouncedInputHandler);
  forceCollateralOnly.addEventListener("change", debouncedInputHandler);
}

function handleSlippageInput() {
  const dollarOutMinInput = document.getElementById("dollarOutMin") as HTMLInputElement;
  const maxCollateralInInput = document.getElementById("maxCollateralIn") as HTMLInputElement;
  const maxGovernanceInInput = document.getElementById("maxGovernanceIn") as HTMLInputElement;

  const debouncedSlippageCheck = debounce(() => {
    if (!currentOutput) return;

    const dollarOutMin = dollarOutMinInput.value ? ethers.utils.parseUnits(dollarOutMinInput.value, 18) : ethers.BigNumber.from("0");

    const maxCollateralIn = maxCollateralInInput.value ? ethers.utils.parseUnits(maxCollateralInInput.value, 18) : ethers.constants.MaxUint256;

    const maxGovernanceIn = maxGovernanceInInput.value ? ethers.utils.parseUnits(maxGovernanceInInput.value, 18) : ethers.constants.MaxUint256;

    if (currentOutput.totalDollarMint.lt(dollarOutMin)) {
      alert("Dollar slippage exceeded");
    } else if (currentOutput.collateralNeeded.gt(maxCollateralIn)) {
      alert("Collateral slippage exceeded");
    } else if (currentOutput.governanceNeeded.gt(maxGovernanceIn)) {
      alert("Governance slippage exceeded");
    }
  }, 1000); // 1s debounce

  dollarOutMinInput.addEventListener("input", debouncedSlippageCheck);
  maxCollateralInInput.addEventListener("input", debouncedSlippageCheck);
  maxGovernanceInInput.addEventListener("input", debouncedSlippageCheck);
}

function displayMintOutput(
  output: {
    totalDollarMint: ethers.BigNumber;
    collateralNeeded: ethers.BigNumber;
    governanceNeeded: ethers.BigNumber;
    mintingFeeInDollar: ethers.BigNumber;
  },
  selectedCollateral: CollateralOption
) {
  const totalDollarMinted = document.getElementById("totalDollarMinted");
  const collateralNeededElement = document.getElementById("collateralNeeded");
  const governanceNeededElement = document.getElementById("governanceNeeded");
  const mintingFeeElement = document.getElementById("mintingFee");

  const formattedTotalDollarMint = parseFloat(ethers.utils.formatUnits(output.totalDollarMint, 18)).toFixed(2);
  const formattedCollateralNeeded = parseFloat(ethers.utils.formatUnits(output.collateralNeeded, 18 - selectedCollateral.missingDecimals)).toFixed(2);
  const formattedGovernanceNeeded = parseFloat(ethers.utils.formatUnits(output.governanceNeeded, 18)).toFixed(2);
  const formattedmintingFeeInDollar = parseFloat(ethers.utils.formatUnits(output.mintingFeeInDollar, 18 - selectedCollateral.missingDecimals)).toFixed(2);

  // Calculate the dollar value of totalDollarMint and governanceNeeded using spot prices
  const totalDollarMintValue = output.totalDollarMint.mul(ethers.utils.parseUnits(dollarSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedTotalDollarMintValue = parseFloat(ethers.utils.formatUnits(totalDollarMintValue, 18)).toFixed(2);

  const governanceNeededValue = output.governanceNeeded.mul(ethers.utils.parseUnits(governanceSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedGovernanceNeededValue = parseFloat(ethers.utils.formatUnits(governanceNeededValue, 18)).toFixed(2);

  if (totalDollarMinted) {
    totalDollarMinted.textContent = `${formattedTotalDollarMint} UUSD ($${formattedTotalDollarMintValue})`;
  }
  if (collateralNeededElement) {
    collateralNeededElement.textContent = `${formattedCollateralNeeded} ${selectedCollateral.name}`;
  }
  if (governanceNeededElement) {
    governanceNeededElement.textContent = `${formattedGovernanceNeeded} UBQ ($${formattedGovernanceNeededValue})`;
  }
  if (mintingFeeElement) {
    mintingFeeElement.textContent = `${selectedCollateral.mintingFee}% (${formattedmintingFeeInDollar} UUSD)`;
  }
}

async function linkMintButton() {
  const mintButton = document.getElementById("mintButton") as HTMLButtonElement;
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;
  const forceCollateralOnly = document.getElementById("forceCollateralOnly") as HTMLInputElement;

  const updateButtonState = async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = dollarAmountRaw ? ethers.utils.parseUnits(dollarAmountRaw, 18) : null;

    mintButton.disabled = !appState.getIsConnectedState() || !selectedCollateralIndex || !dollarAmount || dollarAmount.isZero();
  };

  // Attach event listeners to update the button state whenever inputs change
  collateralSelect.addEventListener("change", updateButtonState);
  dollarAmountInput.addEventListener("input", updateButtonState);
  forceCollateralOnly.addEventListener("change", updateButtonState);

  // Send transaction
  mintButton.addEventListener("click", async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);
    const dollarOutMin = ethers.BigNumber.from("0");
    const maxCollateralIn = ethers.constants.MaxUint256;
    const maxGovernanceIn = ethers.constants.MaxUint256;
    const isForceCollateralOnlyChecked = forceCollateralOnly.checked;

    try {
      const signerDiamondContract = diamondContract.connect(userSigner);

      console.log("Minting", parseInt(selectedCollateralIndex), dollarAmount, dollarOutMin, maxCollateralIn, maxGovernanceIn, isForceCollateralOnlyChecked);

      await signerDiamondContract.mintDollar(
        parseInt(selectedCollateralIndex),
        dollarAmount,
        dollarOutMin,
        maxCollateralIn,
        maxGovernanceIn,
        isForceCollateralOnlyChecked
      );

      alert("Minting transaction sent successfully!");
    } catch (error) {
      console.error("Minting transaction failed:", error);
      renderErrorInModal(error instanceof Error ? error : new Error(String(error)));
    }
  });

  // Initialize the button state on page load
  await updateButtonState();
}
