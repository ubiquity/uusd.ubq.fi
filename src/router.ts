import { loadHomePage } from "./pages/home";
import { loadMintPage } from "./pages/mint";
import { loadRedeemPage } from "./pages/redeem";

// URL Path based routing
function handleRouting() {
  const contentArea = document.getElementById("content-area");

  if (!contentArea) return;

  switch (window.location.hash) {
    case "#/mint":
      loadMintPage();
      break;
    case "#/redeem":
      loadRedeemPage();
      break;
    case "":
    case "#/":
    case "#/index.html":
      loadHomePage();
      break;
    default:
      // Redirect to home if no route matches
      window.location.hash = "#/";
      break;
  }
}

// Run handleRouting on hashchange and DOMContentLoaded
window.addEventListener("hashchange", handleRouting);
document.addEventListener("DOMContentLoaded", handleRouting);

export {};
