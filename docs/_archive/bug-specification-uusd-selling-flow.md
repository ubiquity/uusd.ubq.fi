# Bug Specification: UUSD Selling Flow - Incorrect Transaction Type

## Problem Summary
When selling UUSD with the "Swap for LUSD only" checkbox checked, the system incorrectly executes a `redeemDollar` transaction instead of a swap transaction, causing the transaction to fail with "Governance slippage" error.

## Expected Behavior
1. User enters amount of UUSD to sell
2. User checks "Swap for LUSD only (via Curve)" checkbox
3. System calculates optimal route and shows it will use Curve swap
4. User clicks button to execute transaction
5. System executes a Curve swap transaction (UUSD → LUSD)

## Actual Behavior
1. User enters amount of UUSD to sell
2. User checks "Swap for LUSD only (via Curve)" checkbox
3. System calculates optimal route and shows it will use Curve swap (UI is correct)
4. User clicks button to execute transaction
5. System executes a `redeemDollar` transaction instead of swap
6. Transaction fails with error: `Fail with error 'Governance slippage'`

## Root Cause Analysis

### Issue 1: Route Calculation Logic (PRIMARY)
**File:** `src/services/optimal-route-service.ts`
**Method:** `getOptimalWithdrawRoute()`

When `isLusdOnlyRedemption` is `true`, the system should FORCE a swap route instead of comparing swap vs redeem and choosing the better one. Currently, it compares both options and may still choose redeem if it gives better output.

**Current Logic:**
```typescript
// When isLusdOnlyRedemption is true, still compares both routes
const redeemResult = await this.calculateRedeemRoute(dollarAmount);
const swapResult = await this.calculateSwapRoute(dollarAmount, 'withdraw');

// Chooses better route instead of forcing swap
if (swapResult.expectedOutput > redeemResult.expectedOutput) {
    return swapResult;
} else {
    return redeemResult; // BUG: Still returns redeem even when user wants LUSD only
}
```

**Expected Logic:**
```typescript
// When isLusdOnlyRedemption is true, FORCE swap regardless of which is better
if (isLusdOnlyRedemption) {
    return await this.calculateSwapRoute(dollarAmount, 'withdraw');
}
```

### Issue 2: Checkbox State Not Passed During Execution (SECONDARY)
**File:** `src/components/unified-exchange-component.ts`
**Method:** `executeTransaction()`

When user clicks the execute button, the system recalculates the optimal route but does NOT read the checkbox states, causing `isLusdOnlyRedemption` to default to `false`.

**Current Code (Lines ~95-102):**
```typescript
// Calculate optimal route
let routeResult: OptimalRouteResult;
if (this.currentDirection === 'deposit') {
    routeResult = await this.optimalRouteService.getOptimalDepositRoute(amount);  // Missing checkbox param!
} else {
    routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(amount);  // Missing checkbox param!
}
```

**Expected Code:**
```typescript
// Get checkbox states
const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

// Calculate optimal route with checkbox states
let routeResult: OptimalRouteResult;
if (this.currentDirection === 'deposit') {
    const isForceCollateralOnly = forceCollateralOnly?.checked || false;
    routeResult = await this.optimalRouteService.getOptimalDepositRoute(amount, isForceCollateralOnly);
} else {
    const isLusdOnlyRedemption = redeemLusdOnly?.checked || false;
    routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(amount, isLusdOnlyRedemption);
}
```

## Files to Modify

### 1. src/services/optimal-route-service.ts
**Method:** `getOptimalWithdrawRoute(dollarAmount: bigint, isLusdOnlyRedemption: boolean = false)`

Add logic to force swap when `isLusdOnlyRedemption` is true:

```typescript
async getOptimalWithdrawRoute(dollarAmount: bigint, isLusdOnlyRedemption: boolean = false): Promise<OptimalRouteResult> {
    // If user wants LUSD only, force swap route
    if (isLusdOnlyRedemption) {
        return await this.calculateSwapRoute(dollarAmount, 'withdraw');
    }

    // Otherwise, calculate both and choose optimal
    const redeemResult = await this.calculateRedeemRoute(dollarAmount);
    const swapResult = await this.calculateSwapRoute(dollarAmount, 'withdraw');

    // Choose better route
    if (swapResult.expectedOutput > redeemResult.expectedOutput) {
        return swapResult;
    } else {
        return redeemResult;
    }
}
```

### 2. src/components/unified-exchange-component.ts
**Method:** `executeTransaction()`

Read checkbox states before recalculating route:

```typescript
private async executeTransaction(): Promise<void> {
    // ... existing validation code ...

    const amount = parseEther(amountInput.value);

    // Get checkbox states
    const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
    const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

    // Calculate optimal route with checkbox states
    let routeResult: OptimalRouteResult;
    if (this.currentDirection === 'deposit') {
        const isForceCollateralOnly = forceCollateralOnly?.checked || false;
        routeResult = await this.optimalRouteService.getOptimalDepositRoute(amount, isForceCollateralOnly);
    } else {
        const isLusdOnlyRedemption = redeemLusdOnly?.checked || false;
        routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(amount, isLusdOnlyRedemption);
    }

    // Execute the optimal route
    await this.executeOptimalRoute(routeResult);
}
```

## Test Cases

### Test Case 1: LUSD Only Checkbox Checked
1. Set direction to 'withdraw' (sell UUSD)
2. Enter amount: 100 UUSD
3. Check "Swap for LUSD only" checkbox
4. Verify route calculation returns 'swap' type
5. Execute transaction
6. Verify transaction calls swap contract, not redeem

### Test Case 2: LUSD Only Checkbox Unchecked
1. Set direction to 'withdraw' (sell UUSD)
2. Enter amount: 100 UUSD
3. Leave "Swap for LUSD only" checkbox unchecked
4. Verify route calculation compares both routes
5. Execute transaction
6. Verify transaction uses optimal route (swap or redeem)

### Test Case 3: UI Consistency
1. Check that UI display matches actual execution route
2. Verify button text matches actual transaction type
3. Ensure no discrepancy between calculation and execution

## Debugging Steps

1. **Add logging** to `getOptimalWithdrawRoute()` to see which route is chosen
2. **Add logging** to `executeTransaction()` to verify checkbox states are read
3. **Add logging** to `executeOptimalRoute()` to confirm route type being executed
4. **Test both scenarios** (checkbox on/off) and verify correct transaction type

## Priority: HIGH
This is a critical bug that causes transaction failures and incorrect behavior when users expect to swap via Curve but the system attempts to redeem instead.

## Success Criteria
- When "Swap for LUSD only" is checked, system MUST execute swap transaction
- When "Swap for LUSD only" is unchecked, system chooses optimal route
- No "Governance slippage" errors when user intends to swap
- UI consistency between calculation display and actual execution
