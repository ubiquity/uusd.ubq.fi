import { ethers } from "ethers";
import { diamondContract } from "../main";
import { debounce } from "../utils";
import { dollarSpotPrice, governanceSpotPrice } from "../main";

interface CollateralOption {
  index: number;
  name: string;
  address: string;
  mintingFee: number;
  missingDecimals: number;
}

let currentOutput: {
  totalDollarMint: ethers.BigNumber;
  collateralNeeded: ethers.BigNumber;
  governanceNeeded: ethers.BigNumber;
} | null = null;

export async function loadMintPage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      // load Mint HTML
      const response = await fetch("mint.html");
      const html = await response.text();
      contentArea.innerHTML = html;

      // fetch collateral options
      const collateralOptions = await fetchCollateralOptions();

      // add collateral options to dropdown
      populateCollateralDropdown(collateralOptions);

      // handle collateral input
      handleCollateralInput(collateralOptions);

      // handle slippage checks
      handleSlippage();
    } catch (error) {
      console.error("Error loading mint page:", error);
    }
  }
}

async function fetchCollateralOptions(): Promise<CollateralOption[]> {
  const collateralAddresses: string[] = await diamondContract.allCollaterals();
  return (
    await Promise.all(
      collateralAddresses.map(async (address) => {
        const info = await diamondContract.collateralInformation(address);
        return {
          index: info.index.toNumber(),
          name: info.symbol,
          address: address,
          mintingFee: parseFloat(ethers.utils.formatUnits(info.mintingFee, 18)),
          missingDecimals: info.missingDecimals.toNumber(),
          isEnabled: info.isEnabled,
          isMintPaused: info.isMintPaused,
        };
      })
    )
  ).filter((option) => option.isEnabled && !option.isMintPaused);
}

function populateCollateralDropdown(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  collateralOptions.forEach(({ index, name }) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.text = name;
    collateralSelect.appendChild(option);
  });
}

async function calculateMintOutput(
  selectedCollateral: CollateralOption,
  collateralAmount: ethers.BigNumber,
  forceCollateralOnlyChecked: boolean
): Promise<{
  totalDollarMint: ethers.BigNumber;
  collateralNeeded: ethers.BigNumber;
  governanceNeeded: ethers.BigNumber;
}> {
  const collateralRatio = await diamondContract.collateralRatio();
  const governancePrice = await diamondContract.getGovernancePriceUsd();
  const poolPricePrecision = ethers.BigNumber.from("1000000"); // Assuming 1e6 as the precision

  const dollarAmount = collateralAmount.mul(poolPricePrecision).div(collateralRatio);

  let collateralNeeded: ethers.BigNumber;
  let governanceNeeded: ethers.BigNumber;

  // Collateral-only minting mode or 100%+ collateral ratio  
  if (forceCollateralOnlyChecked || collateralRatio.gte(poolPricePrecision)) {
    collateralNeeded = await diamondContract.getDollarInCollateral(
      selectedCollateral.index,
      dollarAmount
    );
    governanceNeeded = ethers.BigNumber.from(0);

  } else if (collateralRatio.eq(ethers.BigNumber.from(0))) {
    // Fully algorithmic mode (0% collateral ratio), only Governance tokens required
    collateralNeeded = ethers.BigNumber.from(0);
    governanceNeeded = dollarAmount.mul(poolPricePrecision).div(governancePrice);

  } else {
    // Fractional collateral ratio (0 < collateralRatio < 100%)
    const dollarForCollateral = dollarAmount.mul(collateralRatio).div(poolPricePrecision);
    const dollarForGovernance = dollarAmount.sub(dollarForCollateral);

    collateralNeeded = await diamondContract.getDollarInCollateral(
      selectedCollateral.index,
      dollarForCollateral
    );
    governanceNeeded = dollarForGovernance.mul(poolPricePrecision).div(governancePrice);
  }

  const mintingFee = ethers.utils.parseUnits(selectedCollateral.mintingFee.toString(), 18);
  const totalDollarMint = dollarAmount
    .mul(poolPricePrecision.sub(mintingFee))
    .div(poolPricePrecision);

  return { totalDollarMint, collateralNeeded, governanceNeeded };
}

function handleCollateralInput(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const collateralAmountInput = document.getElementById("collateralAmount") as HTMLInputElement;
  const forceCollateralOnly = document.getElementById("forceCollateralOnly") as HTMLInputElement;

  const debouncedInputHandler = debounce(async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const collateralAmountRaw = collateralAmountInput.value;
    const collateralAmount = ethers.utils.parseUnits(collateralAmountRaw || "0", 18);
    const forceCollateralOnlyChecked = forceCollateralOnly.checked;

    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);

    if (selectedCollateral) {
      currentOutput = await calculateMintOutput(selectedCollateral, collateralAmount, forceCollateralOnlyChecked);
      displayMintOutput(currentOutput, selectedCollateral);
    }
  }, 300); // 300ms debounce

  collateralAmountInput.addEventListener("input", debouncedInputHandler);
  forceCollateralOnly.addEventListener("change", debouncedInputHandler);
}

function handleSlippage() {
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
  output: { totalDollarMint: ethers.BigNumber; collateralNeeded: ethers.BigNumber; governanceNeeded: ethers.BigNumber },
  selectedCollateral: CollateralOption
) {
  const totalDollarMinted = document.getElementById("totalDollarMinted");
  const collateralNeededElement = document.getElementById("collateralNeeded");
  const governanceNeededElement = document.getElementById("governanceNeeded");
  const mintingFeeElement = document.getElementById("mintingFee");

  const formattedTotalDollarMint = parseFloat(ethers.utils.formatUnits(output.totalDollarMint, 18)).toFixed(2);
  const formattedCollateralNeeded = parseFloat(
    ethers.utils.formatUnits(output.collateralNeeded, 18 - selectedCollateral.missingDecimals)
  ).toFixed(2);
  const formattedGovernanceNeeded = parseFloat(ethers.utils.formatUnits(output.governanceNeeded, 18)).toFixed(2);

  // Calculate the dollar value of the minting fee
  const mintingFeeDollarValue = output.totalDollarMint
    .mul(selectedCollateral.mintingFee.toString()) // this is 1e6 so we divide by 1e6 below
    .div(ethers.BigNumber.from("1000000"));

  const formattedMintingFeeDollarValue = parseFloat(ethers.utils.formatUnits(mintingFeeDollarValue, 18)).toFixed(2);

  if (totalDollarMinted) {
    totalDollarMinted.textContent = `${formattedTotalDollarMint} UUSD`;
  }
  if (collateralNeededElement) {
    collateralNeededElement.textContent = `${formattedCollateralNeeded} ${selectedCollateral.name}`;
  }
  if (governanceNeededElement) {
    governanceNeededElement.textContent = `${formattedGovernanceNeeded} UBQ`;
  }
  if (mintingFeeElement) {
    mintingFeeElement.textContent = `${selectedCollateral.mintingFee}% (${formattedMintingFeeDollarValue} ${selectedCollateral.name})`;
  }
}