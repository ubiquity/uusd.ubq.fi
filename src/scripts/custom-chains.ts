import { defineChain } from "viem";

export const localhost = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://localhost:8545"],
      webSocket: ["wss://localhost:8545"],
    },
  },
});
