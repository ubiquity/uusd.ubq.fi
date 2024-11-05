export function loadMintPage() {
  const contentArea = document.getElementById("content-area");
  if (contentArea) {
    fetch("mint.html")
      .then((response) => response.text())
      .then((html) => {
        contentArea.innerHTML = html;
      })
      .catch((error) => console.error("Error loading mint page:", error));
  }
}
