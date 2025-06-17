/**
 * Notification Manager Component
 * Handles error and success message display with consistent styling and behavior
 */
export class NotificationManager {

    /**
     * Display an error message for a specific tab
     * @param tab - The tab identifier ('mint' or 'redeem')
     * @param message - The error message to display
     */
    showError(tab: string, message: string): void {
        const errorEl = document.getElementById(`${tab}Error`);
        const successEl = document.getElementById(`${tab}Success`);

        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        if (successEl) {
            successEl.style.display = 'none';
        }
    }

    /**
     * Display a success message for a specific tab
     * @param tab - The tab identifier ('mint' or 'redeem')
     * @param message - The success message to display
     */
    showSuccess(tab: string, message: string): void {
        const errorEl = document.getElementById(`${tab}Error`);
        const successEl = document.getElementById(`${tab}Success`);

        if (successEl) {
            successEl.textContent = message;
            successEl.style.display = 'block';
        }

        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    /**
     * Clear all notifications for a specific tab
     * @param tab - The tab identifier ('mint' or 'redeem')
     */
    clearNotifications(tab: string): void {
        const errorEl = document.getElementById(`${tab}Error`);
        const successEl = document.getElementById(`${tab}Success`);

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        }

        if (successEl) {
            successEl.style.display = 'none';
            successEl.textContent = '';
        }
    }
}