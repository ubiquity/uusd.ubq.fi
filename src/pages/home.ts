export function loadHomePage() {
  const contentArea = document.getElementById("content-area");
  if (contentArea) {
    contentArea.innerHTML = `<h1>Home Page</h1>`;
  }
}
