import { appState, explorersUrl } from "../main";

export function renderErrorInModal(error: Error) {
  const modal = document.getElementById("error-modal");
  const closeButton = document.getElementsByClassName("error-close-modal");
  if (closeButton) {
    closeButton[0].addEventListener("click", closeErrorModal);
  }
  const errorMessageElement = document.getElementById("error-message");

  if (errorMessageElement) {
    errorMessageElement.textContent = `${error.message}\n\n${window.location.hostname === "localhost" ? "localhost: check error.stack at console" : ""}`;
  }

  if (modal) {
    modal.style.display = "flex";
  }
}

export function closeErrorModal() {
  const modal = document.getElementById("error-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

export function renderSuccessModal(transactionHash: string) {
  const modal = document.getElementById("success-modal");
  const closeButton = document.getElementsByClassName("success-close-modal");
  if (closeButton) {
    closeButton[0].addEventListener("click", closeSuccessModal);
  }
  const successMessageElement = document.getElementById("success-message");

  if (successMessageElement) {
    successMessageElement.innerHTML = `You've successfully signed the transaction. Your allowance balance should be updated in a few blocks.<br><br>transaction hash: <span class="tx-hash">${transactionHash}</span>`;
    const chainId = appState.getChainId();
    const explorerUrl = chainId !== undefined ? explorersUrl[chainId] : "https://etherscan.io";
    const txLink = document.createElement("a");
    txLink.href = `${explorerUrl}/tx/${transactionHash}`;
    txLink.target = "_blank";
    txLink.rel = "noopener noreferrer";
    txLink.style.color = "white";
    txLink.textContent = transactionHash;

    const txHashElement = successMessageElement.querySelector(".tx-hash");
    if (txHashElement) {
      txHashElement.innerHTML = "";
      txHashElement.appendChild(txLink);
    }
  }

  if (modal) {
    modal.style.display = "flex";
  }
}

export function closeSuccessModal() {
  const modal = document.getElementById("success-modal");
  if (modal) {
    modal.style.display = "none";
  }
}
