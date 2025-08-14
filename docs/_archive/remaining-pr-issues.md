# Remaining PR Review Issues

## PR #39: Wallet Connection Improvements

### 🟡 Potential Bugs or Issues

1. **Race Condition in Auto-reconnect** (app.ts:425-444):
   - If user manually connects while auto-reconnect is in progress, could lead to duplicate connection attempts
   - Consider adding flag to prevent concurrent connection attempts

2. **Event Listener Memory Leak** (wallet-service.ts:168-221):
   - `setupWalletEventListeners()` creates handlers only cleaned up on disconnect
   - If component destroyed without disconnect, listeners remain attached

## PR #38: Centralized Refresh Service

### 🔍 Issues and Recommendations

1. **Race Condition in Token Balance Calculations** (centralized-refresh-service.ts:228-234)
   - Using `this.lastData` creates circular dependencies

2. **Missing Unsubscribe in Inventory Component** (inventory-bar-component.ts:85-103)
   - Component subscribes but never unsubscribes

3. **Duplicate Price Fetching Logic** (inventory-bar-component.ts:229-241)

---

## PR #37: Immediate Balance Refresh

### Issues

1. **Duplicate balance refresh calls**:
   - app.ts line 311 (global handler)
   - mint-component.ts line 261
   - redeem-component.ts lines 235 & 241

2. **No error handling for void operations**

3. **No debouncing for balance refreshes**

---

## PR #33: Unified Exchange Interface

### 1. **Security Concerns**

#### Missing Slippage Protection Validation
- Slippage is hardcoded at 0.5%
- Should be configurable with validation
- Ideally should simulate a swap with the user's amount, and set slippage to 2x what is expected, as the default value.

### 2. **Potential Bugs**

#### Missing Null Check (optimal-route-service.ts:252)
```typescript
const publicClient = this.curvePriceService['walletService'].getPublicClient();
```

### 3. **Code Quality Issues**

#### Type Safety
- `unified-exchange-component.ts:46`: `private debounceTimer: any | null = null;`
- Should use `ReturnType<typeof setTimeout>`

#### Missing Configuration
- Hard-coded pool addresses and token addresses
- Should move to constants

---

## PR #32: Focus Views on Available Operations

### 🐛 Potential Bugs

1. **Race Condition in Balance Updates** (unified-exchange-component.ts:492-519)

2. **Missing Null Check** (unified-exchange-component.ts:330):
   ```typescript
   getAccount()!  // Uses non-null assertion without validation
   ```

---

## Common Themes Still Needing Attention

### 🧪 Test Coverage
- **Critical**: No tests for any components
- Need unit tests for services
- Need integration tests for flows

### 🎯 Priority Recommendations
1. **High**: Add test coverage
2. **High**: Fix security concerns (token approvals, localStorage)
3. **Medium**: Fix remaining race conditions
4. **Medium**: Add proper error handling
5. **Low**: Improve type safety throughout