import { loadHomePage } from "./pages/home";
import { loadMintPage } from "./pages/mint";
import { loadRedeemPage } from "./pages/redeem";

// URL Path based routing
function handleRouting() {
  console.log("Routing");
  const contentArea = document.getElementById("content-area");

  if (!contentArea) return;

  switch (window.location.pathname) {
    case "/mint":
      loadMintPage();
      break;
    case "/redeem":
      loadRedeemPage();
      break;
    case "/":
    case "/index.html":
      loadHomePage();
      break;
    default:
      // Redirect to home ("/") if no route matches
      window.location.href = "/";
      break;
  }
}

// Attach the routing function to DOMContentLoaded
document.addEventListener("DOMContentLoaded", handleRouting);

export {};
