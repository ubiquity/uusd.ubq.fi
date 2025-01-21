import { createHomePage } from "../components/home";

export async function loadHomePage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      const content = createHomePage();
      contentArea.innerHTML = content;
    } catch (error) {
      console.error("Failed to load home page:", error);
    }
  }
}
