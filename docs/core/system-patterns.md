# System Patterns: uusd.ubq.fi

## System Architecture:

-   **`contracts/packages/dapp`**: This is a Next.js application that serves as the primary user interface for interacting with the Ubiquity protocol. It consumes data from the blockchain and allows users to mint, redeem, stake, and participate in governance.
-   **`src/` (Root Level)**: This directory contains the core application logic, services, components, and utilities that power the `uusd.ubq.fi` frontend. It interacts with the smart contracts via web3 libraries.
-   **`tools/`**: Contains various utility scripts and tools for development, deployment, debugging, and interaction with the contracts and the dapp.

## Key Technical Decisions:

-   **Diamond Standard (EIP-2535):** The core Ubiquity Dollar contract is implemented using the Diamond Standard. This allows for upgradeability, modularity, and the ability to add or remove functionalities (facets) without redeploying the entire contract.
-   **TypeScript:** The frontend application and many scripts are written in TypeScript, providing type safety and improving code maintainability.
-   **Bun:** Used as the JavaScript runtime and package manager, offering performance benefits for development and build processes.
-   **BigInt for Precision:** All token amounts handled as bigint to avoid JavaScript float precision issues.
-   **String-Based Formatting:** Using string manipulation instead of parseFloat to preserve full decimal precision.

## Design Patterns in Use:

-   **Proxy Pattern (Diamond Standard):** Enables upgradeability and modularity of smart contracts.
-   **Facet Pattern:** A core part of the Diamond Standard, where different functionalities are separated into distinct "facets".
-   **Strategy Pattern (for Route Selection):** OptimalRouteService implements intelligent routing strategies, automatically selecting between mint/redeem and swap based on market conditions.
-   **Service-Oriented Architecture (Frontend):** The frontend application is structured with distinct services managing specific responsibilities.
-   **Observer Pattern:** Components subscribe to balance updates and market condition changes for real-time UI updates.
-   **State Management Pattern:** Clear separation between protocol state (redemptionsDisabled) and user preferences (forceSwapOnly).
-   **Fail-Safe Pattern:** Default to safer options (Curve swap) when protocol state is uncertain.

## Component Relationships:

### Core Protocol Components:
-   **UUSD (Ubiquity Dollar):** The central stablecoin, managed by the Diamond contract.
-   **Collateral (LUSD):** 95% backing for UUSD stability.
-   **Governance (UBQ):** 5% algorithmic component for protocol control.

### Service Layer:
-   **PriceService:** Manages oracle prices and redemption threshold checks
-   **SwapService:** Handles Curve pool interactions with proper slippage calculations
-   **OptimalRouteService:** Intelligent routing between mint/redeem and Curve swap
-   **CurvePriceService:** Real-time price feeds from Curve pools
-   **ContractService:** Direct blockchain interactions via Diamond proxy

### UI Components:
-   **SimplifiedExchangeComponent:** Main interface with redemption status tracking
-   **InventoryBarComponent:** Balance display and updates
-   **NotificationManager:** User feedback for transactions and errors

## Data Flow Patterns:

### Redemption Status Check:
1. PriceService fetches TWAP and threshold
2. Compares: `twapPrice >= redeemPriceThreshold`
3. Updates `isRedeemingAllowed` flag
4. Component reads flag and sets `redemptionsDisabled`
5. UI hides/shows checkbox accordingly

### Precision-Safe Balance Flow:
1. Contract returns balance as bigint
2. formatUnits converts to decimal string
3. String manipulation preserves precision (no parseFloat)
4. Display to user or use in transaction

### Transaction Execution:
1. User input → parseEther (string to bigint)
2. Route calculation with bigint math
3. Approval check with exact bigint comparison
4. Transaction with precise bigint amount
5. Receipt confirmation

## Error Handling Patterns:

-   **Precision Errors:** Detected via "transfer amount exceeds balance"
-   **Protocol State Errors:** Default to safe mode (Curve swap only)
-   **Network Errors:** Retry with exponential backoff
-   **User Errors:** Clear messaging with suggested actions

## Testing Patterns:

-   **Debug Tools:** Standalone scripts for isolated testing (`tools/debug-*.ts`)
-   **State Verification:** Check scripts for protocol state (`tools/check-*.ts`)
-   **Integration Testing:** Full flow testing with real contracts
-   **Edge Case Testing:** Dust amounts, max balances, precision limits
