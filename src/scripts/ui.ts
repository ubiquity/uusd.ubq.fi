import { connectWallet, disconnectWallet, getConnectedClient } from "./connect-wallet";

export const connectPrompt = document.querySelector("#connect-prompt") as HTMLDivElement;
export const connectButtons = document.querySelectorAll("[connectButton]") as NodeListOf<HTMLButtonElement>;
export const providersModal = document.querySelector("#providers-modal") as HTMLDialogElement;
export const closeModalButton = document.querySelector("#close-modal") as HTMLButtonElement;
export const whiteContainer = document.querySelector("#white-container") as HTMLDivElement;
export const uusdPriceText = document.querySelector("#uusd-price") as HTMLSpanElement;
export const governancePriceText = document.querySelector("#governance-price") as HTMLSpanElement;
export const totalCollateralValueText = document.querySelector("#total-collateral-value") as HTMLSpanElement;
export const collateralSelect = document.querySelector("#collateral-select") as HTMLSelectElement;

// Mint UI
export const governanceFormControl = document.querySelector("#governance-form-control") as HTMLLabelElement;
export const governanceInput = document.querySelector("#governance-input") as HTMLInputElement;
export const collateralInput = document.querySelector("#collateral-input") as HTMLInputElement;
export const dollarInput = document.querySelector("#dollar-input") as HTMLInputElement;
export const allowanceButton = document.querySelector("#allowance-button") as HTMLButtonElement;
export const mintButton = document.querySelector("#mint-button") as HTMLButtonElement;
export const governanceCheckBox = document.querySelector("#governance-check") as HTMLInputElement;

// Redeem UI
export const redeemDollarButton = document.querySelector("#redeem-dollar-button") as HTMLButtonElement;
export const collectRedemptionButton = document.querySelector("#collect-redemption-button") as HTMLButtonElement;

// Providers
const metamaskConnectButton = document.querySelector("#mm-button") as HTMLButtonElement;
const cbConnectButton = document.querySelector("#cb-button") as HTMLButtonElement;
const trustConnectButton = document.querySelector("#trust-button") as HTMLButtonElement;

// Message displays
export const toast = document.querySelector("#toast") as HTMLDivElement;

export function initUiEvents() {
  connectButtons.forEach((connectButton) => {
    connectButton.addEventListener("click", () => {
      const client = getConnectedClient();

      if (client === null) providersModal.showModal();
      else {
        disconnectWallet()
          .then(() => console.info("Wallet disconnected"))
          .catch(console.error);
      }
    });
  });

  closeModalButton.addEventListener("click", () => {
    providersModal.close();
  });

  metamaskConnectButton.addEventListener("click", async () => {
    await connectWallet("metamask");
  });

  cbConnectButton.addEventListener("click", async () => {
    await connectWallet("trust");
  });

  trustConnectButton.addEventListener("click", async () => {
    await connectWallet("coinbase");
  });
}
