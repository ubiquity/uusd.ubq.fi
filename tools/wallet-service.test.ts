import { afterEach, beforeEach, expect, mock, test } from "bun:test";

type Account = { address?: `0x${string}`; isConnected: boolean; status: string; chainId?: number };
const firstAddress = "0x1111111111111111111111111111111111111111";
const secondAddress = "0x2222222222222222222222222222222222222222";
const mainnet = { id: 1, name: "Ethereum" };
const gnosis = { id: 100, name: "Gnosis" };
const arbitrum = { id: 42161, name: "Arbitrum" };
const chains = [mainnet, gnosis, arbitrum];
let account: Account;
const accountListeners = new Set<() => void>();
const modalListeners = new Set<(state: { open: boolean }) => void>();
const storage = new Map<string, string>();
const adapterOptions: unknown[] = [];
const appKitOptions: unknown[] = [];
const signMessage = mock(() => Promise.resolve("0xsignature"));
const writeContract = mock(() => Promise.resolve("0xtransaction"));

function setAccount(address?: `0x${string}`, chainId = 1) {
  account = { address, chainId, isConnected: Boolean(address), status: address ? "connected" : "disconnected" };
  for (const listener of accountListeners) listener();
}

function setModal(isOpen: boolean) {
  for (const listener of modalListeners) listener({ open: isOpen });
}

function createClient() {
  return { chain: chains.find((chain) => chain.id === account.chainId), account: { address: account.address }, signMessage, writeContract };
}

const resolveClient = mock(() => Promise.resolve(createClient()));
const reconnect = mock(() => Promise.resolve());
const disconnect = mock(() => Promise.resolve(setAccount()));
const open = mock(() => Promise.resolve(setModal(true)));
const appKit = {
  open,
  subscribeState(listener: (state: { open: boolean }) => void) {
    modalListeners.add(listener);
    return () => modalListeners.delete(listener);
  },
};

mock.module("@wagmi/core", () => ({
  getAccount: () => account,
  getWalletClient: resolveClient,
  reconnect,
  disconnect,
  watchAccount: (_config: unknown, options: { onChange: () => void }) => {
    accountListeners.add(options.onChange);
    return () => accountListeners.delete(options.onChange);
  },
}));
mock.module("@reown/appkit", () => ({
  createAppKit: (options: unknown) => {
    appKitOptions.push(options);
    return appKit;
  },
}));
mock.module("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    wagmiConfig = {};
    constructor(options: unknown) {
      adapterOptions.push(options);
    }
  },
}));
mock.module("@reown/appkit/networks", () => ({ mainnet, gnosis, arbitrum }));
mock.module("viem/chains", () => ({ mainnet }));
mock.module("viem", () => ({
  createPublicClient: (options: unknown) => options,
  http: (url: string) => url,
  parseUnits: () => 0n,
}));

