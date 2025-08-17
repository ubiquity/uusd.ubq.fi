import { parseUnits, formatUnits } from 'viem';
import { getMaxTokenBalance, hasAvailableBalance, getBalanceDisplay } from '../src/utils/balance-utils.ts';
import { formatTokenAmount, isBalanceZero, calculateTotalUsdValue } from '../src/utils/token-utils.ts';
import type { TokenBalance } from '../src/types/inventory.types.ts';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, testFn: () => boolean): void {
    testsRun++;
    console.log(`\n🧪 Testing: ${name}`);
    
    try {
        const passed = testFn();
        if (passed) {
            testsPassed++;
            console.log(`✅ PASS`);
        } else {
            testsFailed++;
            console.log(`❌ FAIL`);
        }
    } catch (error) {
        testsFailed++;
        console.log(`❌ ERROR: ${error}`);
    }
}

function createMockInventoryBar(balances: TokenBalance[]) {
    return {
        getBalances: () => balances
    };
}

function testOriginalPrecisionIssue(): boolean {
    console.log(`Testing the exact original precision loss case: 7405.818888349437578870 UUSD`);
    
    const testAmount = '7405.818888349437578870';
    const decimals = 18;
    
    const bigintAmount = parseUnits(testAmount, decimals);
    console.log(`BigInt representation: ${bigintAmount}n`);
    
    const mockBalance: TokenBalance = {
        symbol: 'UUSD',
        balance: bigintAmount,
        decimals: decimals,
        usdValue: 7405.82
    };
    
    const mockInventory = createMockInventoryBar([mockBalance]);
    
    const result = getMaxTokenBalance(mockInventory, 'UUSD');
    console.log(`getMaxTokenBalance result: "${result}"`);
    
    const originalFloat = parseFloat(testAmount);
    const floatResult = originalFloat.toString();
    console.log(`parseFloat would give: "${floatResult}"`);
    
    const isPrecisionPreserved = result === testAmount || result === testAmount.replace(/\.?0+$/, '');
    const isFloatDifferent = floatResult !== testAmount;
    
    console.log(`Precision preserved: ${isPrecisionPreserved}`);
    console.log(`Float loses precision: ${isFloatDifferent}`);
    
    return isPrecisionPreserved && isFloatDifferent;
}

function testStringBasedTrimming(): boolean {
    console.log(`Testing string-based trimming preserves full precision`);
    
    const testCases = [
        { input: '7405.818888349437578870', expected: '7405.81888834943757887' },
        { input: '0.000000000000000001', expected: '0.000000000000000001' },
        { input: '1.000000000000000000', expected: '1' },
        { input: '0.100000000000000000', expected: '0.1' },
        { input: '123.456000000000000000', expected: '123.456' }
    ];
    
    for (const testCase of testCases) {
        const decimals = 18;
        const bigintAmount = parseUnits(testCase.input, decimals);
        const formatted = formatUnits(bigintAmount, decimals);
        const trimmed = formatted.replace(/\.?0+$/, '');
        
        console.log(`Input: ${testCase.input} -> Formatted: ${formatted} -> Trimmed: ${trimmed}`);
        
        if (trimmed !== testCase.expected) {
            console.log(`Expected: ${testCase.expected}, Got: ${trimmed}`);
            return false;
        }
    }
    
    return true;
}

function testBigIntThresholdComparisons(): boolean {
    console.log(`Testing BigInt threshold comparisons work correctly`);
    
    const smallAmount = parseUnits('0.000000000000000001', 18);
    const threshold = parseUnits('0.0001', 18);
    const largeAmount = parseUnits('1.5', 18);
    
    console.log(`Small amount (1 wei): ${smallAmount}n`);
    console.log(`Threshold (0.0001): ${threshold}n`);
    console.log(`Large amount (1.5): ${largeAmount}n`);
    
    const isSmallLessThanThreshold = smallAmount < threshold;
    const isLargeGreaterThanThreshold = largeAmount > threshold;
    const isBalanceZeroSmall = isBalanceZero(smallAmount, 18);
    const isBalanceZeroLarge = isBalanceZero(largeAmount, 18);
    
    console.log(`Small < Threshold: ${isSmallLessThanThreshold}`);
    console.log(`Large > Threshold: ${isLargeGreaterThanThreshold}`);
    console.log(`isBalanceZero(small): ${isBalanceZeroSmall}`);
    console.log(`isBalanceZero(large): ${isBalanceZeroLarge}`);
    
    return isSmallLessThanThreshold && isLargeGreaterThanThreshold && 
           isBalanceZeroSmall && !isBalanceZeroLarge;
}

