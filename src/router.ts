import { loadHomePage } from "./pages/home";
import { loadMintPage } from "./pages/mint";
import { loadRedeemPage } from "./pages/redeem";

// URL Path based routing
export async function handleRouting() {
  const contentArea = document.getElementById("content-area");

  if (!contentArea) return;

  switch (window.location.hash) {
    case "#/mint":
      await loadMintPage();
      break;
    case "#/redeem":
      await loadRedeemPage();
      break;
    case "":
    case "#/":
    case "#/index.html":
      await loadHomePage();
      break;
    default:
      // Redirect to home if no route matches
      window.location.hash = "#/";
      break;
  }
}

// Run handleRouting on hashchange
window.addEventListener("hashchange", handleRouting);

export {};
