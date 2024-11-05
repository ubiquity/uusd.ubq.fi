export function loadRedeemPage() {
  const contentArea = document.getElementById("content-area");
  if (contentArea) {
    fetch("redeem.html")
      .then((response) => response.text())
      .then((html) => {
        contentArea.innerHTML = html;
      })
      .catch((error) => console.error("Error loading redeem page:", error));
  }
}
