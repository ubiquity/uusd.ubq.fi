export function loadHomePage() {
  const contentArea = document.getElementById("content-area");
  if (contentArea) {
    fetch("/home.html")
      .then((response) => response.text())
      .then((html) => {
        contentArea.innerHTML = html;
      })
      .catch((error) => console.error("Error loading home page:", error));
  }
}
