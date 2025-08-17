# Active Context: uusd.ubq.fi

## Current Work Focus:

### 1. Precision Loss Audit (In Progress)
- **Critical Issue Discovered**: JavaScript float precision causing "transfer amount exceeds balance" errors
- **Root Cause**: `parseFloat()` in balance calculations truncates precision beyond ~15 digits
- **Affected File**: `src/utils/balance-utils.ts` line with `parseFloat(formattedBalance).toString()`
- **Impact**: Users can't send max balance transactions - attempting to send 7405.818888349438 UUSD when actual balance is 7405.818888349437578870
- **Solution Strategy**: Replace all parseFloat usage with string-based precision-preserving methods throughout codebase

### 2. Redemption Checkbox Fix (Completed)
- **Fixed Critical Bug**: Users were shown redemption options even when protocol redemptions disabled
- **Corrected Logic**: `src/services/price-service.ts` line 235 - changed from `twapPrice <= redeemPriceThreshold` to `twapPrice >= redeemPriceThreshold`
- **UI Enhancement**: Added `redemptionsDisabled` state tracking in simplified-exchange-component
- **Result**: Checkbox now correctly hidden when TWAP < $1.00 threshold, forcing Curve swap only

## Recent Changes:

### Successfully Completed Fixes:
1. **Redemption Logic Correction**:
   - Fixed inverted threshold comparison in price-service
   - Updated MIN_VALID_THRESHOLD to accept 0n in constants
   - Enhanced price-threshold-service to accept $0 as valid

2. **Swap Service Enhancement**:
   - Fixed slippage calculation to use expected output instead of input amount
   - Prevents minAmountOut calculation errors

3. **UI State Management**:
   - Added redemptionsDisabled state separate from forceSwapOnly
   - Ensures checkbox cannot be toggled when redemptions protocol-disabled
   - Implements immediate DOM updates for better UX

## Next Steps:

### Immediate Priority (User Async Work)
1. **Float Precision Audit**: Full codebase audit to identify and fix all parseFloat usage
2. **Pattern Replacement**: Implement string-based trimming throughout:
   ```typescript
   // Replace this pattern:
   parseFloat(formattedBalance).toString()
   // With:
   formattedBalance.replace(/\.?0+$/, '')
   ```

### Short-term Goals
1. **Testing**: Verify max balance transactions work after precision fixes
2. **Edge Cases**: Test dust amounts and high-precision values
3. **Documentation**: Update technical docs with precision handling guidelines

## Active Decisions and Considerations:

### Precision Handling Philosophy
- **Never Use parseFloat**: For critical financial calculations
- **Preserve Full Precision**: Until final display to user
- **Use BigInt**: For all contract interactions
- **String Manipulation**: For formatting without precision loss

### Protocol State Management
- **Clear Separation**: Protocol state (redemptionsDisabled) vs user preference (forceSwapOnly)
- **Fail-Safe Defaults**: When in doubt, force safer Curve swap route
- **Real-time Monitoring**: Check redemption status every 30 seconds

## Current State:

✅ **Redemption Checkbox Fix**: Complete and verified working
✅ **Swap Service Fix**: Slippage calculation corrected
✅ **UI State Management**: Properly tracks protocol redemption status
🟡 **Float Precision Audit**: User working on comprehensive fix
� **Max Balance Transactions**: Failing due to precision loss

## Debug Tools Created:
- `tools/debug-curve-swap.ts`: Diagnoses swap failures and token approvals
- `tools/check-redemption-status.ts`: Verifies protocol redemption state

The system now correctly handles redemption availability and forces Curve swaps when appropriate. The remaining critical issue is precision handling throughout the codebase.
