import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { truncateString } from "./utils";
import { connectButton, connectPrompt, whiteContainer, providersModal } from "./ui";
import { unwatchForPrices, watchForPrices } from "./price-polling";
import { type MetaMaskInpageProvider } from "@metamask/providers";

let client: ReturnType<typeof createWalletClient> | null = null;

type ModifiedWindow = Window &
  typeof globalThis & {
    ethereum: MetaMaskInpageProvider & { isCoinbaseWallet: boolean; isTrust: boolean };
  };

export function updateConnectButtonText(text: string, isConnecting: boolean = false) {
  let innerHtml = `<span>Connect Wallet</span>`;

  if (isConnecting) innerHtml = `<span>Connecting...</span>`;
  else if (client !== null) innerHtml = `<span>${text}</span>`;

  connectButton.innerHTML = innerHtml;
}

export async function connectWallet(providerType: "metamask" | "trust" | "coinbase") {
  const ethereum = (window as ModifiedWindow).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    let isRightProvider = false;

    if (providerType === "metamask") isRightProvider = ethereum.isMetaMask;
    else if (providerType === "trust") isRightProvider = ethereum.isTrust;
    else if (providerType === "coinbase") isRightProvider = ethereum.isCoinbaseWallet;

    if (isRightProvider) {
      try {
        updateConnectButtonText("", true);
        const accounts = await ethereum.request<string[]>({ method: "eth_requestAccounts" });
        client = createWalletClient({
          account: accounts?.[0] as `0x${string}`,
          chain: mainnet,
          transport: custom(ethereum),
        });

        updateConnectButtonText(truncateString(accounts?.[0] as string));
        wireEvents(ethereum);

        watchForPrices();

        connectPrompt.classList.remove("visible");
        whiteContainer.classList.add("visible");

        if (providersModal.open) {
          providersModal.close();
        }
      } catch (error) {
        updateConnectButtonText("");
      }
    }
  }
}

export async function disconnectWallet() {
  const ethereum = (window as ModifiedWindow).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    try {
      await ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      client = null;

      unwatchForPrices();

      updateConnectButtonText("Connect Wallet");
      connectPrompt.classList.add("visible");
      whiteContainer.classList.remove("visible");
    } catch (error) {
      updateConnectButtonText("");
    }
  }
}

export async function connectIfAuthorized() {
  const ethereum = (window as ModifiedWindow).ethereum;

  if (ethereum) {
    const accounts = await ethereum.request<string[]>({ method: "eth_accounts" });

    if (accounts && accounts.length) {
      const [account] = accounts;
      client = createWalletClient({
        account: account as `0x${string}`,
        chain: mainnet,
        transport: custom(ethereum),
      });

      watchForPrices();
      updateConnectButtonText(truncateString(account as string));
      connectPrompt.classList.remove("visible");
      whiteContainer.classList.add("visible");
    }
  }
}

function wireEvents(provider: MetaMaskInpageProvider & { isCoinbaseWallet: boolean; isTrust: boolean }) {
  provider.on("accountsChanged", (accounts: unknown) => {
    const [account] = accounts as `0x${string}`[];
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
