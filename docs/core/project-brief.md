# Project Brief: uusd.ubq.fi

## Overview
This codebase powers the Ubiquity Dollar (UUSD) protocol interface - a decentralized stablecoin system with intelligent routing and precision-safe operations.

## Core Functionality
- **Minting:** Create UUSD against LUSD collateral (95%) and UBQ governance tokens (5%)
- **Redeeming:** Burn UUSD to retrieve collateral and governance tokens
- **Swapping:** Exchange via Curve pool when direct redemption unavailable
- **Intelligent Routing:** Automatic selection of optimal exchange path

## Recent Critical Fixes

### 1. Redemption Threshold Logic (COMPLETED)
- **Issue:** Redemptions shown when protocol disabled them
- **Fix:** Corrected comparison logic from `<=` to `>=` in price-service.ts
- **Result:** UI correctly hides options when TWAP < $1.00

### 2. Precision Loss Prevention (IN PROGRESS)
- **Issue:** JavaScript float truncation causing transaction failures
- **Root Cause:** parseFloat() losing precision beyond 15 digits
- **Solution:** Replace with string-based precision-preserving methods

## Technical Architecture
- **Smart Contracts:** Diamond proxy pattern (EIP-2535) for upgradeability
- **Frontend:** TypeScript/React with Viem for blockchain interaction
- **Precision:** All amounts handled as bigint to maintain 18 decimals
- **State Management:** Clear separation of protocol vs user-controlled states

## Key Addresses
- **Diamond Proxy:** 0xED3084c98148e2528DaDCB53C56352e549C488fA
- **Curve Pool:** 0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f
- **UUSD:** 0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103
- **LUSD:** 0x5f98805A4E8be255a32880FDeC7F6728C6568bA0

## Current Protocol State
- **Redemptions:** DISABLED (TWAP $0.997 < threshold $1.00)
- **Fallback:** Curve swaps operational with good liquidity
- **UI:** Correctly adapts to protocol state

## Development Priorities
1. Complete float precision audit across codebase
2. Implement string-based formatting throughout
3. Test edge cases (dust, max balance, high precision)
4. Update documentation with precision guidelines
