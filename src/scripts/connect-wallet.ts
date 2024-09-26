import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { truncateString } from "./utils";
import { connectButton, connectPrompt, providersModal } from "./ui";

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
  let innerHtml = `<span>Connect Wallet</span>`;

  if (isConnecting) innerHtml = `<span>Connecting...</span>`;
  else if (client !== null) innerHtml = `<span>${text}</span>`;

  connectButton.innerHTML = innerHtml;
}

export async function connectWallet(providerKey?: keyof WalletProvider) {
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

      connectPrompt.classList.remove("visible");

      if (providersModal.open) {
        providersModal.close();
      }
    } catch (error) {
      updateConnectButtonText("");
    }
  }
}

export async function disconnectWallet() {
  const ethereum = (window as ModifiedWindow).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    let provider = ethereum;

    if (ethereum.providers?.length) {
      provider = ethereum.providers.find((p: WalletProvider) => p.isCoinbaseWallet || p.isMetaMask);
    }

    try {
      await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      client = null;

      updateConnectButtonText("Connect Wallet");
      connectPrompt.classList.add("visible");
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
      connectPrompt.classList.remove("visible");
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

  provider.on("disconnect", () => {
    client = null;
  });
}

export function getConnectedClient() {
  return client;
}
