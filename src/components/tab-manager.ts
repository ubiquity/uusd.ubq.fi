/**
 * Tab Manager Component
 * Handles tab switching and state management between mint and redeem tabs
 */
export class TabManager {
    private currentTab: 'mint' | 'redeem' = 'mint';
    private onTabChangeCallback?: (tab: 'mint' | 'redeem') => void;

    /**
     * Initialize the tab manager
     * @param onTabChange - Callback function called when tab changes
     */
    initialize(onTabChange?: (tab: 'mint' | 'redeem') => void): void {
        this.onTabChangeCallback = onTabChange;
    }

    /**
     * Switch to a specific tab
     * @param tab - The tab to switch to ('mint' or 'redeem')
     */
    switchTab(tab: 'mint' | 'redeem'): void {
        this.currentTab = tab;

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab:nth-child(${tab === 'mint' ? 1 : 2})`)?.classList.add('active');

        // Update tab content
        document.getElementById('mintTab')!.classList.toggle('active', tab === 'mint');
        document.getElementById('redeemTab')!.classList.toggle('active', tab === 'redeem');

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