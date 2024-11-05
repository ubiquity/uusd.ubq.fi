import { ethers } from "ethers";
import { diamondContract } from "../main";

export async function loadHomePage() {
  const contentArea = document.getElementById("content-area");

  if (contentArea) {
    try {
      // load Home HTML
      const response = await fetch("/home.html");
      const html = await response.text();
      contentArea.innerHTML = html;

      // retrieve the SPOT price from Pool
      const spotPriceRaw = await diamondContract.getDollarPriceUsd();
      const spotPrice = ethers.utils.formatUnits(spotPriceRaw, 6);

      // write SPOT price to page
      const spotPriceElement = contentArea.querySelector("#DollarPrice p:first-of-type");
      if (spotPriceElement) {
        spotPriceElement.textContent = `$ ${spotPrice} (SPOT)`;
      }

      // twap is dead for now

      // // retrieve the TWAP price
      // const twapPriceRaw = await twapOracleContract.consult(dollarAddress);
      // const twapPrice = ethers.utils.formatUnits(twapPriceRaw, 6); // Adjust decimal places if needed

      // // write TWAP price to page
      // const twapPriceElement = contentArea.querySelector("#DollarPrice p:nth-of-type(2)");
      // if (twapPriceElement) {
      //   twapPriceElement.textContent = `$ ${twapPrice} (TWAP)`;
      // }
    } catch (error) {
      console.error("Error on home page:", error);
    }
  }
}