Reflect.set(globalThis, "location", { origin: "https://uusd.ubq.fi" });
Reflect.set(globalThis, "window", { location: { origin: "https://uusd.ubq.fi", hostname: "uusd.ubq.fi" } });
Reflect.set(globalThis, "localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});
Reflect.set(globalThis, "__REOWN_PROJECT_ID__", "");

const { WalletService, WALLET_EVENTS } = await import("../src/services/wallet-service.ts");
let service: InstanceType<typeof WalletService>;

beforeEach(() => {
  Reflect.set(globalThis, "__REOWN_PROJECT_ID__", "public-test-project");
  account = { isConnected: false, status: "disconnected" };
  storage.clear();
  resolveClient.mockReset();
  resolveClient.mockImplementation(() => Promise.resolve(createClient()));
  reconnect.mockReset();
  reconnect.mockImplementation(() => Promise.resolve());
  disconnect.mockReset();
  disconnect.mockImplementation(() => Promise.resolve(setAccount()));
  open.mockReset();
  open.mockImplementation(() => Promise.resolve(setModal(true)));
  signMessage.mockClear();
  writeContract.mockClear();
  service = new WalletService();
});

afterEach(() => service.destroy());

async function connectWallet(address: `0x${string}` = firstAddress, chainId = 1) {
  const result = service.connect();
  setAccount(address, chainId);
  await result;
}

async function flushUpdates() {
  await Bun.sleep(0);
}

test("missing project ID fails clearly without breaking read-only clients", async () => {
  Reflect.set(globalThis, "__REOWN_PROJECT_ID__", "");
  expect(service.getPublicClient()).toBeDefined();
  expect(await service.checkStoredConnection()).toBeNull();
  await expect(service.connect()).rejects.toThrow("NEXT_PUBLIC_PROJECT_ID");
  Reflect.set(globalThis, "__REOWN_PROJECT_ID__", "public-test-project");
});

test("connects without window.ethereum and initializes AppKit once with EVM networks", async () => {
  const connected = mock();
  service.addEventListener(WALLET_EVENTS.CONNECT, connected);
  await connectWallet();
  expect(service.getAccount()).toBe(firstAddress);
  expect(service.getStoredAddress()).toBe(firstAddress);
  expect(service.isConnected()).toBe(true);
  expect(connected).toHaveBeenCalledTimes(1);
  expect(adapterOptions).toHaveLength(1);
  expect(appKitOptions).toHaveLength(1);
  expect(adapterOptions[0]).toMatchObject({ projectId: "public-test-project", networks: chains });
  expect(appKitOptions[0]).toMatchObject({ metadata: { url: "https://uusd.ubq.fi" }, networks: chains });
  expect(modalListeners.size).toBe(0);
});

test("signatures and transactions use the selected connector client", async () => {
  await connectWallet();
  const client = service.getWalletClient();
  await client.signMessage({ message: "Login to UUSD" });
  await client.writeContract({} as never);
  expect(signMessage).toHaveBeenCalledWith({ message: "Login to UUSD" });
  expect(writeContract).toHaveBeenCalledTimes(1);
});

test("wallet signature and transaction rejection propagate to existing UI handlers", async () => {
  await connectWallet();
  signMessage.mockImplementationOnce(() => Promise.reject(new Error("User rejected signature")));
  writeContract.mockImplementationOnce(() => Promise.reject(new Error("User rejected transaction")));
  await expect(service.getWalletClient().signMessage({ message: "Login" })).rejects.toThrow("User rejected signature");
  await expect(service.getWalletClient().writeContract({} as never)).rejects.toThrow("User rejected transaction");
});

test("closing the modal cancels the attempt, cleans listeners and permits retry", async () => {
  const attempt = service.connect();
  setModal(false);
  await expect(attempt).rejects.toThrow("cancelled");
  expect(modalListeners.size).toBe(0);
  expect(service.isConnected()).toBe(false);
  await connectWallet();
});

test("modal closing during successful client resolution is not cancellation", async () => {
  const attempt = service.connect();
  setAccount(firstAddress);
  setModal(false);
  await expect(attempt).resolves.toBe(firstAddress);
});

test("AppKit open errors are surfaced and subscriptions are cleaned up", async () => {
  open.mockImplementationOnce(() => Promise.reject(new Error("Unable to open AppKit")));
  await expect(service.connect()).rejects.toThrow("Unable to open AppKit");
  expect(modalListeners.size).toBe(0);
  await connectWallet();
});

test("duplicate connection attempts fail without replacing the active attempt", async () => {
  const attempt = service.connect();
  await expect(service.connect()).rejects.toThrow("already in progress");
  setAccount(firstAddress);
  await expect(attempt).resolves.toBe(firstAddress);
});

test("account changes replace the signer and emit one account change", async () => {
  await connectWallet();
  const changed = mock();
  service.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, changed);
  setAccount(secondAddress);
  expect(() => service.getWalletClient()).toThrow("not connected");
  await flushUpdates();
  expect(service.getWalletClient().account?.address).toBe(secondAddress);
  expect(service.getStoredAddress()).toBe(secondAddress);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledWith(secondAddress);
});

