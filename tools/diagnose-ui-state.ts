#!/usr/bin/env bun

/**
 * Diagnose why the checkbox is still appearing
 */

console.log(`
================================================================================
🔍 DIAGNOSING CHECKBOX VISIBILITY ISSUE
================================================================================

The checkbox is STILL appearing even though redemptions are disabled.
Let's find out WHY:

1. BROWSER CACHE - Old JavaScript might be cached
   Solution: Hard refresh (Cmd+Shift+R on Mac)

2. INITIALIZATION ORDER - Event listeners might be added before state check
   Current order in simplified-exchange-component.ts:
   - init() -> setupEventListeners() happens immediately
   - checkRedemptionStatus() only runs if direction === 'withdraw'

   PROBLEM: If user starts on "Buy UUSD" then clicks "Sell UUSD",
   the event listener is already attached BEFORE we check redemption status!

3. RACE CONDITION - Async checkRedemptionStatus might not complete before render

Let's trace the exact flow:
================================================================================
`);

// Generate a fix that runs IMMEDIATELY on page load
const immediateFixCode = `
// IMMEDIATE FIX - Run this in browser console
(function() {
    console.log('🚨 APPLYING IMMEDIATE FIX');

    // Force hide the checkbox RIGHT NOW
    const swapOnlyDiv = document.getElementById('swapOnlyOption');
    const swapOnlyCheckbox = document.getElementById('forceSwapOnly');

    if (swapOnlyDiv) {
        swapOnlyDiv.style.display = 'none';
        swapOnlyDiv.style.visibility = 'hidden';
        swapOnlyDiv.style.pointerEvents = 'none';
        swapOnlyDiv.setAttribute('aria-hidden', 'true');
        console.log('✅ Forced checkbox container to be hidden');
    }

    if (swapOnlyCheckbox) {
        swapOnlyCheckbox.checked = true;
        swapOnlyCheckbox.disabled = true;
        swapOnlyCheckbox.style.pointerEvents = 'none';

        // Remove ALL event listeners
        const newCheckbox = swapOnlyCheckbox.cloneNode(true);
        swapOnlyCheckbox.parentNode.replaceChild(newCheckbox, swapOnlyCheckbox);
        console.log('✅ Disabled checkbox and removed all listeners');
    }

    // Override the exchange component if it exists
    if (window.app && window.app.exchange) {
        const exchange = window.app.exchange;

        // Force the state
        exchange.state.redemptionsDisabled = true;
        exchange.state.forceSwapOnly = true;

        // Override renderOptions to ALWAYS hide
        const originalRenderOptions = exchange.renderOptions.bind(exchange);
        exchange.renderOptions = function() {
            console.log('🔒 renderOptions called - forcing checkbox hidden');
            originalRenderOptions();

            // ALWAYS hide after render
            const swapDiv = document.getElementById('swapOnlyOption');
            if (swapDiv) {
                swapDiv.style.display = 'none';
                swapDiv.style.visibility = 'hidden';
            }
        };

        console.log('✅ Overrode exchange component');
        console.log('State:', exchange.state);
    }

    // Monitor for any changes that try to show it
    const observer = new MutationObserver((mutations) => {
        const swapDiv = document.getElementById('swapOnlyOption');
        if (swapDiv && (swapDiv.style.display !== 'none' || swapDiv.style.visibility !== 'hidden')) {
            console.warn('⚠️ Something tried to show the checkbox! Hiding it again.');
            swapDiv.style.display = 'none';
            swapDiv.style.visibility = 'hidden';
        }
    });

    const swapDiv = document.getElementById('swapOnlyOption');
    if (swapDiv) {
        observer.observe(swapDiv, {
            attributes: true,
            attributeFilter: ['style']
        });
        console.log('✅ Set up mutation observer to prevent showing');
    }

    console.log('✅ IMMEDIATE FIX APPLIED');
    console.log('Try clicking "Sell UUSD" now - checkbox should be hidden');
})();
`;

await Bun.write('tools/immediate-fix.js', immediateFixCode);

console.log(`
IMMEDIATE ACTION REQUIRED:
==========================

1. Open browser: http://localhost:3000
2. Open DevTools Console (F12)
3. HARD REFRESH the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
4. Copy and paste this into console:

${immediateFixCode}

5. Then click "Sell UUSD" and check if checkbox appears

This will forcefully hide the checkbox and override the component.
`);
