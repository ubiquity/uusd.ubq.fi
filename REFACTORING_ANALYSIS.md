# UUSD Monolithic Application - Refactoring Analysis

## Current Code Structure Analysis

### Monolithic `UUSDApp` Class (807 lines)

The application is currently implemented as a single class containing:

#### 1. **Wallet Management** (Lines 180-246)
- Web3 client setup (`createWalletClient`, `createPublicClient`)
- Wallet connection logic with MetaMask detection
- Account state management
- UI updates for wallet connection status

#### 2. **Contract Interactions** (Lines 260-295, 364-448, 491-599)
- Loading collateral options from Diamond contract
- Complex calculation methods (`calculateMintOutput`, `calculateRedeemOutput`)
- Approval checking and management
- Transaction execution (mint/redeem/collect)

#### 3. **Business Logic** (Lines 315-413, 450-535)
- **Dynamic collateral ratio calculations** with three modes:
  - 100% collateral mode (`collateralRatio >= 1000000`)
  - Mixed mode (`0 < collateralRatio < 1000000`)
  - Governance-only mode (`collateralRatio === 0`)
- **Multi-step transaction flows** requiring approval management
- **Real-time price calculations** responding to user input
- **Fee calculations** and output formatting

#### 4. **UI Logic** (Lines 203-258, 297-362, 777-803)
- DOM manipulation for form elements
- Tab switching between mint/redeem
- Real-time output updates
- Error/success message display
- Event listener setup

#### 5. **State Management** (Scattered throughout)
- Private properties for clients, account, collateral options
- Form state via DOM elements
- Transaction state during execution

## Identified Code Sections for Refactoring

### Phase 1: Pure Functions (Utils)

**Target extractions for `src/utils/`:**

#### `calculation-utils.ts`
- **Lines 364-413**: `calculateMintOutput()` - Complex calculation with collateral ratios
- **Lines 491-535**: `calculateRedeemOutput()` - Redemption calculation logic
- **Lines 409-411**: Fee calculation logic (can be extracted to pure function)

#### `format-utils.ts`
- **Lines 235-236**: Address truncation (`${address.slice(0, 6)}...${address.slice(-4)}`)
- **Lines 346-353**: Amount formatting with `formatEther` and `formatUnits`
- **Lines 475-480**: Output display formatting

#### `validation-utils.ts`
- **Lines 324-328**: Input validation logic (amount and collateral selection)
- **Lines 458-462**: Redeem input validation
- **Lines 418-421**: Wallet connection validation

### Phase 2: Service Layer Candidates

**Target extractions for `src/services/`:**

#### `wallet-service.ts`
- **Lines 218-246**: Wallet connection, account management
- **Lines 186-190**: Client initialization
- Wallet state management methods

#### `contract-service.ts`
- **Lines 260-295**: Collateral loading and contract information queries
- **Lines 424-448**: Allowance checking logic
- **Lines 583-599**: Pending redemption checking
- All contract read operations

#### `price-service.ts`
- **Lines 369-380**: Collateral ratio and governance price fetching
- Integration with calculation utils
- Price-related contract calls

#### `transaction-service.ts`
- **Lines 628-689**: Mint transaction handling with approval flows
- **Lines 691-775**: Redeem transaction handling
- **Lines 713-728**: Collect redemption logic
- Multi-step approval and execution flows

### Phase 3: UI Component Extraction

**Target extractions for `src/components/`:**

#### `mint-component.ts`
- **Lines 315-362**: Mint output calculation and UI updates
- **Lines 415-448**: Mint button state management
- Mint form event handling

#### `redeem-component.ts`
- **Lines 450-489**: Redeem output calculation and UI updates
- **Lines 537-581**: Redeem button state management
- Redeem form event handling

#### `tab-manager.ts`
- **Lines 248-258**: Tab switching logic
- Tab state management

#### `notification-manager.ts`
- **Lines 777-803**: Error and success message display
- **Lines 595**: Pending redemption notifications
- Message state management

## Critical Business Logic Patterns

### 1. **Collateral Ratio Modes**
```typescript
// Three distinct calculation modes based on collateral ratio
if (isForceCollateralOnly || collateralRatio >= poolPricePrecision) {
    // 100% collateral mode
} else if (collateralRatio === 0n) {
    // 100% governance mode
} else {
    // Mixed mode: split between collateral and governance
}
```

