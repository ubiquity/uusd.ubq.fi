import { formatEther, parseEther } from 'viem';

async function testWalletEdgeCases() {
    console.log('🧪 Starting Wallet-First Exchange Edge Case Testing...\n');

    // Test 1: Zero Balance Detection
    console.log('=== Test 1: Zero Balance Detection ===');
    await testZeroBalances();

    // Test 2: Dust Balance Handling  
    console.log('\n=== Test 2: Dust Balance Handling ===');
    await testDustBalances();

    // Test 3: Balance Update Scenarios
    console.log('\n=== Test 3: Balance Update Scenarios ===');
    await testBalanceUpdates();

    // Test 4: Wallet Connection Transitions
    console.log('\n=== Test 4: Wallet Connection Transitions ===');
    await testConnectionTransitions();

    // Test 5: UI State Management
    console.log('\n=== Test 5: UI State Management ===');
    await testUIStateManagement();

    // Test 6: Error Handling
    console.log('\n=== Test 6: Error Handling ===');
    await testErrorHandling();

    // Test 7: Console Error Detection
    console.log('\n=== Test 7: Console Error Detection ===');
    await testConsoleErrors();

    console.log('\n✅ Edge case testing complete!');
}

async function testZeroBalances() {
    console.log('Testing zero balance scenarios...');
    
    // Add logging to track balance checking
    console.log('[EDGE_TEST] Adding balance check logs...');
    
    // Test hasAvailableBalance with zero balance
    const mockInventoryBar = {
        getBalances: () => [
            { symbol: 'LUSD', balance: 0n, decimals: 18 },
            { symbol: 'UUSD', balance: 0n, decimals: 18 }
        ]
    };

    // Test the balance utilities directly
    const { hasAvailableBalance, getMaxTokenBalance } = await import('../src/utils/balance-utils.ts');
    
    console.log('[EDGE_TEST] LUSD zero balance check:', hasAvailableBalance(mockInventoryBar as any, 'LUSD'));
    console.log('[EDGE_TEST] UUSD zero balance check:', hasAvailableBalance(mockInventoryBar as any, 'UUSD'));
    console.log('[EDGE_TEST] LUSD max balance:', getMaxTokenBalance(mockInventoryBar as any, 'LUSD'));
    console.log('[EDGE_TEST] UUSD max balance:', getMaxTokenBalance(mockInventoryBar as any, 'UUSD'));
    
    // Test renderNoTokensState functionality
    try {
        const hasRenderNoTokensState = checkForRenderNoTokensState();
        console.log('[EDGE_TEST] renderNoTokensState exists:', hasRenderNoTokensState);
    } catch (error) {
        console.log('[EDGE_TEST] renderNoTokensState check failed:', (error as Error).message);
    }
}

async function testDustBalances() {
    console.log('Testing dust balance scenarios...');
    
    // Very small amounts (less than display threshold)
    const dustAmounts = [
        1n, // 1 wei
        1000n, // 0.000000000000001 
        100000000000000n, // 0.0001 (threshold)
        99999999999999n // just below threshold
    ];
    
    const { hasAvailableBalance, getMaxTokenBalance } = await import('../src/utils/balance-utils.ts');
    
    dustAmounts.forEach((amount, i) => {
        const mockInventoryBar = {
            getBalances: () => [
                { symbol: 'LUSD', balance: amount, decimals: 18 },
                { symbol: 'UUSD', balance: amount, decimals: 18 }
            ]
        };

        console.log(`[EDGE_TEST] Dust test ${i+1} (${amount}n wei):`);
        console.log('  LUSD available:', hasAvailableBalance(mockInventoryBar as any, 'LUSD'));
        console.log('  UUSD available:', hasAvailableBalance(mockInventoryBar as any, 'UUSD'));
        console.log('  LUSD max balance:', getMaxTokenBalance(mockInventoryBar as any, 'LUSD'));
        console.log('  UUSD max balance:', getMaxTokenBalance(mockInventoryBar as any, 'UUSD'));
    });
}

async function testBalanceUpdates() {
    console.log('Testing balance update scenarios...');
    
    // Simulate balance changes and check auto-population
    console.log('[EDGE_TEST] Simulating balance changes...');
    
    // Test precision loss scenario from docs (known issue)
    const precisionLossTest = parseEther('7405.818888349437578870');
    console.log('[EDGE_TEST] Original precise amount:', precisionLossTest.toString());
    console.log('[EDGE_TEST] Formatted with formatEther:', formatEther(precisionLossTest));
    console.log('[EDGE_TEST] parseFloat precision test:', parseFloat(formatEther(precisionLossTest)).toString());
}

async function testConnectionTransitions() {
    console.log('Testing wallet connection transitions...');
    
    // Test wallet connection state checks
    console.log('[EDGE_TEST] Checking wallet connection handling...');
    
    // Check if wallet event handlers are properly set up
    const walletConnectionTests = [
        'connect event handling',
        'disconnect event handling', 
        'account change event handling',
        'mid-session connection changes'
    ];
    
    walletConnectionTests.forEach(test => {
        console.log(`[EDGE_TEST] ${test}: Testing required`);
    });
}

async function testUIStateManagement() {
    console.log('Testing UI state management...');
    
    // Check tab visibility logic
    console.log('[EDGE_TEST] Testing tab visibility changes...');
    
    const stateTransitions = [
        'wallet disconnected -> connected',
        'zero balance -> positive balance',
        'positive balance -> zero balance',
        'single token -> multiple tokens',
        'redemptions enabled -> disabled',
        'redemptions disabled -> enabled'
    ];
    
    stateTransitions.forEach(transition => {
        console.log(`[EDGE_TEST] State transition "${transition}": Manual verification needed`);
    });
}

async function testErrorHandling() {
    console.log('Testing error handling scenarios...');
    
    const errorScenarios = [
        'balance checking failures',
        'wallet connection errors',
        'redemption status check failures',
        'auto-population errors'
    ];
    
    errorScenarios.forEach(scenario => {
        console.log(`[EDGE_TEST] Error scenario "${scenario}": Requires user interaction testing`);
    });
}

async function testConsoleErrors() {
    console.log('Setting up console error detection...');
    
    // Monitor for console errors
    const originalError = console.error;
    const errors: string[] = [];
    
    console.error = function(...args: any[]) {
        errors.push(args.join(' '));
        originalError.apply(console, args);
    };
    
    console.log('[EDGE_TEST] Console error monitoring active');
    console.log('[EDGE_TEST] Run wallet operations and check for captured errors');
    
    // Restore after a delay to capture any async errors
    setTimeout(() => {
        console.error = originalError;
        if (errors.length > 0) {
            console.log('[EDGE_TEST] Captured console errors:');
            errors.forEach(error => console.log('  ERROR:', error));
        } else {
            console.log('[EDGE_TEST] No console errors detected');
        }
    }, 5000);
}

function checkForRenderNoTokensState(): boolean {
    // Check if renderNoTokensState function exists in the component
    try {
        const fs = require('fs');
        const componentCode = fs.readFileSync('src/components/simplified-exchange-component.ts', 'utf8');
        return componentCode.includes('renderNoTokensState');
    } catch {
        return false;
    }
}

// Run tests
testWalletEdgeCases().catch(console.error);