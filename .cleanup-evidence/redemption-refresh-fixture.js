// Synthetic withdrawal/refresh services for the UUSD redemption-eligibility refresh (R1) served-UI proof.
// Injected with `agent-browser eval --stdin` after the real page loads. Real components and real DOM controls are
// driven by redemption-proof.ts; only services/state are synthetic. No wallet extension, no transaction, no
// signature, no approval click, no provider egress (agent-browser runs with --allowed-domains 127.0.0.1,localhost).
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
    USDC: "0x00000000000000000000000000000000000000c2",
    UBQ: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0",
  };
  const token = (symbol, address, balance, decimals, usdValue) => ({ symbol, address, balance, decimals, usdValue });
  const payloads = {
    // >$1 LUSD+USDC, unpriced UBQ, zero UUSD: withdraw selector offers LUSD and USDC; UUSD is the input.
    p1: [
      token("LUSD", ADDRESSES.LUSD, 12500000000000000000n, 18, 12.5),
      token("USDC", ADDRESSES.USDC, 1000000000n, 6, 1000),
      token("UBQ", ADDRESSES.UBQ, 5000000000000000000n, 18, 0),
      token("UUSD", ADDRESSES.UUSD, 0n, 18, 0),
    ],
  };

  const proof = {
    installedAt: new Date().toISOString(),
    sentinel: "uusd-redemption-no-reload",
    connected: true,
    balances: payloads.p1,
    quoteCalls: [],
    pending: 0,
    resolved: 0,
    cowCalls: 0,
    lastCow: null,
    mode: { defaultDelayMs: 0, defaultOutput: 5000000000000000000n, hold: false, byAmount: {}, queue: {} },
  };
  window.__redemption = proof;

  const buildWithdrawRoute = (forceSwapOnly, inputAmount, expectedOutput) => ({
    routeType: forceSwapOnly ? "swap" : "redeem",
    expectedOutput,
    direction: "withdraw",
    outputToken: { address: ADDRESSES.LUSD, symbol: "LUSD", decimals: 18 },
    inputToken: { address: ADDRESSES.UUSD, symbol: "UUSD", decimals: 18 },
    inputAmount,
    marketPrice: 1000000n,
    pegPrice: 1000000n,
    savings: { amount: 0n, percentage: 0 },
    isEnabled: true,
    ubqAmount: forceSwapOnly ? undefined : 5000000000000000000n,
    isUbqOperation: !forceSwapOnly,
  });

  const nextSpec = (key) => {
    const queue = proof.mode.queue[key];
    if (Array.isArray(queue) && queue.length > 0) return queue.shift();
    return proof.mode.byAmount[key] || {};
  };

  exchange._optimalRouteService.getOptimalWithdrawRoute = (inputAmount, forceSwapOnly) => {
    const key = inputAmount.toString();
    const spec = nextSpec(key);
    proof.quoteCalls.push({ amount: key, forceSwapOnly: !!forceSwapOnly, at: Date.now() });
    if (proof.mode.hold || spec.hold) {
      proof.pending += 1;
      return new Promise(() => {});
    }
    if ((spec.delayMs ?? proof.mode.defaultDelayMs) > 0) {
      const delayMs = spec.delayMs ?? proof.mode.defaultDelayMs;
      proof.pending += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          proof.pending -= 1;
          proof.resolved += 1;
          resolve(buildWithdrawRoute(!!forceSwapOnly, inputAmount, spec.output ?? proof.mode.defaultOutput));
        }, delayMs);
      });
    }
    proof.resolved += 1;
    return Promise.resolve(buildWithdrawRoute(!!forceSwapOnly, inputAmount, spec.output ?? proof.mode.defaultOutput));
  };

  // Deposit paths are only stubbed so the load-time deposit auto-population cannot reach the network; the proof
  // switches to withdraw before any assertion.
  const buildDepositRoute = (inputAmount) => ({
    routeType: "cowswap",
    expectedOutput: 12500000000000000000n,
    direction: "deposit",
    outputToken: { address: ADDRESSES.UUSD, symbol: "UUSD", decimals: 18 },
    inputToken: { address: ADDRESSES.LUSD, symbol: "LUSD", decimals: 18 },
    inputAmount,
    marketPrice: 1000000n,
    pegPrice: 1000000n,
    savings: { amount: 0n, percentage: 0 },
    isEnabled: true,
  });
  exchange._optimalRouteService.getOptimalDepositRoute = (inputAmount) => Promise.resolve(buildDepositRoute(inputAmount));
  cow.getDepositRoute = (inputToken, inputAmount) =>
    Promise.resolve({ ...buildDepositRoute(inputAmount), inputToken: { address: inputToken.address, symbol: inputToken.symbol, decimals: inputToken.decimals } });

  // Non-LUSD withdrawal output: CoW keeps its own route; the eligibility refresh must never rewrite it to LUSD.
  cow.getWithdrawRoute = (outputToken, inputAmount) => {
    proof.cowCalls += 1;
    proof.lastCow = { outputSymbol: outputToken.symbol, amount: inputAmount.toString() };
    return Promise.resolve({
      routeType: "cowswap",
      expectedOutput: 333000000n,
      direction: "withdraw",
      outputToken: { address: outputToken.address, symbol: outputToken.symbol, decimals: outputToken.decimals },
      inputToken: { address: ADDRESSES.UUSD, symbol: "UUSD", decimals: 18 },
      inputAmount,
      marketPrice: 1000000n,
      pegPrice: 1000000n,
      savings: { amount: 0n, percentage: 0 },
      isEnabled: true,
    });
  };

  // Keep every approval/route read synthetic so no request leaves the browser.
  cow.getCowSwapSdk = () => ({ getCowProtocolAllowance: async () => 0n });
  app._priceService.calculateMintOutput = async ({ dollarAmount }) => ({
    collateralNeeded: dollarAmount,
    governanceNeeded: 0n,
    totalDollarMint: dollarAmount,
    mintingFee: 0n,
  });
  app._priceService.calculateRedeemOutput = async () => ({
    collateralRedeemed: 1000000000000000000n,
    governanceRedeemed: 0n,
    redemptionFee: 0n,
    collateralRatio: 650000000000000000n,
    governancePrice: 1000000n,
    twapPrice: 1000000n,
    redeemPriceThreshold: 1000000n,
    isRedeemingAllowed: true,
  });
  // Provisional startup-status control: a delayed resolve or reject for the real _checkRedemptionStatus boundary.
  proof.statusSettled = false;
  proof.setStatusResult = ({ delayMs, isRedeemingAllowed }) => {
    app._priceService.calculateRedeemOutput = () => {
      proof.statusSettled = false;
      return new Promise((resolve) => {
        setTimeout(() => {
          proof.statusSettled = true;
          resolve({
            collateralRedeemed: 1000000000000000000n,
            governanceRedeemed: 0n,
            redemptionFee: 0n,
            collateralRatio: 650000000000000000n,
            governancePrice: 1000000n,
            twapPrice: 1000000n,
            redeemPriceThreshold: 1000000n,
            isRedeemingAllowed,
          });
        }, delayMs);
      });
    };
    return "ok";
  };
  proof.setStatusReject = ({ delayMs }) => {
    app._priceService.calculateRedeemOutput = () => {
      proof.statusSettled = false;
      return new Promise((_resolve, reject) => {
        setTimeout(() => {
          proof.statusSettled = true;
          reject(new Error("synthetic startup status failure"));
        }, delayMs);
      });
    };
    return "ok";
  };
  proof.startProvisionalStatus = () => {
    void exchange._checkRedemptionStatus();
    return "started";
  };
  app._contractService.getProtocolSettings = async () => ({
    collateralRatio: 1000000000000000000n,
    collateralRatioPercentage: 100,
    governanceRatioPercentage: 0,
    mintPaused: false,
    redeemPaused: false,
    mintingFee: 0n,
    redemptionFee: 0n,
    currentUUSDPrice: 1000000n,
    isFullyCollateralized: true,
    isFullyAlgorithmic: false,
    isFractional: false,
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
  // payload, which is what lets the exchange component's `waitForInitialLoad()` (and the selector) proceed.

  const emit = (patch = {}) => {
    const data = {
      uusdPrice: "1.000000",
      lusdPrice: 1000000n,
      ubqPrice: 1000n,
      tokenBalances: proof.balances,
      collateralRatio: 650000000000000000n,
      allCollaterals: [ADDRESSES.LUSD],
      mintThreshold: 1000000n,
      redeemThreshold: 1000000n,
      curveExchangeRate: 0n,
      isMintingAllowed: true,
      isRedeemingAllowed: true,
      twapPrice: 1000000n,
      ...patch,
    };
    refresh._lastData = data;
    refresh._callbacks.forEach((callback) => callback(data));
    return { isRedeemingAllowed: data.isRedeemingAllowed, isMintingAllowed: data.isMintingAllowed };
  };

  proof.load = (name) => {
    inventory._state.balances = [];
    proof.balances = payloads[name];
    return emit({ isRedeemingAllowed: true });
  };
  proof.emit = (patch) => emit(patch);
  // Synthetic protocol settings: fully collateralized -> withdraw shows the swap/redeem choice (CLAUDE.md scenario B).
  proof.setProtocolMode = (mode) => {
    exchange._state.protocolSettings = {
      collateralRatio: mode.fractional ? 650000000000000000n : 1000000000000000000n,
      collateralRatioPercentage: mode.fractional ? 65 : 100,
      governanceRatioPercentage: mode.fractional ? 35 : 0,
      mintPaused: false,
      redeemPaused: false,
      mintingFee: 0n,
      redemptionFee: 0n,
      currentUUSDPrice: 1000000n,
      isFullyCollateralized: !!mode.fully,
      isFullyAlgorithmic: false,
      isFractional: !!mode.fractional,
    };
    exchange._render();
    return "ok";
  };
  // Return a JSON-safe primitive: queue/output patches contain BigInts that must not travel back to the driver.
  proof.setQuoteMode = (patch) => {
    Object.assign(proof.mode, patch);
    return "ok";
  };
  proof.quoteLog = (amount) => proof.quoteCalls.filter((call) => call.amount === amount).map((call) => call.forceSwapOnly);
  proof.observe = () => {
    const byId = (id) => document.getElementById(id);
    const text = (id) => (byId(id) ? byId(id).textContent.trim() : null);
    const output = byId("exchangeOutput");
    const outputVisible = !!output && output.style.display !== "none";
    const select = byId("tokenSelect");
    const selectedOption = select && select.selectedOptions[0] ? select.selectedOptions[0] : null;
    const swapOnly = byId("swapOnlyOption");
    const swapOnlyCheckbox = byId("forceSwapOnly");
    const fractional = byId("fractionalRedemptionOption");
    return {
      sentinel: proof.sentinel,
      installedAt: proof.installedAt,
      direction: exchange._state.direction,
      amount: byId("exchangeAmount") ? byId("exchangeAmount").value : null,
      selected: selectedOption ? selectedOption.getAttribute("data-symbol") : null,
      redemptionsDisabled: exchange._state.redemptionsDisabled,
      forceSwapOnly: exchange._state.forceSwapOnly,
      acceptFractionalRedemption: exchange._state.acceptFractionalRedemption,
      swapOnlyDisplay: swapOnly ? swapOnly.style.display : null,
      swapOnlyDisabled: swapOnlyCheckbox ? swapOnlyCheckbox.disabled : null,
      swapOnlyChecked: swapOnlyCheckbox ? swapOnlyCheckbox.checked : null,
      fractionalDisplay: fractional ? fractional.style.display : null,
      outputVisible,
      previewVisible: outputVisible ? text("expectedOutput") : null,
      previewText: text("expectedOutput"),
      buttonText: text("exchangeButton"),
      buttonDisabled: byId("exchangeButton") ? byId("exchangeButton").disabled : null,
      quoteCalls: proof.quoteCalls.slice(),
      quoteCallCount: proof.quoteCalls.length,
      cowCalls: proof.cowCalls,
      lastCow: proof.lastCow,
      pending: proof.pending,
      resolved: proof.resolved,
      statusSettled: proof.statusSettled,
      lastQuote: proof.quoteCalls.length > 0 ? proof.quoteCalls[proof.quoteCalls.length - 1] : null,
    };
  };

  return "installed";
})()
