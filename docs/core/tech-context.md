# Tech Context: uusd.ubq.fi

## Technologies Used:

-   **Solidity:** The primary language for writing smart contracts.
-   **Foundry:** A blazing fast, portable, and modular toolkit for Ethereum application development written in Rust.
-   **TypeScript:** Used extensively for the frontend dapp and various utility scripts. Provides static typing for improved code quality.
-   **Next.js:** A React framework for building server-side rendered and static web applications.
-   **React:** A JavaScript library for building user interfaces, forming the core of the Next.js dapp.
-   **Bun:** A fast all-in-one JavaScript runtime, bundler, transpiler, and package manager.
-   **Viem:** Modern TypeScript library for Ethereum interactions, using bigint for all numeric values.

## Development Setup:

-   **Local Blockchain (Anvil):** For local development and testing of smart contracts.
-   **Environment Variables:** Configuration managed through `.env` files.
-   **Testing Frameworks:**
    -   **Foundry (Forge):** For Solidity smart contract testing.
    -   **Debug Tools:** Custom TypeScript tools for diagnosing issues.

## Technical Constraints:

-   **EVM Compatibility:** Smart contracts designed for Ethereum Virtual Machine.
-   **Gas Optimization:** Smart contracts developed with gas efficiency in mind.
-   **Precision Requirements:** All token amounts must maintain 18 decimal precision.
-   **JavaScript Float Limitations:** ~15 significant digit limit requires careful handling.

## Critical Technical Patterns:

### Precision Handling:
```typescript
// NEVER use parseFloat for token amounts
// BAD: parseFloat(formattedBalance).toString()
// GOOD: formattedBalance.replace(/\.?0+$/, '')
```

### BigInt Usage:
```typescript
// All contract interactions use bigint
const amount: bigint = parseEther("100.5"); // string to bigint
const display: string = formatEther(amount); // bigint to string
```

### State Management:
```typescript
// Protocol state vs user preference
redemptionsDisabled: boolean;  // Protocol-controlled
forceSwapOnly: boolean;        // User preference (when allowed)
```

## Key Services and Components:

### Core Services:
-   **OptimalRouteService:** Analyzes market conditions for best exchange route
-   **PriceService:** Oracle prices and threshold management (fixed logic: `twapPrice >= redeemPriceThreshold`)
-   **SwapService:** Curve pool interactions (fixed slippage on expected output)
-   **ContractService:** Diamond proxy interactions
-   **CurvePriceService:** Real-time Curve pool price feeds

### Critical Fixes Applied:
1. **Redemption Logic:** Corrected comparison from `<=` to `>=` in price-service.ts:235
2. **Slippage Calculation:** Now uses expected output instead of input amount
3. **Threshold Validation:** Accepts 0n as valid threshold value
4. **UI State Tracking:** Separate redemptionsDisabled from forceSwapOnly

## Protocol Constants:

-   **Diamond Proxy:** 0xED3084c98148e2528DaDCB53C56352e549C488fA
-   **Curve Pool:** 0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f (LUSD/UUSD)
-   **UUSD Address:** 0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103
-   **LUSD Address:** 0x5f98805A4E8be255a32880FDeC7F6728C6568bA0
-   **Redemption Threshold:** $1.00 (blocks redemptions when TWAP below)

## Dependencies:

### Smart Contract Libraries:
-   **OpenZeppelin Contracts:** Secure smart contract development
-   **Uniswap V2/V3:** DEX interactions and price oracles
-   **Aave V3 Core/Periphery:** Lending protocol integration
-   **Curve Finance:** Stablecoin swap functionality

### Frontend Libraries:
-   **Viem:** Ethereum interactions with bigint support
-   **React:** UI component library
-   **TypeScript:** Type safety and code quality

## Debug and Diagnostic Tools:

-   **tools/debug-curve-swap.ts:** Diagnoses swap failures, checks approvals and balances
-   **tools/check-redemption-status.ts:** Verifies protocol redemption state
-   **tools/test-ui-fix.ts:** Tests UI state management
-   **tools/diagnose-ui-state.ts:** Comprehensive UI state analysis

## Known Technical Issues:

### Under Investigation:
-   **Float Precision Loss:** parseFloat() causing max balance transaction failures
    - Location: `src/utils/balance-utils.ts`
    - Impact: 0.00000000000042113 UUSD precision loss
    - Solution: String-based manipulation throughout codebase

### Resolved:
-   ✅ Redemption threshold logic inverted
-   ✅ Swap slippage calculation error
-   ✅ UI checkbox visibility when redemptions disabled
-   ✅ MIN_VALID_THRESHOLD rejecting $0

## Performance Characteristics:

-   **Route Calculation:** 300ms debounced for UX responsiveness
-   **Protocol Status Check:** 30-second intervals
-   **Cache TTL:** Various based on data volatility
-   **RPC Batching:** Multicall for reduced latency
