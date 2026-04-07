import { writeFileSync } from "fs";

async function generateTokenList() {
  const response = await fetch("https://tokens.uniswap.org/");
  if (!response.ok) {
    throw new Error(`Failed to fetch token list: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();

  const tokens = data.tokens.filter((token: any) => token.chainId === 1);

  const lusdToken = {
    symbol: "LUSD",
    address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
    decimals: 18,
    name: "LUSD",
  };

  const tokenList = tokens
    .map((token: any) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    }))
    .filter((token: any) => token.address.toLowerCase() !== lusdToken.address.toLowerCase());

  writeFileSync("src/constants/token-list.json", JSON.stringify([lusdToken, ...tokenList], null, 2));
  console.log("Token list generated with", tokenList.length, "tokens.");
}

generateTokenList().catch((error) => {
  console.error("Error generating token list:", error);
  process.exit(1);
});
