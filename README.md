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

- [Bun](https://bun.sh) runtime (v1.2.2+)
- Web3 wallet (MetaMask recommended)
- Ethereum mainnet access

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd uusd.ubq.fi

# Install dependencies
bun install
```

### Development

```bash
# Start development server with hot reload
bun run dev

# The app will be available at http://localhost:3000
```

### Production Build

```bash
# Build optimized production bundle
bun run build

# Serve production build
bun run serve
```

## Development Scripts

```bash
# Development with hot reload
bun run dev

# Production build
bun run build

# Watch mode for development
bun run build:watch

# Start local server
bun run serve

# Development server
bun run serve:dev

# Diamond contract utility
bun run diamond
```

## License

This project is part of the Ubiquity ecosystem. See LICENSE file for details.

## Links

- [Ubiquity DAO](https://ubq.fi/)
- [UUSD Documentation](https://docs.ubq.fi/)
- [Smart Contracts](./contracts/)
