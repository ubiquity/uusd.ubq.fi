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

### Wallet connection configuration

Create an AppKit project in Reown Cloud and configure its allowed origins for your
production and preview domains. Supply the **public** project ID at build time:

```bash
NEXT_PUBLIC_PROJECT_ID=your-reown-project-id deno task build
# Use the same environment variable with deno task build:watch during development.
```

The build embeds only this public identifier, not the rest of the environment.
Never supply wallet private keys or seed phrases. Without a project ID, read-only
views remain available and connecting displays a configuration error.

This application uses vanilla TypeScript, so AppKit is initialized once through
its JavaScript API with `WagmiAdapter`, rather than adding a React provider tree.
Connect Wallet opens AppKit for WalletConnect, injected and discovered EVM wallets.
Manage Wallet opens account/network management; Disconnect terminates the connector
session. Ethereum, Gnosis and Arbitrum are available in AppKit, but UUSD trading is
restricted to Ethereum Mainnet to avoid submitting to mainnet addresses on another
chain. Wallet approval and signing continue through the selected connector's viem
client, never through a hard-coded browser extension.

Deployment builds must receive `NEXT_PUBLIC_PROJECT_ID` as well. For Deno Deploy,
include it in the workflows' `build_env` allowlists and configure the public ID in
the build environment. Setting it only in the serving runtime will not update the
compiled browser bundle.

Offline wallet lifecycle tests (mock connectors, no funds required):

```bash
bun test ./tools/wallet-service.test.ts
```

Before deployment, verify with a real Reown project: QR connection on a browser
without an extension; injected-wallet connection; cancel/retry; reload/reconnect;
account/network switching; disconnect/reconnect; signature rejection and approval;
and transaction approval/rejection on Ethereum. Other networks must show the
Ethereum-only error before a UUSD transaction is sent.

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

## License

This project is part of the Ubiquity ecosystem. See LICENSE file for details.

## Links

- [Ubiquity DAO](https://ubq.fi/)
- [UUSD Documentation](https://docs.ubq.fi/)
- [Smart Contracts](./contracts/)
