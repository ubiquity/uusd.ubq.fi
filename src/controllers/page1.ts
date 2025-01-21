import { createPage1Content } from "../components/component1";

export async function loadPage1() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      const content = createPage1Content();
      contentArea.innerHTML = content;
    } catch (error) {
      console.error("Failed to load page 1:", error);
    }
  }
}
