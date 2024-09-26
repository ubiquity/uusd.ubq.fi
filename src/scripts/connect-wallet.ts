import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { truncateString } from "./utils";

let client: ReturnType<typeof createWalletClient> | null = null;

type WalletProvider = {
  isMetaMask: boolean;
  isCoinbaseWallet: boolean;
};

type ModifiedWindow = Window &
  typeof globalThis & {
    ethereum: any; //eslint-disable-line @typescript-eslint/no-explicit-any
  };

export function updateConnectButtonText(text: string, isConnecting: boolean = false) {
  const connectButton = document.querySelector("#connect-button") as HTMLButtonElement;
  let innerHtml = `<span>Connect Wallet</span>`;

  if (isConnecting) innerHtml = `<span>Connecting...</span>`;
  else if (client !== null) innerHtml = `<span>${text}</span>`;

  connectButton.innerHTML = innerHtml;
}

async function connectWallet(providerKey?: keyof WalletProvider) {
  const ethereum = (window as ModifiedWindow).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    let provider = ethereum;

    if (ethereum.providers?.length && !!providerKey) {
      provider = ethereum.providers.find((p: WalletProvider) => p[providerKey]);
    }

    try {
      updateConnectButtonText("", true);
      const [account] = await provider.request({ method: "eth_requestAccounts" });
      client = createWalletClient({
        account,
        chain: mainnet,
        transport: custom(provider),
      });

      updateConnectButtonText(truncateString(account));
      wireEvents(provider);
    } catch (error) {
      updateConnectButtonText("");
    }
  }
}

export async function connectIfAuthorized() {
  const providerKeys = ["isMetaMask", "isCoinbaseWallet"];
  const ethereum = (window as ModifiedWindow).ethereum;
  let provider = ethereum;

  if (typeof ethereum !== "undefined" && ethereum !== null && ethereum.providers?.length) {
    for (const providerKey of providerKeys) {
      provider = ethereum.providers.find((p: WalletProvider) => p[providerKey as keyof WalletProvider]);

      if (provider) break;
    }
  }

  if (provider) {
    const accounts: `0x${string}`[] = await provider.request({ method: "eth_accounts" });

    if (accounts.length) {
      const [account] = accounts;
      client = createWalletClient({
        account,
        chain: mainnet,
        transport: custom(provider),
      });

      updateConnectButtonText(truncateString(account));
    }
  }
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
function wireEvents(provider: any) {
  provider.on("accountsChanged", ([account]: Array<`0x${string}`>) => {
    client = createWalletClient({
      account,
      chain: mainnet,
      transport: custom(provider),
    });

    updateConnectButtonText(truncateString(account));
  });
}

function initMetamaskConnection() {
  const metamaskConnectButton = document.querySelector("#connect-button") as HTMLButtonElement;

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
