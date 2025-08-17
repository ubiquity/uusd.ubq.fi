/**
 * Oracle monitoring utilities for UUSD application
 */

export interface OracleStatus {
  isStale: boolean;
  lastUpdate?: number;
  staleness?: number;
  estimatedRefreshTime?: string;
}

/**
 * Analyzes oracle-related error messages and provides user guidance
 */
export function analyzeOracleError(errorMessage: string): {
  isOracleIssue: boolean;
  userMessage: string;
  suggestions: string[];
} {
  const message = errorMessage.toLowerCase();

  if (message.includes("stale stable/usd data") || (message.includes("stale") && message.includes("data"))) {
    return {
      isOracleIssue: true,
      userMessage: "💡 Oracle Price Feed Issue Detected",
      suggestions: [
        "⏰ The LUSD price oracle is temporarily outdated",
        "🔄 This typically resolves within 1-6 hours automatically",
        "🏦 Oracle keepers will update the price feed soon",
        "💰 Consider using a different collateral type if available",
        "📊 Try again in 30-60 minutes for the best results",
        "🌐 This is a network-wide issue, not specific to this app",
      ],
    };
  }

  return {
    isOracleIssue: false,
    userMessage: errorMessage,
    suggestions: [],
  };
}

/**
 * Estimates when oracle might refresh based on typical patterns
 */
export function getOracleRefreshEstimate(): string {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);

  return `Usually within 1-6 hours. Next likely update: ${nextHour.toLocaleTimeString()}`;
}

/**
 * Provides alternative actions when oracles are stale
 */
export function getAlternativeActions(): string[] {
  return [
    "🔍 Check if other collateral types (like ETH) are available",
    "📈 Monitor oracle status on Chainlink Data Feeds website",
    "⏰ Set a reminder to try again in 1-2 hours",
    "🗨️ Join Ubiquity Discord for real-time updates on oracle status",
    "📱 Consider using the protocol when oracle feeds are fresh",
  ];
}
