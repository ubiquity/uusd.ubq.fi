import { createPage2Content } from "../components/component2";

export async function loadPage2() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      const content = createPage2Content(); // Use a reusable component
      contentArea.innerHTML = content;
    } catch (error) {
      console.error("Failed to load page 2:", error);
    }
  }
}
