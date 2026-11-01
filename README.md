# UUSD DeFi Application

A decentralized stablecoin platform enabling users to mint and redeem UUSD (Ubiquity Dollar) tokens using various collateral types. Built with a modular TypeScript architecture for maintainability and scalability.

## Overview

UUSD is a decentralized stablecoin backed by multiple collateral types and governance tokens (UBQ). The platform provides:

- **Multi-Collateral Minting**: Create UUSD using various accepted collateral types
- **Flexible Redemption**: Redeem UUSD for underlying collateral assets
- **Dynamic Pricing**: Real-time calculations based on market conditions and collateral ratios
- **Governance Integration**: UBQ token participation in stability mechanisms
- **Web3 Wallet Support**: Seamless integration with MetaMask and other Web3 wallets

## Quick Start

### Prerequisites

- [Deno](https://deno.com/) 2.x
- Web3 wallet (MetaMask recommended)
- Ethereum mainnet access

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd uusd.ubq.fi

# Install dependencies
deno install
```

### Development

```bash
# Start development server with hot reload
deno task build:watch & deno task serve:dev

# The app will be available at http://localhost:3000
```

### Production Build

```bash
# Build optimized production bundle
deno task build

# Serve production build
deno task serve
```

## Development Scripts

```bash
# Development with hot reload
deno task build:watch & deno task serve:dev

# Production build
deno task build

# Watch mode for development
deno task build:watch

# Start local server
deno task serve

# Development server
deno task serve:dev

# Diamond contract utility
bun run diamond
```

## Savings Account Preview

The **Savings Account** view previews a proposed single-asset LUSD deposit into a
Uniswap v4 UUSD/LUSD strategy targeting 0.9999–1.0001 LUSD per UUSD. It is separate
from the existing buy/sell flow and does not submit transactions or request token
approvals. Deposits remain disabled: this repository has no deployed v4 pool or
integrated savings strategy to accept funds. Production deposits require that
integration, including swap/liquidity execution, slippage protection, position
management and withdrawals.

APR is deliberately shown as unavailable. Concentrated liquidity alone does not
multiply pool fee revenue; a live estimate must use actual volume, fees, active
liquidity and time in range, accounting for costs. Returns are not guaranteed,
and this is not an insured bank account.

Run the offline preview tests with `bun test ./tools/test-savings-account.test.ts`.

## License

This project is part of the Ubiquity ecosystem. See LICENSE file for details.

## Links

- [Ubiquity DAO](https://ubq.fi/)
- [UUSD Documentation](https://docs.ubq.fi/)
- [Smart Contracts](./contracts/)
