export async function redirectTo404() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      window.location.href = "https://dao.ubq.fi/404";
    } catch (error) {
      console.error("Failed to load 404 page:", error);
    }
  }
}
