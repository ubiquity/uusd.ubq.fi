export function toggleSlippageSettings() {
  const toggleButton = document.getElementById("toggleSlippageSettings") as HTMLButtonElement;
  const slippageSettings = document.getElementById("slippageSettings") as HTMLDivElement;

  toggleButton.addEventListener("click", () => {
    slippageSettings.classList.toggle("hidden");
    toggleButton.textContent = slippageSettings.classList.contains("hidden") ? "Show Slippage Settings" : "Hide Slippage Settings";
  });
}
