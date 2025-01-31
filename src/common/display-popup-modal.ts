export function renderErrorInModal(error: Error) {
  const modal = document.getElementById("modal");
  const closeButton = document.getElementsByClassName("close-modal");
  if (closeButton) {
    closeButton[0].addEventListener("click", closeErrorModal);
  }
  const errorMessageElement = document.getElementById("error-message");

  const errorStack = window.location.href.includes("localhost") ? "Check console for error stack." : "";
  if (errorMessageElement) {
    errorMessageElement.textContent = `
      ${error.message}\n\n
      ${errorStack}
    `;
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
