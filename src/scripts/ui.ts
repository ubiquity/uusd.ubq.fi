import { connectWallet, disconnectWallet, getConnectedClient } from "./connect-wallet";

export const connectPrompt = document.querySelector("#connect-prompt") as HTMLDivElement;
export const connectButton = document.querySelector("#connect-button") as HTMLButtonElement;
export const providersModal = document.querySelector("#providers-modal") as HTMLDialogElement;
export const closeModalButton = document.querySelector("#close-modal") as HTMLButtonElement;
export const whiteContainer = document.querySelector(".white-container") as HTMLDivElement;
export const uusdPriceText = document.querySelector("#uusd-price") as HTMLSpanElement;
export const governancePriceText = document.querySelector("#governance-price") as HTMLSpanElement;
export const totalCollateralValueText = document.querySelector("#total-collateral-value") as HTMLSpanElement;
export const collateralSelect = document.querySelector("#collateral-select") as HTMLSelectElement;

// Providers
const metamaskConnectButton = document.querySelector("#mm-button") as HTMLButtonElement;
const cbConnectButton = document.querySelector("#cb-button") as HTMLButtonElement;
const trustConnectButton = document.querySelector("#trust-button") as HTMLButtonElement;

export function initUiEvents() {
  connectButton.addEventListener("click", () => {
    const client = getConnectedClient();

    if (client === null) providersModal.showModal();
    else {
      disconnectWallet()
        .then(() => console.info("Wallet disconnected"))
        .catch(console.error);
    }
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
