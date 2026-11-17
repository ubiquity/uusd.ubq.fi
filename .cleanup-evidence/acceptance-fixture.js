// Synthetic wallet/balance/quote services for the UUSD selector/Max served-UI acceptance proof (C1-C12, delayed Max,
// stale-quote ordering, no-balance Max race). Injected with `agent-browser eval --stdin` after the real page loads.
// No wallet extension, no transaction, no credential, and no provider egress (agent-browser is launched with
// --allowed-domains 127.0.0.1,localhost, so every non-local request is denied locally).
(() => {
  const app = window.app;
  const inventory = app._inventoryBarComponent;
  const exchange = app._simplifiedExchangeComponent;
  const refresh = app._centralizedRefreshService;
  const wallet = app._walletService;
  const cow = app._cowSwapService;

  const ADDRESSES = {
    ACCOUNT: "0x1111111111111111111111111111111111111111",
    LUSD: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
    UUSD: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103",
    UBQ: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0",
    USDC: "0x00000000000000000000000000000000000000c2",
    DUST: "0x00000000000000000000000000000000000000d1",
  };
  const token = (symbol, address, balance, decimals, usdValue) => ({ symbol, address, balance, decimals, usdValue });
  const payloads = {
    // >$1 LUSD+USDC, $0.50 dust, unpriced UBQ, zero UUSD -> wallet total $1,013.00
    p1: [
      token("LUSD", ADDRESSES.LUSD, 12500000000000000000n, 18, 12.5),
      token("USDC", ADDRESSES.USDC, 1000000000n, 6, 1000),
      token("DUST", ADDRESSES.DUST, 500000n, 6, 0.5),
      token("UBQ", ADDRESSES.UBQ, 5000000000000000000n, 18, 0),
      token("UUSD", ADDRESSES.UUSD, 0n, 18, 0),
    ],
    // dust LUSD must still be offered in the selector
    p3: [token("USDC", ADDRESSES.USDC, 1000000000n, 6, 1000), token("LUSD", ADDRESSES.LUSD, 50000000000000000n, 18, 0.05)],
    // no eligible wallet holding -> preloaded token list
    p4: [token("UUSD", ADDRESSES.UUSD, 0n, 18, 0)],
  };

  const proof = {
    addresses: ADDRESSES,
    connected: true,
    calls: [],
    pending: 0,
    resolved: 0,
    mode: { defaultDelayMs: 0, defaultOutput: 990000000000000000000n, hold: false, byAmount: {} },
  };
  window.__proof = proof;

  const buildRoute = (direction, inputToken, inputAmount, expectedOutput) => ({
    routeType: "cowswap",
    expectedOutput,
    direction,
    outputToken: { address: ADDRESSES.UUSD, symbol: "UUSD", decimals: 18 },
    inputToken,
    inputAmount,
    marketPrice: 1000000n,
    pegPrice: 1000000n,
    savings: { amount: 0n, percentage: 0 },
    isEnabled: true,
  });

  const quote = (direction, inputToken, inputAmount) => {
    const spec = proof.mode.byAmount[inputAmount.toString()] || {};
    const delayMs = spec.delayMs ?? proof.mode.defaultDelayMs;
    const expectedOutput = spec.output ?? proof.mode.defaultOutput;
    proof.calls.push({ direction, symbol: inputToken.symbol, amount: inputAmount.toString(), at: Date.now() });
    if (proof.mode.hold || spec.hold) {
      proof.pending += 1;
      return new Promise(() => {});
    }
    if (delayMs > 0) {
      proof.pending += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          proof.pending -= 1;
          proof.resolved += 1;
          resolve(buildRoute(direction, inputToken, inputAmount, expectedOutput));
        }, delayMs);
      });
    }
    proof.resolved += 1;
    return Promise.resolve(buildRoute(direction, inputToken, inputAmount, expectedOutput));
  };

  cow.getDepositRoute = (inputToken, inputAmount) => quote("deposit", inputToken, inputAmount);
  cow.getWithdrawRoute = (outputToken, inputAmount) => quote("withdraw", outputToken, inputAmount);
  cow.getCowSwapSdk = () => ({ getCowProtocolAllowance: async () => 0n });
  exchange._optimalRouteService.getOptimalDepositRoute = (inputAmount) => quote("deposit", { address: ADDRESSES.LUSD, symbol: "LUSD", decimals: 18 }, inputAmount);
  exchange._optimalRouteService.getOptimalWithdrawRoute = (inputAmount) => quote("withdraw", { address: ADDRESSES.UUSD, symbol: "UUSD", decimals: 18 }, inputAmount);

  // Keep approval/route reads synthetic as well so no request leaves the browser.
  app._priceService.calculateMintOutput = async ({ dollarAmount }) => ({
    collateralNeeded: dollarAmount,
    governanceNeeded: 0n,
    totalDollarMint: dollarAmount,
    mintingFee: 0n,
  });
  app._transactionService.getMintApprovalStatus = async () => ({ needsCollateralApproval: false, needsGovernanceApproval: false });
  app._transactionService.getRedeemApprovalStatus = async () => ({ needsApproval: false });
  app._contractService.getAllowance = async () => 0n;
  app._swapService.getPoolAddress = () => ADDRESSES.ACCOUNT;

  refresh.stop();
  refresh._performRefresh = async () => {};
  wallet.getAccount = () => (proof.connected ? ADDRESSES.ACCOUNT : null);
  wallet.isConnected = () => proof.connected;
  inventory._state.isConnected = true;
  inventory._state.currentAccount = ADDRESSES.ACCOUNT;
  // Never null `_initialLoadResolver` here: the real `_handleRefreshData` resolves AND nulls it on the first synthetic
  // payload. Nulling it early made `isInitialLoadComplete()` look true while the original `_initialLoadPromise` stayed
  // pending, so the exchange component's `await inventoryBar.waitForInitialLoad()` could never finish (no selector).

  const emit = (tokenBalances) => {
    const data = {
      uusdPrice: "1.000000",
      lusdPrice: 1000000n,
      ubqPrice: 1000n,
      tokenBalances,
      collateralRatio: 650000000000000000n,
      allCollaterals: [ADDRESSES.LUSD],
      mintThreshold: 1000000n,
      redeemThreshold: 1000000n,
      curveExchangeRate: 0n,
      isMintingAllowed: true,
      isRedeemingAllowed: true,
      twapPrice: 1000000n,
    };
    refresh._lastData = data;
    refresh._callbacks.forEach((callback) => callback(data));
  };

  proof.load = (name) => {
    inventory._state.balances = [];
    emit(payloads[name]);
    return name;
  };
  // Return a JSON-safe primitive: the mode patch contains BigInt outputs that must not travel back to the driver.
  proof.setMode = (patch) => {
    Object.assign(proof.mode, patch);
    return "ok";
  };
  proof.setConnected = (on) => {
    proof.connected = on;
    inventory._state.isConnected = on;
    return on;
  };
  proof.setLoading = (on) => {
    inventory._initialLoadResolver = on ? () => {} : null;
    return on;
  };
  proof.dropBalance = (address) => {
    inventory._state.balances = inventory._state.balances.filter((balance) => balance.address.toLowerCase() !== address.toLowerCase());
    return inventory._state.balances.length;
  };
  proof.render = () => {
    exchange._render();
    return "rendered";
  };
  proof.state = () => ({
    calls: proof.calls.length,
    pending: proof.pending,
    resolved: proof.resolved,
    lastCall: proof.calls.length > 0 ? proof.calls[proof.calls.length - 1] : null,
  });
  proof.observe = () => {
    const byId = (id) => document.getElementById(id);
    const text = (id) => (byId(id) ? byId(id).textContent.trim() : null);
    const symbols = (id) => Array.from(byId(id).querySelectorAll("option")).map((option) => option.getAttribute("data-symbol"));
    const output = byId("exchangeOutput");
    const outputVisible = output.style.display !== "none";
    const select = byId("tokenSelect");
    const selectedOption = select.selectedOptions[0] || null;
    return {
      rows: Array.from(document.querySelectorAll("#inventory-tokens .token-balance")).map((row) => row.querySelector(".token-amount").textContent.trim()),
      total: text("inventory-total"),
      your: symbols("yourTokenGroup"),
      other: symbols("otherTokenGroup"),
      yourDisplay: byId("yourTokenGroup").style.display,
      otherDisplay: byId("otherTokenGroup").style.display,
      label: text("amountLabel"),
      selected: selectedOption ? selectedOption.getAttribute("data-symbol") : null,
      optionCount: select.options.length,
      firstOption: select.options[0] ? select.options[0].getAttribute("data-symbol") : null,
      amount: byId("exchangeAmount").value,
      amountDisabled: byId("exchangeAmount").disabled,
      amountPlaceholder: byId("exchangeAmount").placeholder,
      maxDisabled: byId("maxButton").disabled,
      maxTitle: byId("maxButton").title,
      outputVisible,
      previewVisible: outputVisible ? text("expectedOutput") : null,
      previewText: text("expectedOutput"),
      buttonText: text("exchangeButton"),
      buttonDisabled: byId("exchangeButton").disabled,
      selectBg: getComputedStyle(select).backgroundColor,
      inputBg: getComputedStyle(byId("exchangeAmount")).backgroundColor,
      connected: proof.connected,
      callLog: proof.calls.slice(),
      ...proof.state(),
    };
  };

  return "installed";
})()
