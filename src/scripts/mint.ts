import { getAllCollaterals, getCollateralInformation } from "./on-chain";
import { collateralSelect } from "./ui";

export async function initCollateralList() {
  if (collateralSelect !== null) {
    const collaterals = await getAllCollaterals();
    const collateralInformation = await Promise.all(collaterals.map(getCollateralInformation));
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