test.each([100, 42161, 137])("chain %i cannot submit UUSD transactions", async (chainId) => {
  await connectWallet();
  const changed = mock();
  service.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, changed);
  setAccount(firstAddress, chainId);
  await flushUpdates();
  expect(service.getChain()?.id).toBe(chainId === 137 ? undefined : chainId);
  expect(() => service.getWalletClient()).toThrow("Ethereum Mainnet");
  expect(() => service.validateConnection()).toThrow("Ethereum Mainnet");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(writeContract).not.toHaveBeenCalled();
  setAccount(firstAddress, 1);
  await flushUpdates();
  expect(service.getWalletClient()).toBeDefined();
});

test("disconnect terminates the connector, clears state and allows reconnect", async () => {
  await connectWallet();
  const disconnected = mock();
  service.addEventListener(WALLET_EVENTS.DISCONNECT, disconnected);
  await service.disconnect();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(service.isConnected()).toBe(false);
  expect(service.getStoredAddress()).toBeNull();
  expect(disconnected).toHaveBeenCalledTimes(1);
  await connectWallet(secondAddress);
  expect(service.getAccount()).toBe(secondAddress);
});

test("wallet-initiated disconnect and account revocation clear the session", async () => {
  await connectWallet();
  setAccount();
  expect(service.getAccount()).toBeNull();
  expect(service.isConnected()).toBe(false);
  expect(service.getStoredAddress()).toBeNull();
});

test("stored sessions reconnect silently without an injected provider or modal", async () => {
  storage.set("uusd_wallet_address", firstAddress);
  reconnect.mockImplementationOnce(() => Promise.resolve(setAccount(firstAddress)));
  await expect(service.checkStoredConnection()).resolves.toBe(firstAddress);
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
});

test("a stale stored address is never treated as an authenticated session", async () => {
  storage.set("uusd_wallet_address", firstAddress);
  await expect(service.checkStoredConnection()).resolves.toBeNull();
  expect(service.isConnected()).toBe(false);
  expect(service.getStoredAddress()).toBeNull();
});

test("late connector resolution cannot restore a disconnected account", async () => {
  await connectWallet();
  let resolve!: (client: ReturnType<typeof createClient>) => void;
  const pending = new Promise<ReturnType<typeof createClient>>((done) => {
    resolve = done;
  });
  resolveClient.mockImplementationOnce(() => pending);
  setAccount(secondAddress);
  const client = createClient();
  await service.disconnect();
  resolve(client);
  await flushUpdates();
  expect(service.isConnected()).toBe(false);
  expect(service.getStoredAddress()).toBeNull();
});

test("Manage Wallet opens the AppKit account view", async () => {
  await connectWallet();
  await service.openAccount();
  expect(open).toHaveBeenLastCalledWith({ view: "Account" });
});

test("destroy cancels pending connections and removes all subscriptions", async () => {
  const attempt = service.connect();
  service.destroy();
  await expect(attempt).rejects.toThrow("destroyed");
  expect(accountListeners.size).toBe(0);
  expect(modalListeners.size).toBe(0);
});

test("an old modal failure cannot reject a newer connection attempt", async () => {
  let rejectOpen!: (error: Error) => void;
  open.mockImplementationOnce(() =>
    new Promise<void>((_resolve, reject) => {
      rejectOpen = reject;
      setModal(true);
    })
  );
  const cancelled = service.connect();
  setModal(false);
  await expect(cancelled).rejects.toThrow("cancelled");
  const retry = service.connect().then((address) => ({ address }), (error: unknown) => ({ error }));
  rejectOpen(new Error("Old modal failure"));
  await flushUpdates();
  setAccount(firstAddress);
  expect(await retry).toEqual({ address: firstAddress });
});

test("a rejected disconnect preserves the active session for retry", async () => {
  await connectWallet();
  disconnect.mockImplementationOnce(() => Promise.reject(new Error("Disconnect failed")));
  await expect(service.disconnect()).rejects.toThrow("Disconnect failed");
  expect(service.isConnected()).toBe(true);
  await service.disconnect();
  expect(service.isConnected()).toBe(false);
});

test("a configured client chain cannot override the wallet's actual network", async () => {
  resolveClient.mockImplementationOnce(() => Promise.resolve({ ...createClient(), chain: mainnet }));
  await connectWallet(firstAddress, 100);
  expect(() => service.getWalletClient()).toThrow("Ethereum Mainnet");
  expect(writeContract).not.toHaveBeenCalled();
});
