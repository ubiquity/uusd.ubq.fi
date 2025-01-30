import { ethers } from "ethers";
import { appState, diamondContract, dollarSpotPrice, governanceContract, governanceSpotPrice, lusdPrice, userSigner } from "../main";
import { debounce } from "../utils";
import { CollateralOption, fetchCollateralOptions, populateCollateralDropdown } from "../common/collateral";
import { toggleSlippageSettings } from "../common/render-slippage-toggle";
import { renderErrorInModal } from "../common/display-popup-modal";
import { erc20Abi } from "../contracts";

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
      await populateCollateralDropdown(collateralOptions);

      // handle collateral input
      handleCollateralInput(collateralOptions);

      // handle slippage checks
      handleSlippageInput();
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

  // We'll reference the mint button here as well so we can set it to "Loading..."
  const mintButton = document.getElementById("mintButton") as HTMLButtonElement;

  // Helper: show "Loading..." or re-enable the button
  const setButtonLoading = (isLoading: boolean, loadingText = "Loading...") => {
    if (!mintButton) return;
    if (isLoading) {
      mintButton.disabled = true;
      mintButton.textContent = loadingText;
    } else {
      mintButton.disabled = false;
    }
  };

  const debouncedInputHandler = debounce(async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);
    const isForceCollateralOnlyChecked = forceCollateralOnly.checked;

    // Immediately set button to loading while we compute output
    setButtonLoading(true);

    try {
      const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
      if (selectedCollateral) {
        currentOutput = await calculateMintOutput(selectedCollateral, dollarAmount, isForceCollateralOnlyChecked);
        displayMintOutput(currentOutput, selectedCollateral);

        // After we've computed everything, link the mint button
        // which also checks allowances and updates the button text
        await linkMintButton(collateralOptions);
      }
    } catch (err) {
      console.error(err);
      renderErrorInModal(err instanceof Error ? err : new Error(String(err)));
    } finally {
      // End the "loading" state. linkMintButton() will set final text.
      setButtonLoading(false);
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
      renderErrorInModal(new Error("Dollar slippage exceeded"));
    } else if (currentOutput.collateralNeeded.gt(maxCollateralIn)) {
      renderErrorInModal(new Error("Collateral slippage exceeded"));
    } else if (currentOutput.governanceNeeded.gt(maxGovernanceIn)) {
      renderErrorInModal(new Error("Governance slippage exceeded"));
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
  const formattedMintingFeeInDollar = parseFloat(ethers.utils.formatUnits(output.mintingFeeInDollar, 18)).toFixed(2);

  // Calculate dollar values using spot prices
  const totalDollarMintValue = output.totalDollarMint.mul(ethers.utils.parseUnits(dollarSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedTotalDollarMintValue = parseFloat(ethers.utils.formatUnits(totalDollarMintValue, 18)).toFixed(2);

  const collateralNeededValue = output.collateralNeeded.mul(ethers.utils.parseUnits(lusdPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedCollateralNeededValue = parseFloat(ethers.utils.formatUnits(collateralNeededValue, 18)).toFixed(2);

  const governanceNeededValue = output.governanceNeeded.mul(ethers.utils.parseUnits(governanceSpotPrice as string, 18)).div(ethers.constants.WeiPerEther);
  const formattedGovernanceNeededValue = parseFloat(ethers.utils.formatUnits(governanceNeededValue, 18)).toFixed(2);

  // Update the displayed values
  if (totalDollarMinted) {
    totalDollarMinted.textContent = `${formattedTotalDollarMint} UUSD ($${formattedTotalDollarMintValue})`;
  }
  if (collateralNeededElement) {
    collateralNeededElement.textContent = `${formattedCollateralNeeded} ${selectedCollateral.name} ($${formattedCollateralNeededValue})`;
  }
  if (governanceNeededElement) {
    governanceNeededElement.textContent = `${formattedGovernanceNeeded} UBQ ($${formattedGovernanceNeededValue})`;
  }
  if (mintingFeeElement) {
    mintingFeeElement.textContent = `${selectedCollateral.mintingFee}% (${formattedMintingFeeInDollar} UUSD)`;
  }
}

async function linkMintButton(collateralOptions: CollateralOption[]) {
  const mintButton = document.getElementById("mintButton") as HTMLButtonElement;
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;
  const dollarAmountInput = document.getElementById("dollarAmount") as HTMLInputElement;
  const forceCollateralOnly = document.getElementById("forceCollateralOnly") as HTMLInputElement;

  const dollarOutMinInput = document.getElementById("dollarOutMin") as HTMLInputElement;
  const maxCollateralInInput = document.getElementById("maxCollateralIn") as HTMLInputElement;
  const maxGovernanceInInput = document.getElementById("maxGovernanceIn") as HTMLInputElement;

  // Helper to set a quick loading state on the button
  const setButtonLoading = (isLoading: boolean, loadingText?: string) => {
    if (isLoading) {
      mintButton.disabled = true;
      if (loadingText) mintButton.textContent = loadingText;
    } else {
      mintButton.disabled = false;
    }
  };

  // Track the button label state: "Approve [Collateral]", "Approve UBQ", or "Mint".
  let buttonAction: "APPROVE_COLLATERAL" | "APPROVE_GOVERNANCE" | "MINT" | "DISABLED" = "DISABLED";

  const updateButtonState = async () => {
    // Default to disabled
    buttonAction = "DISABLED";
    mintButton.disabled = true;
    mintButton.textContent = "Mint";

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

    // If no inputs are needed, just set to MINT
    const neededCollateral = currentOutput.collateralNeeded;
    const neededGovernance = currentOutput.governanceNeeded;
    if (neededCollateral.isZero() && neededGovernance.isZero()) {
      buttonAction = "MINT";
      mintButton.disabled = false;
      mintButton.textContent = "Mint";
      return;
    }

    try {
      setButtonLoading(true, "Checking Allowances...");
      const userAddress = await userSigner.getAddress();

      // Collateral allowance check
      let isCollateralAllowanceOk = true;
      if (neededCollateral.gt(0)) {
        const collateralContract = new ethers.Contract(selectedCollateral.address, erc20Abi, userSigner);
        const allowanceCollateral: ethers.BigNumber = await collateralContract.allowance(userAddress, diamondContract.address);
        isCollateralAllowanceOk = allowanceCollateral.gte(neededCollateral);
      }
      // Governance allowance check
      let isGovernanceAllowanceOk = true;
      if (neededGovernance.gt(0)) {
        const allowanceGovernance: ethers.BigNumber = await governanceContract.connect(userSigner).allowance(userAddress, diamondContract.address);
        isGovernanceAllowanceOk = allowanceGovernance.gte(neededGovernance);
      }

      // Decide button text/behavior
      if (!isCollateralAllowanceOk) {
        buttonAction = "APPROVE_COLLATERAL";
        mintButton.disabled = false;
        mintButton.textContent = `Approve ${selectedCollateral.name}`;
      } else if (!isGovernanceAllowanceOk) {
        buttonAction = "APPROVE_GOVERNANCE";
        mintButton.disabled = false;
        mintButton.textContent = "Approve UBQ";
      } else {
        buttonAction = "MINT";
        mintButton.disabled = false;
        mintButton.textContent = "Mint";
      }
    } catch (err) {
      console.error(err);
    } finally {
      // Release the "loading" state in any case
      setButtonLoading(false);
    }
  };

  // Attach event listeners to update the button state whenever inputs change
  collateralSelect.addEventListener("change", updateButtonState);
  dollarAmountInput.addEventListener("input", updateButtonState);
  forceCollateralOnly.addEventListener("change", updateButtonState);

  mintButton.addEventListener("click", async () => {
    const selectedCollateralIndex = collateralSelect.value;
    const selectedCollateral = collateralOptions.find((option) => option.index.toString() === selectedCollateralIndex);
    if (!selectedCollateral) return;

    const dollarAmountRaw = dollarAmountInput.value;
    const dollarAmount = ethers.utils.parseUnits(dollarAmountRaw || "0", 18);
    const isForceCollateralOnlyChecked = forceCollateralOnly.checked;

    // use provided slippage values or default to min/max
    const dollarOutMin = dollarOutMinInput.value ? ethers.utils.parseUnits(dollarOutMinInput.value, 18) : ethers.BigNumber.from("0");
    const maxCollateralIn = maxCollateralInInput.value ? ethers.utils.parseUnits(maxCollateralInInput.value, 18) : ethers.constants.MaxUint256;
    const maxGovernanceIn = maxGovernanceInInput.value ? ethers.utils.parseUnits(maxGovernanceInInput.value, 18) : ethers.constants.MaxUint256;

    try {
      if (buttonAction === "APPROVE_COLLATERAL") {
        setButtonLoading(true, `Approving ${selectedCollateral.name}...`);
        const collateralContract = new ethers.Contract(selectedCollateral.address, erc20Abi, userSigner);
        const tx = await collateralContract.approve(diamondContract.address, ethers.constants.MaxUint256);
        await tx.wait();

        await updateButtonState();
      } else if (buttonAction === "APPROVE_GOVERNANCE") {
        setButtonLoading(true, "Approving UBQ...");
        const governanceToken = governanceContract.connect(userSigner);
        const tx = await governanceToken.approve(diamondContract.address, ethers.constants.MaxUint256);
        await tx.wait();

        await updateButtonState();
      } else if (buttonAction === "MINT") {
        setButtonLoading(true, "Minting...");
        const signerDiamondContract = diamondContract.connect(userSigner);

        console.log("Mint Input", {
          selectedCollateralIndex: parseInt(selectedCollateralIndex),
          dollarAmount: dollarAmount.toString(),
          dollarOutMin: dollarOutMin.toString(),
          maxCollateralIn: maxCollateralIn.toString(),
          maxGovernanceIn: maxGovernanceIn.toString(),
          isForceCollateralOnlyChecked,
        });

        await signerDiamondContract.mintDollar(
          parseInt(selectedCollateralIndex),
          dollarAmount,
          dollarOutMin,
          maxCollateralIn,
          maxGovernanceIn,
          isForceCollateralOnlyChecked
        );

        alert("Minting transaction sent successfully!");
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
