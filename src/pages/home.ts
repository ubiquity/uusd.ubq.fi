import { dollarSpotPrice, governanceSpotPrice } from "../main";

export async function loadHomePage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      // load Home HTML
      const response = await fetch("/home.html");
      const html = await response.text();
      contentArea.innerHTML = html;

      // write dollar spot price to page
      const dollarSpotPriceElement = contentArea.querySelector("#DollarPrice p:first-of-type");
      if (dollarSpotPriceElement) {
        dollarSpotPriceElement.textContent = `$ ${dollarSpotPrice} (SPOT)`;
      }

      // write governance spot price to page
      const governanceSpotPriceElement = contentArea.querySelector("#DollarPrice p:nth-of-type(2)");
      if (governanceSpotPriceElement) {
        governanceSpotPriceElement.textContent = `$ ${governanceSpotPrice} (SPOT)`;
      }

      // // write TWAP price to page
      // const twapPriceElement = contentArea.querySelector("#DollarPrice p:nth-of-type(3)");
      // if (twapPriceElement) {
      //   twapPriceElement.textContent = `$ ${twapPrice} (TWAP)`;
      // }
    } catch (error) {
      console.error("Error on home page:", error);
    }
  }
}
