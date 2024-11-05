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

      // write price to page
      const spotPriceElement = contentArea.querySelector("#DollarPrice p:first-of-type");

      if (spotPriceElement) {
        spotPriceElement.textContent = `$ ${spotPrice} (SPOT)`;
      }
    } catch (error) {
      console.error("Error on home page:", error);
    }
  }
}
