import { connectWallet, disconnectWallet, getConnectedClient } from "./connect-wallet";

export const connectPrompt = document.querySelector("#connect-prompt") as HTMLDivElement;
export const connectButton = document.querySelector("#connect-button") as HTMLButtonElement;
export const providersModal = document.querySelector("#providers-modal") as HTMLDialogElement;
export const closeModalButton = document.querySelector("#close-modal") as HTMLButtonElement;

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
    await connectWallet("isMetaMask");
  });

  cbConnectButton.addEventListener("click", async () => {
    await connectWallet("isCoinbaseWallet");
  });

  trustConnectButton.addEventListener("click", async () => {
    await connectWallet("isTrust");
  });
}
