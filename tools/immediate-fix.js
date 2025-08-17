// IMMEDIATE FIX - Paste this in browser console AFTER hard refresh

(function() {
    console.log('🚨 EMERGENCY FIX INITIATED');

    // Check if we have the latest code
    if (window.app && window.app.exchange) {
        const hasNewCode = typeof window.app.exchange.state.redemptionsDisabled !== 'undefined';

        if (!hasNewCode) {
            console.error('❌ OLD CODE DETECTED! You need to:');
            console.error('1. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)');
            console.error('2. Clear browser cache if that doesn\'t work');
            console.error('3. Open DevTools, go to Network tab, check "Disable cache"');
            return;
        }

        console.log('✅ New code detected, applying fix...');

        // Force correct state
        const exchange = window.app.exchange;
        exchange.state.redemptionsDisabled = true;
        exchange.state.forceSwapOnly = true;

        // Override switchDirection to ALWAYS hide checkbox for withdrawals
        const originalSwitch = exchange.switchDirection.bind(exchange);
        exchange.switchDirection = async function(direction) {
            console.log('🔒 Intercepted switchDirection:', direction);

            if (direction === 'withdraw') {
                // Hide IMMEDIATELY before anything else
                const swapDiv = document.getElementById('swapOnlyOption');
                if (swapDiv) {
                    swapDiv.style.cssText = 'display: none !important; visibility: hidden !important; pointer-events: none !important;';
                }

                // Force state
                this.state.redemptionsDisabled = true;
                this.state.forceSwapOnly = true;
            }

            return originalSwitch(direction);
        };

        // Override renderOptions to NEVER show checkbox
        const originalRender = exchange.renderOptions.bind(exchange);
        exchange.renderOptions = function() {
            originalRender();

            // ALWAYS hide after render if withdrawals
            if (this.state.direction === 'withdraw') {
                const swapDiv = document.getElementById('swapOnlyOption');
                if (swapDiv) {
                    swapDiv.style.cssText = 'display: none !important; visibility: hidden !important; pointer-events: none !important;';
                }
            }
        };

        // Hide it right now
        const swapDiv = document.getElementById('swapOnlyOption');
        if (swapDiv) {
            swapDiv.style.cssText = 'display: none !important; visibility: hidden !important; pointer-events: none !important;';
        }

        console.log('✅ FIX APPLIED. Current state:', {
            redemptionsDisabled: exchange.state.redemptionsDisabled,
            forceSwapOnly: exchange.state.forceSwapOnly
        });

        console.log('📝 Now click "Sell UUSD" - checkbox should be hidden');

    } else {
        console.error('❌ App not loaded. Refresh the page and try again.');
    }
})();
