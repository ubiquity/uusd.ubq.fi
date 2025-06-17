/// <reference lib="dom" />
import { analyzeOracleError, getAlternativeActions, getOracleRefreshEstimate } from '../utils/oracle-utils.ts';

/**
 * Oracle Status Component
 * Displays information about oracle feeds and provides guidance when oracles are stale
 */
export class OracleStatusComponent {
    private container: HTMLElement;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId) || document.body;
        this.render();
    }

    /**
     * Renders the oracle status component
     */
    private render(): void {
        this.container.innerHTML = `
            <div class="oracle-status-panel" style="display: none;">
                <div class="oracle-header">
                    <h3>🔗 Oracle Status Information</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.style.display='none'">×</button>
                </div>
                <div class="oracle-content">
                    <div class="oracle-feeds">
                        <h4>📊 Price Feed Dependencies:</h4>
                        <ul>
                            <li><span class="feed-name">LUSD/USD</span> - <span class="feed-status unknown">Checking...</span></li>
                            <li><span class="feed-name">Stable/USD</span> - <span class="feed-status unknown">Checking...</span></li>
                            <li><span class="feed-name">ETH/USD</span> - <span class="feed-status unknown">Checking...</span></li>
                        </ul>
                    </div>

                    <div class="oracle-explanation">
                        <h4>💡 Understanding Oracle Issues:</h4>
                        <p>The UUSD protocol relies on Chainlink price oracles to ensure accurate token pricing. When oracles become "stale" (outdated), transactions are temporarily blocked to protect users from incorrect pricing.</p>

                        <h4>⏰ Typical Resolution Time:</h4>
                        <p id="refresh-estimate">${getOracleRefreshEstimate()}</p>
                    </div>

                    <div class="oracle-actions">
                        <h4>🔧 What You Can Do:</h4>
                        <ul id="alternative-actions">
                            ${getAlternativeActions().map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="oracle-resources">
                        <h4>📚 Helpful Resources:</h4>
                        <ul>
                            <li><a href="https://data.chain.link/" target="_blank">📈 Chainlink Data Feeds</a></li>
                            <li><a href="https://discord.gg/ubiquity" target="_blank">💬 Ubiquity Discord</a></li>
                            <li><a href="https://docs.ubq.fi/" target="_blank">📖 Ubiquity Documentation</a></li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();
    }

    /**
     * Shows oracle status information with specific error details
     */
    public showOracleInfo(errorMessage?: string): void {
        const panel = this.container.querySelector('.oracle-status-panel') as HTMLElement;

        if (errorMessage) {
            const analysis = analyzeOracleError(errorMessage);
            if (analysis.isOracleIssue) {
                this.updateWithErrorAnalysis(analysis);
            }
        }

        panel.style.display = 'block';
    }

    /**
     * Updates the panel with specific error analysis
     */
    private updateWithErrorAnalysis(analysis: { userMessage: string; suggestions: string[] }): void {
        const contentDiv = this.container.querySelector('.oracle-content') as HTMLElement;

        // Add error-specific information at the top
        const errorSection = document.createElement('div');
        errorSection.className = 'oracle-error-details';
        errorSection.innerHTML = `
            <div class="error-alert">
                <h4 style="color: #dc3545; margin: 0 0 10px 0;">${analysis.userMessage}</h4>
                <ul style="margin: 0; padding-left: 20px;">
                    ${analysis.suggestions.map(suggestion => `<li style="margin-bottom: 5px;">${suggestion}</li>`).join('')}
                </ul>
            </div>
        `;

        contentDiv.insertBefore(errorSection, contentDiv.firstChild);
    }

    /**
     * Adds CSS styles for the oracle status component
     */
    private addStyles(): void {
        if (document.getElementById('oracle-status-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'oracle-status-styles';
        styles.textContent = `
            .oracle-status-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 2px solid #007bff;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                z-index: 1000;
                font-family: Arial, sans-serif;
            }

            .oracle-header {
                background: #007bff;
                color: white;
                padding: 15px 20px;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .oracle-header h3 {
                margin: 0;
                font-size: 1.2em;
            }

            .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .close-btn:hover {
                background: rgba(255,255,255,0.2);
            }

            .oracle-content {
                padding: 20px;
            }

            .oracle-content h4 {
                color: #333;
                margin: 20px 0 10px 0;
                font-size: 1.1em;
            }

            .oracle-content h4:first-child {
                margin-top: 0;
            }

            .oracle-feeds ul,
            .oracle-actions ul,
            .oracle-resources ul {
                margin: 10px 0;
                padding-left: 20px;
            }

            .oracle-feeds li {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                padding: 5px;
                background: #f8f9fa;
                border-radius: 4px;
            }

            .feed-name {
                font-weight: bold;
            }

            .feed-status {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.9em;
                font-weight: bold;
            }

            .feed-status.unknown {
                background: #6c757d;
                color: white;
            }

            .feed-status.healthy {
                background: #28a745;
                color: white;
            }

            .feed-status.stale {
                background: #dc3545;
                color: white;
            }

            .oracle-explanation p,
            .oracle-actions p {
                margin: 10px 0;
                line-height: 1.5;
                color: #555;
            }

            .oracle-resources a {
                color: #007bff;
                text-decoration: none;
            }

            .oracle-resources a:hover {
                text-decoration: underline;
            }

            .error-alert {
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 5px;
                padding: 15px;
                margin-bottom: 20px;
            }

            .error-alert ul {
                margin: 10px 0 0 0;
            }

            .error-alert li {
                margin-bottom: 5px;
                color: #721c24;
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Creates a help button that shows oracle information
     */
    public static createHelpButton(targetId: string): HTMLElement {
        const button = document.createElement('button');
        button.innerHTML = '🔗 Oracle Info';
        button.className = 'oracle-help-btn';
        button.style.cssText = `
            background: #17a2b8;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            margin: 5px;
        `;

        button.addEventListener('click', () => {
            const oracleStatus = new OracleStatusComponent(targetId);
            oracleStatus.showOracleInfo();
        });

        return button;
    }
}