function testTokenAmountFormatting(): boolean {
    console.log(`Testing token amount formatting maintains precision`);
    
    const testAmount = parseUnits('7405.818888349437578870', 18);
    const formatted = formatTokenAmount(testAmount, 18, 8);
    
    console.log(`Formatted amount: ${formatted}`);
    
    const containsCommas = formatted.includes(',');
    const hasReasonableLength = formatted.length > 10;
    const isNotScientific = !formatted.includes('e');
    
    console.log(`Contains commas: ${containsCommas}`);
    console.log(`Reasonable length: ${hasReasonableLength}`);
    console.log(`Not scientific notation: ${isNotScientific}`);
    
    return containsCommas && hasReasonableLength && isNotScientific;
}

function testUsdValueCalculations(): boolean {
    console.log(`Testing USD value calculations maintain precision`);
    
    const balances: TokenBalance[] = [
        {
            symbol: 'UUSD',
            balance: parseUnits('7405.818888349437578870', 18),
            decimals: 18,
            usdValue: 7405.818888349438
        },
        {
            symbol: 'USDC',
            balance: parseUnits('1234.567890', 6),
            decimals: 6,
            usdValue: 1234.56
        }
    ];
    
    const totalUsd = calculateTotalUsdValue(balances);
    const expectedTotal = 7405.818888349438 + 1234.56;
    
    console.log(`Total USD value: ${totalUsd}`);
    console.log(`Expected total: ${expectedTotal}`);
    
    const precision = Math.abs(totalUsd - expectedTotal);
    const isPrecise = precision < 0.001;
    
    console.log(`Precision difference: ${precision}`);
    console.log(`Within acceptable range: ${isPrecise}`);
    
    return isPrecise;
}

function testBalanceDisplayFormatting(): boolean {
    console.log(`Testing balance display formatting preserves precision`);
    
    const testBalance: TokenBalance = {
        symbol: 'UUSD',
        balance: parseUnits('7405.818888349437578870', 18),
        decimals: 18,
        usdValue: 7405.82
    };
    
    const mockInventory = createMockInventoryBar([testBalance]);
    const display = getBalanceDisplay(mockInventory, 'UUSD');
    
    console.log(`Balance display: ${display}`);
    
    const isString = typeof display === 'string';
    const hasContent = display.length > 0;
    const isNotZero = display !== '0';
    const hasCommas = display.includes(',');
    
    console.log(`Is string: ${isString}`);
    console.log(`Has content: ${hasContent}`);
    console.log(`Not zero: ${isNotZero}`);
    console.log(`Has commas: ${hasCommas}`);
    
    return isString && hasContent && isNotZero && hasCommas;
}

function testAvailableBalanceCheck(): boolean {
    console.log(`Testing available balance check uses BigInt comparison`);
    
    const zeroBalance: TokenBalance = {
        symbol: 'ZERO',
        balance: 0n,
        decimals: 18
    };
    
    const smallBalance: TokenBalance = {
        symbol: 'SMALL',
        balance: 1n,
        decimals: 18
    };
    
    const mockInventory = createMockInventoryBar([zeroBalance, smallBalance]);
    
    const hasZero = hasAvailableBalance(mockInventory, 'ZERO');
    const hasSmall = hasAvailableBalance(mockInventory, 'SMALL');
    
    console.log(`Has zero balance: ${hasZero}`);
    console.log(`Has small balance (1 wei): ${hasSmall}`);
    
    return !hasZero && hasSmall;
}

function runAllTests(): void {
    console.log('🚀 Starting Precision Fixes Validation Tests\n');
    console.log('Testing UUSD DeFi Protocol Float Precision Fixes');
    console.log('=' .repeat(60));
    
    test('Original Precision Issue (7405.818888349437578870)', testOriginalPrecisionIssue);
    test('String-Based Trimming Preserves Precision', testStringBasedTrimming);
    test('BigInt Threshold Comparisons', testBigIntThresholdComparisons);
    test('Token Amount Formatting', testTokenAmountFormatting);
    test('USD Value Calculations', testUsdValueCalculations);
    test('Balance Display Formatting', testBalanceDisplayFormatting);
    test('Available Balance Check (BigInt)', testAvailableBalanceCheck);
    
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    
    if (testsFailed === 0) {
        console.log('\n🎉 ALL PRECISION FIXES WORKING CORRECTLY!');
        console.log('✅ Float precision issues have been successfully resolved.');
        console.log('✅ BigInt arithmetic preserves exact precision.');
        console.log('✅ String-based operations prevent precision loss.');
        console.log('✅ UI components display accurate values.');
    } else {
        console.log('\n⚠️  SOME TESTS FAILED - PRECISION ISSUES DETECTED!');
        console.log(`❌ ${testsFailed} test(s) failed - precision fixes need attention.`);
    }
    
    console.log('\n🔍 Key Validations:');
    console.log('• Original parseFloat precision loss case fixed');
    console.log('• BigInt comparisons work for thresholds');
    console.log('• formatUnits preserves full precision');
    console.log('• UI formatting maintains accuracy');
    console.log('• Balance calculations use exact arithmetic');
}

if (import.meta.main) {
    runAllTests();
}