import type { MintComponent } from './mint-component.ts';
import type { RedeemComponent } from './redeem-component.ts';

/**
 * Tab Manager Component
 * Handles tab switching and state management between mint and redeem tabs
 */
export class TabManager {
    private currentTab: 'mint' | 'redeem' = 'mint';
    private onTabChangeCallback?: (tab: 'mint' | 'redeem') => void;
    private walletConnected = false;
    private mintComponent?: MintComponent;
    private redeemComponent?: RedeemComponent;

    /**
     * Initialize the tab manager
     * @param onTabChange - Callback function called when tab changes
     */
    initialize(onTabChange?: (tab: 'mint' | 'redeem') => void): void {
        this.onTabChangeCallback = onTabChange;
        this.updateTabVisibility();
    }

    /**
     * Set component references for auto-population functionality
     * @param mintComponent - Reference to the mint component
     * @param redeemComponent - Reference to the redeem component
     */
    setComponents(mintComponent: MintComponent, redeemComponent: RedeemComponent): void {
        this.mintComponent = mintComponent;
        this.redeemComponent = redeemComponent;
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

        const previousTab = this.currentTab;
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

        // Trigger auto-population only when actually switching tabs
        if (previousTab !== tab) {
            this.triggerAutoPopulation(tab);
        }

        // Notify callback if provided
        if (this.onTabChangeCallback) {
            this.onTabChangeCallback(tab);
        }
    }

    /**
     * Trigger auto-population of input fields when switching to a tab
     * @param tab - The tab that was switched to
     */
    private triggerAutoPopulation(tab: 'mint' | 'redeem'): void {
        console.log(`🔄 [DEBUG] triggerAutoPopulation called for ${tab} tab`);
        console.log(`🔧 [DEBUG] mintComponent:`, this.mintComponent);
        console.log(`🔧 [DEBUG] redeemComponent:`, this.redeemComponent);

        // Small delay to ensure tab content is fully visible
        setTimeout(() => {
            try {
                if (tab === 'mint' && this.mintComponent) {
                    console.log(`🎯 [DEBUG] Triggering mint auto-populate`);
                    this.mintComponent.autoPopulateWithMaxBalance();
                } else if (tab === 'redeem' && this.redeemComponent) {
                    console.log(`🎯 [DEBUG] Triggering redeem auto-populate`);
                    this.redeemComponent.autoPopulateWithMaxBalance();
                } else {
                    console.warn(`❌ [DEBUG] Component not found for ${tab} tab`);
                }
            } catch (error) {
                console.error('❌ [DEBUG] Failed to auto-populate balance on tab switch:', error);
                // Silently fail - don't disrupt user experience
            }
        }, 100);
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
