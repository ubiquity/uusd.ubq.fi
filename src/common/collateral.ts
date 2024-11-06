import { ethers } from "ethers";
import { diamondContract } from "../main";

export interface CollateralOption {
  index: number;
  name: string;
  address: string;
  mintingFee: number;
  redemptionFee: number;
  missingDecimals: number;
}

export async function fetchCollateralOptions(): Promise<CollateralOption[]> {
  const collateralAddresses: string[] = await diamondContract.allCollaterals();
  return (
    await Promise.all(
      collateralAddresses.map(async (address) => {
        const info = await diamondContract.collateralInformation(address);
        return {
          index: info.index.toNumber(),
          name: info.symbol,
          address: address,
          mintingFee: parseFloat(ethers.utils.formatUnits(info.mintingFee, 6)), // 1e6 precision
          redemptionFee: parseFloat(ethers.utils.formatUnits(info.redemptionFee, 6)), // 1e6 precision
          missingDecimals: info.missingDecimals.toNumber(),
          isEnabled: info.isEnabled,
          isMintPaused: info.isMintPaused,
        };
      })
    )
  ).filter((option) => option.isEnabled && !option.isMintPaused);
}

export async function populateCollateralDropdown(collateralOptions: CollateralOption[]) {
  const collateralSelect = document.getElementById("collateralSelect") as HTMLSelectElement;

  // check if the dropdown element is still available (prevents errors on mid-function page switch)
  if (!collateralSelect) {
    console.warn("Collateral dropdown is no longer available. Skipping population.");
    return;
  }

  // clear previous options to avoid duplicate entries if this function runs multiple times
  collateralSelect.innerHTML = `<option value="">Select a collateral</option>`;

  collateralOptions.forEach(({ index, name }) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.text = name;
    collateralSelect.appendChild(option);
  });
}
