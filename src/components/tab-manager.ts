/**
 * Tab Manager Component
 * Handles tab switching and state management between mint and redeem tabs
 */
export class TabManager {
    private currentTab: 'mint' | 'redeem' = 'mint';
    private onTabChangeCallback?: (tab: 'mint' | 'redeem') => void;
    private walletConnected = false;

    /**
     * Initialize the tab manager
     * @param onTabChange - Callback function called when tab changes
     */
    initialize(onTabChange?: (tab: 'mint' | 'redeem') => void): void {
        this.onTabChangeCallback = onTabChange;
        this.updateTabVisibility();
    }

    /**
     * Update wallet connection state
     * @param isConnected - Whether the wallet is connected
     */
    updateWalletConnection(isConnected: boolean): void {
        this.walletConnected = isConnected;
        this.updateTabVisibility();
    }

    /**
     * Update tab visibility based on wallet connection state
     */
    private updateTabVisibility(): void {
        const mintTab = document.getElementById('mintTab');
        const redeemTab = document.getElementById('redeemTab');
        const tabButtons = document.querySelector('.tabs');

        if (mintTab && redeemTab && tabButtons) {
            if (this.walletConnected) {
                // Show tab buttons
                (tabButtons as HTMLElement).style.display = 'block';
                // Show the current active tab content based on CSS classes
                this.switchTab(this.currentTab);
            } else {
                // Hide tab buttons and content
                (tabButtons as HTMLElement).style.display = 'none';
                mintTab.style.display = 'none';
                redeemTab.style.display = 'none';
            }
        }
    }

    /**
     * Switch to a specific tab
     * @param tab - The tab to switch to ('mint' or 'redeem')
     */
    switchTab(tab: 'mint' | 'redeem'): void {
        // Only allow tab switching if wallet is connected
        if (!this.walletConnected) {
            return;
        }

        this.currentTab = tab;

        const mintTab = document.getElementById('mintTab')!;
        const redeemTab = document.getElementById('redeemTab')!;

        // Clear any inline display styles so CSS classes can control visibility
        mintTab.style.display = '';
        redeemTab.style.display = '';

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab:nth-child(${tab === 'mint' ? 1 : 2})`)?.classList.add('active');

        // Update tab content classes
        mintTab.classList.toggle('active', tab === 'mint');
        redeemTab.classList.toggle('active', tab === 'redeem');

        // Notify callback if provided
        if (this.onTabChangeCallback) {
            this.onTabChangeCallback(tab);
        }
    }

    /**
     * Get the currently active tab
     * @returns The current tab identifier
     */
    getCurrentTab(): 'mint' | 'redeem' {
        return this.currentTab;
    }

    /**
     * Check if the given tab is currently active
     * @param tab - The tab to check
     * @returns True if the tab is active
     */
    isTabActive(tab: 'mint' | 'redeem'): boolean {
        return this.currentTab === tab;
    }
}
