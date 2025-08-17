import { formatUnits } from 'viem';

export async function debugSellTabVisibility() {
    console.log('=== DEBUG SELL TAB VISIBILITY ===');
    
    // Test balance checking functions
    console.log('\n1. Testing balance utils functions...');
    
    // Check if inventoryBar is available
    const inventoryBar = (window as any).inventoryBar;
    if (!inventoryBar) {
        console.log('❌ InventoryBar not found on window object');
        return;
    }
    
    console.log('✅ InventoryBar found');
    
    // Get current balances
    const balances = inventoryBar.getBalances();
    console.log('\n2. Current balances from inventoryBar:');
    balances.forEach((balance: any) => {
        const formatted = formatUnits(balance.balance, balance.decimals);
        console.log(`  ${balance.symbol}: ${formatted} (raw: ${balance.balance.toString()})`);
    });
    
    // Test hasAvailableBalance function
    console.log('\n3. Testing hasAvailableBalance function...');
    
    const hasAvailableBalance = (inventoryBar: any, tokenSymbol: string): boolean => {
        const balances = inventoryBar.getBalances();
        const tokenBalance = balances.find((balance: any) => balance.symbol === tokenSymbol);

        if (!tokenBalance) {
            console.log(`  ${tokenSymbol}: No balance entry found`);
            return false;
        }

        const hasBalance = tokenBalance.balance > 0n;
        console.log(`  ${tokenSymbol}: ${hasBalance} (balance: ${tokenBalance.balance.toString()})`);
        return hasBalance;
    };
    
    const hasLUSD = hasAvailableBalance(inventoryBar, 'LUSD');
    const hasUUSD = hasAvailableBalance(inventoryBar, 'UUSD');
    
    console.log(`\n4. Final results:`);
    console.log(`  hasLUSD: ${hasLUSD}`);
    console.log(`  hasUUSD: ${hasUUSD}`);
    
    // Check current DOM button states
    console.log('\n5. Current DOM button states:');
    const depositButton = document.getElementById('depositButton');
    const withdrawButton = document.getElementById('withdrawButton');
    
    if (depositButton) {
        console.log(`  Deposit button display: ${depositButton.style.display}`);
        console.log(`  Deposit button visible: ${depositButton.offsetParent !== null}`);
    } else {
        console.log('  ❌ Deposit button not found');
    }
    
    if (withdrawButton) {
        console.log(`  Withdraw button display: ${withdrawButton.style.display}`);
        console.log(`  Withdraw button visible: ${withdrawButton.offsetParent !== null}`);
    } else {
        console.log('  ❌ Withdraw button not found');
    }
    
    // Check if wallet is connected
    console.log('\n6. Wallet connection status:');
    const walletService = (window as any).walletService;
    if (walletService) {
        const account = walletService.getAccount();
        console.log(`  Wallet connected: ${!!account}`);
        console.log(`  Account: ${account || 'None'}`);
    } else {
        console.log('  ❌ WalletService not found');
    }
    
    // Test if this is a timing issue
    console.log('\n7. Testing balance refresh timing...');
    
    setTimeout(() => {
        console.log('--- After 1 second delay ---');
        const refreshedBalances = inventoryBar.getBalances();
        console.log('Refreshed balances:');
        refreshedBalances.forEach((balance: any) => {
            const formatted = formatUnits(balance.balance, balance.decimals);
            console.log(`  ${balance.symbol}: ${formatted} (raw: ${balance.balance.toString()})`);
        });
        
        const newHasUUSD = hasAvailableBalance(inventoryBar, 'UUSD');
        console.log(`Updated hasUUSD: ${newHasUUSD}`);
    }, 1000);
    
    setTimeout(() => {
        console.log('--- After 3 second delay ---');
        const refreshedBalances = inventoryBar.getBalances();
        console.log('Refreshed balances:');
        refreshedBalances.forEach((balance: any) => {
            const formatted = formatUnits(balance.balance, balance.decimals);
            console.log(`  ${balance.symbol}: ${formatted} (raw: ${balance.balance.toString()})`);
        });
        
        const newHasUUSD = hasAvailableBalance(inventoryBar, 'UUSD');
        console.log(`Updated hasUUSD: ${newHasUUSD}`);
    }, 3000);
}

// Run immediately when loaded
if (typeof window !== 'undefined') {
    // Wait for DOM and services to be ready
    setTimeout(() => {
        debugSellTabVisibility().catch(console.error);
    }, 2000);
}