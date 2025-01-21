import { loadPage1 } from "./controllers/page1";
import { loadPage2 } from "./controllers/page2";
import { redirectTo404 } from "./controllers/404";
import { loadHomePage } from "./controllers/home";

// URL Path based routing
export async function handleRouting() {
  const contentArea = document.getElementById("content-area");

  if (!contentArea) return;

  // Normalize route to handle default case
  const route = window.location.hash || "#/home";

  switch (route) {
    case "#/home":
    case "#/index":
      await loadHomePage();
      break;
    case "#/page1":
      await loadPage1();
      break;
    case "#/page2":
      await loadPage2();
      break;
    default:
      // Redirect to 404 page if no route matches
      await redirectTo404();
      break;
  }
}

export function setupRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", () => {
      handleRouting().catch(console.error);
    });

    handleRouting().catch(console.error);
  }
}
