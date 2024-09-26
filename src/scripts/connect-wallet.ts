import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { ellipsize } from "./utils";

let client: ReturnType<typeof createWalletClient> | null = null;

function updateConnectButtonText(text: string, isConnecting: boolean = false) {
  const connectButton = document.querySelector("#connect-button") as HTMLButtonElement;
  connectButton.innerHTML = isConnecting ? `<span>Connecting...</span>` : client !== null ? `<span>${text}</span>` : ``;
}

async function connectWallet(providerKey?: string) {
  const ethereum = (window as any).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    let provider = ethereum;

    if (ethereum.providers?.length && !!providerKey) {
      provider = ethereum.providers.find((p: any) => p[providerKey]);
    }

    try {
      updateConnectButtonText("", true);
      const [account] = await provider.request({ method: "eth_requestAccounts" });
      client = createWalletClient({
        account,
        chain: mainnet,
        transport: custom(provider),
      });

      updateConnectButtonText(ellipsize(account));
    } catch (error: any) {
      updateConnectButtonText("");
    }
  }
}

function initMetamaskConnection() {
  const metamaskConnectButton = document.querySelector("#mm-button") as HTMLButtonElement;

  metamaskConnectButton.addEventListener("click", async () => {
    await connectWallet("isMetaMask");
  });
}

function initCoinbaseConnection() {
  const cbConnectButton = document.querySelector("#cb-button") as HTMLButtonElement;

  cbConnectButton.addEventListener("click", async () => {
    await connectWallet("isCoinbaseWallet");
  });
}

export function initClickEvents() {
  initMetamaskConnection();
  initCoinbaseConnection();
}

export function getConnectedClient() {
  return client;
}