### 2. **Multi-Step Approval Workflow**
```typescript
// Pattern: Check allowance → Approve if needed → Execute transaction
const allowance = await checkAllowance();
if (allowance < needed) {
    await approveToken();
    return; // Wait for user to try again
}
await executeTransaction();
```

### 3. **Real-Time Calculation Updates**
```typescript
// Pattern: Input change → Recalculate → Update UI
addEventListener('input', async () => {
    const output = await calculateOutput();
    updateUI(output);
    updateButtonState();
});
```

## Extraction Strategy - Three-Phase Approach

### **Phase 1: Extract Pure Functions (Week 1)**
**Goal**: Create isolated, testable utility functions

**Benefits**:
- Immediate testing capability for business logic
- No side effects or dependencies
- Easy to reason about and debug

**Extraction Order**:
1. `calculation-utils.ts` - Core mathematical operations
2. `format-utils.ts` - Display formatting functions
3. `validation-utils.ts` - Input validation logic

**Success Criteria**:
- All utility functions are pure (no side effects)
- 100% unit test coverage for calculations
- Original UUSDApp still functional using extracted utilities

### **Phase 2: Extract Services Layer (Week 2)**
**Goal**: Separate business logic from UI logic

**Benefits**:
- Clear separation of concerns
- Dependency injection enables testing
- Business logic reusable across components

**Extraction Order**:
1. `contract-service.ts` - All blockchain interactions
2. `wallet-service.ts` - Wallet management
3. `price-service.ts` - Price calculations using contract service
4. `transaction-service.ts` - Transaction flows using other services

**Success Criteria**:
- Services are injectable and testable
- Clear interfaces define service contracts
- UI logic separated from business logic

### **Phase 3: Extract UI Components (Week 3)**
**Goal**: Modular, maintainable UI components

**Benefits**:
- Single responsibility components
- Easier testing and debugging
- Better code organization

**Extraction Order**:
1. `notification-manager.ts` - Error/success messages
2. `tab-manager.ts` - Tab switching logic
3. `mint-component.ts` - Mint functionality
4. `redeem-component.ts` - Redeem functionality

**Success Criteria**:
- Components handle single UI concerns
- Clear interfaces for component communication
- Dependency injection for service access

## File Organization Completed

```
src/
├── components/          # Phase 3: UI components
├── contracts/           # ✅ Contract constants and ABIs
│   └── constants.ts
├── services/           # Phase 2: Business logic services
├── utils/              # Phase 1: Pure functions
├── types/              # ✅ TypeScript interfaces
│   └── contracts.ts
├── styles/             # ✅ CSS styles
│   └── main.css
└── app.ts              # ✅ Monolithic class (to be refactored)

public/
└── index.html          # ✅ HTML structure (CSS extracted)
```

## Key Preservation Requirements

### **Mathematical Precision**
- Exact collateral ratio calculations must be preserved
- BigInt operations for blockchain precision
- Fee calculation accuracy

### **Transaction Flow Integrity**
- Multi-step approval workflows must work identically
- Error handling patterns must be maintained
- State transitions must be preserved

### **UI Behavior Consistency**
- Real-time updates based on input changes
- Button state management (approval vs transaction)
- Error/success message patterns

### **Blockchain Integration**
- Contract interaction patterns
- Event handling and transaction waiting
- Network error handling

## Next Steps for Refactoring

1. **Begin Phase 1**: Extract pure calculation functions to utils
2. **Maintain backward compatibility**: Keep original app.ts working during extraction
3. **Add comprehensive testing**: Unit tests for each extracted function
4. **Iterative approach**: Extract one function at a time, test, and verify
5. **Update imports**: Gradually replace inline logic with utility imports

The refactoring preparation is complete with:
- ✅ Folder structure created
- ✅ Files organized (app.ts → src/, index.html → public/, CSS extracted)
- ✅ Type definitions created
- ✅ Contract constants extracted
- ✅ Unused files removed (index.ts)
- ✅ Detailed refactoring plan documented

Ready to begin Phase 1 implementation when approved.