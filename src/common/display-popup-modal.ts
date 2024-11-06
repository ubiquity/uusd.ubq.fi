export function renderErrorInModal(error: Error) {
  const modal = document.getElementById("modal");
  const closeButton = document.getElementsByClassName("close-modal");
  if (closeButton) {
    closeButton[0].addEventListener("click", closeErrorModal);
  }
  const errorMessageElement = document.getElementById("error-message");

  if (errorMessageElement) {
    errorMessageElement.textContent = `${error.message}\n\n${error.stack || ""}`;
  }

  if (modal) {
    modal.style.display = "flex";
  }
}

export function closeErrorModal() {
  const modal = document.getElementById("modal");
  if (modal) {
    modal.style.display = "none";
  }
}
