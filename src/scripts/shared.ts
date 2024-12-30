import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { localhost } from "./custom-chains";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://1rpc.io/eth"),
});

export const localhostClient = createPublicClient({
  chain: localhost,
  transport: http(),
});
