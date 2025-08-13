# Product Context: uusd.ubq.fi

## Why This Project Exists:
The `uusd.ubq.fi` project addresses the need for a decentralized, censorship-resistant stablecoin in the cryptocurrency ecosystem. Traditional stablecoins often rely on centralized entities or volatile collateral, introducing single points of failure and susceptibility to external control. UUSD aims to overcome these limitations by providing a truly decentralized alternative.

## Problems It Solves:
- **Centralization Risk:** Mitigates risks from centralized stablecoin issuers, regulatory interference, or operational failures
- **Volatility Protection:** Offers stable value storage within DeFi, protecting from crypto volatility
- **Transparency:** Fully on-chain and auditable mechanism for stablecoin management
- **User Complexity:** Simplifies protocol interaction through intelligent routing and bank-like UX
- **Precision Errors:** Careful handling of 18-decimal precision to prevent transaction failures

## How It Should Work:

### Core Mechanism:
- **Dual Collateral System:** 95% LUSD (stable) + 5% UBQ (governance) backing
- **Redemption Thresholds:** Protocol blocks redemptions when TWAP price < $1.00
- **Automatic Route Selection:** System chooses optimal path between mint/redeem or Curve swap
- **Precision Preservation:** All calculations maintain full 18-decimal precision using bigint

### User Experience Flow:
1. **Simple Interface:** Users see "Deposit" (buy UUSD) or "Withdraw" (sell UUSD)
2. **Automatic Optimization:** System analyzes all available routes in real-time
3. **Best Deal Guarantee:** Always executes via the most favorable route
4. **Clear Communication:** Shows selected route, expected output, and savings
5. **Safe Execution:** Handles approvals, slippage, and precision automatically

### Protocol Safety Mechanisms:
- **TWAP-Based Controls:** Redemptions disabled when price below threshold
- **Forced Curve Swaps:** Automatic fallback when protocol redemptions unavailable
- **Slippage Protection:** Calculated on expected output for accuracy
- **Precision Safety:** No float operations on critical financial calculations

## User Experience Goals:

### Primary Goals:
- **Simplicity:** Abstract complex DeFi mechanics behind intuitive banking metaphors
- **Transparency:** Show exactly what's happening and why
- **Reliability:** Transactions should work exactly as shown, every time
- **Safety:** Protect users from common errors (slippage, precision, approvals)

### Specific Features:
- **Automatic Best Deal:** Route selection happens behind the scenes
- **Max Balance Support:** Users can safely send entire balance without precision errors
- **Real-time Updates:** Live market data and route recalculation
- **Clear Status Indicators:** Visual feedback for route type (🔨 Mint, 🔄 Redeem, 🔀 Swap)
- **Error Prevention:** Validation and checks before transaction submission

## Current Protocol Status:

### Market Conditions (Latest):
- **TWAP Price:** $0.997178
- **Redemption Threshold:** $1.00
- **Redemptions:** DISABLED (TWAP < threshold)
- **Curve Pool:** Healthy with 26K LUSD, 42K UUSD liquidity
- **Exchange Rate:** ~0.994 UUSD/LUSD with 0.57% slippage

### System Behavior:
- **Selling UUSD:** Forces Curve swap only (redemptions disabled)
- **Buying UUSD:** Analyzes mint vs swap for best rate
- **UI Adaptation:** Checkbox hidden when redemptions protocol-disabled
- **Fallback Ready:** Curve pool has sufficient liquidity for all operations

## Success Metrics:

- **Zero Failed Transactions:** Due to precision or approval issues
- **Optimal Routing:** Always provides best available rate
- **User Understanding:** Clear explanation of every action
- **Protocol Health:** Maintains peg stability through intelligent routing
- **Technical Excellence:** No precision loss in any calculation

## Recent Improvements:

1. **Redemption Management:** Fixed threshold logic to correctly disable redemptions
2. **UI State Clarity:** Separated protocol state from user preferences
3. **Precision Handling:** Identified and fixing float precision issues
4. **Diagnostic Tools:** Created comprehensive debugging utilities
5. **Slippage Accuracy:** Corrected calculation to use expected output

The product successfully abstracts complex DeFi operations into a simple, reliable interface while maintaining technical precision and protocol safety.
