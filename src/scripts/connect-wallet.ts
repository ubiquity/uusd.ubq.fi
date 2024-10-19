import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { truncateString } from "./utils";
import { connectButtons, connectPrompt, whiteContainer, providersModal } from "./ui";
import { unwatchForPrices, watchForPrices } from "./price-polling";
import { type MetaMaskInpageProvider } from "@metamask/providers";

let client: ReturnType<typeof createWalletClient> | null = null;

type ModifiedWindow = Window &
  typeof globalThis & {
    ethereum: MetaMaskInpageProvider & {
      isCoinbaseWallet: boolean;
      isTrust: boolean;
      providers?: (MetaMaskInpageProvider & { isCoinbaseWallet: boolean; isTrust: boolean })[];
    };
  };

export function updateConnectButtonText(text: string, isConnecting: boolean = false) {
  let innerHtml = `<span>Connect Wallet</span>`;

  if (isConnecting) innerHtml = `<span>Connecting...</span>`;
  else if (client !== null) innerHtml = `<span>${text}</span>`;

  connectButtons.forEach((connectButton) => {
    connectButton.innerHTML = innerHtml;
  });
}

export async function connectWallet(providerType: "metamask" | "trust" | "coinbase") {
  const ethereum = (window as ModifiedWindow).ethereum;
  if (typeof ethereum !== "undefined" && ethereum !== null) {
    let provider = ethereum;

    if (ethereum.providers?.length) {
      switch (providerType) {
        case "metamask":
          provider = ethereum.providers.find((p) => p.isMetaMask) as typeof ethereum;
          break;
        case "trust":
          provider = ethereum.providers.find((p) => p.isTrust) as typeof ethereum;
          break;
        case "coinbase":
          provider = ethereum.providers.find((p) => p.isCoinbaseWallet) as typeof ethereum;
          break;
      }
    }
    try {
      updateConnectButtonText("", true);
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      client = createWalletClient({
        account: accounts?.[0] as `0x${string}`,
        chain: mainnet,
        transport: custom(provider),
      });

      updateConnectButtonText(truncateString(accounts?.[0] as string));
      wireEvents(provider);

      watchForPrices();

      connectPrompt.classList.add("hidden");
      whiteContainer.classList.replace("hidden", "flex");

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
    try {
      let provider = ethereum;

      if (ethereum.providers?.length) {
        provider = ethereum.providers.find((p) => p.isCoinbaseWallet || p.isMetaMask || p.isTrust) as typeof ethereum;
      }
      await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      client = null;

      unwatchForPrices();

      updateConnectButtonText("Connect Wallet");
      connectPrompt.classList.remove("hidden");
      whiteContainer.classList.replace("flex", "hidden");
    } catch (error) {
      updateConnectButtonText("");
    }
  }
}

export async function connectIfAuthorized() {
  const ethereum = (window as ModifiedWindow).ethereum;

  let provider = ethereum;

  if (ethereum.providers?.length) {
    provider = ethereum.providers.find((p) => p.isCoinbaseWallet || p.isMetaMask || p.isTrust) as typeof ethereum;
  }

  if (provider) {
    const accounts = await provider.request<string[]>({ method: "eth_accounts" });

    if (accounts && accounts.length) {
      const [account] = accounts;
      client = createWalletClient({
        account: account as `0x${string}`,
        chain: mainnet,
        transport: custom(provider),
      });

      watchForPrices();
      updateConnectButtonText(truncateString(account as string));
      connectPrompt.classList.add("hidden");
      whiteContainer.classList.replace("hidden", "flex");
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
