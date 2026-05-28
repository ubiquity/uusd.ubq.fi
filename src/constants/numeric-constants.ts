// Basis points constant (1 basis point = 0.01%)
export const BASIS_POINTS_DIVISOR = 10000n;

// Slippage constants
export const DEFAULT_SLIPPAGE_BPS = 50n; // 0.5% in basis points
export const MIN_SLIPPAGE_BPS = 10n; // 0.1% minimum
export const MAX_SLIPPAGE_BPS = 1000n; // 10% maximum
export const DEFAULT_SLIPPAGE_PERCENT = 0.005; // 0.5% as decimal

/**
 * Maximum button: reserve amount to keep for gas when using "Max".
 * ~0.01 ETH equivalent reserved for gas costs.
 */
export const MAX_BUTTON_GAS_RESERVE = 10000000000000000n; // 0.01 ETH in wei
