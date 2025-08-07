# Tech Context: uusd.ubq.fi

## Technologies Used:

-   **Solidity:** The primary language for writing smart contracts.
-   **Foundry:** A blazing fast, portable, and modular toolkit for Ethereum application development written in Rust. Used for compiling, testing, and deploying smart contracts.
-   **TypeScript:** Used extensively for the frontend dapp (`contracts/packages/dapp`) and various utility scripts (`src/`, `tools/`, `contracts/utils`). Provides static typing for improved code quality and maintainability.
-   **Next.js:** A React framework for building server-side rendered and static web applications. Used for the `contracts/packages/dapp` frontend.
-   **React:** A JavaScript library for building user interfaces, forming the core of the Next.js dapp.
-   **Bun:** A fast all-in-one JavaScript runtime, bundler, transpiler, and package manager. Used for managing dependencies and running scripts across the monorepo.

## Development Setup:

-   **Local Blockchain (Anvil):** For local development and testing of smart contracts, Anvil (part of Foundry) is used to spin up a local Ethereum development blockchain.
-   **Environment Variables:** Configuration for contract addresses, API keys, and other sensitive information is managed through `.env` files (e.g., `contracts/.env.example`, `contracts/packages/contracts/.env.example`, `contracts/packages/dapp/.env.example`).
-   **Testing Frameworks:**
    -   **Foundry (Forge):** For Solidity smart contract testing (unit, integration, fuzz, invariant tests).

## Technical Constraints:

-   **EVM Compatibility:** Smart contracts are designed for the Ethereum Virtual Machine (EVM) and are compatible with various EVM-compatible blockchains.
-   **Gas Optimization:** Smart contracts are developed with gas efficiency in mind to minimize transaction costs for users.
-   **Security:** Adherence to best practices for smart contract security, including reentrancy guards, access control, and thorough auditing (as indicated by `ubiquity-audit-report-sherlock.pdf`).

## Dependencies:

-   **OpenZeppelin Contracts:** Widely used library for secure smart contract development (e.g., ERC20, Ownable, UUPSUpgradeable).
-   **Uniswap V2/V3:** Libraries for interacting with Uniswap decentralized exchanges for liquidity provision and price oracle functionalities.
-   **Aave V3 Core/Periphery:** Libraries for interacting with the Aave lending protocol, potentially for AMO strategies.
-   **Chainlink:** Potentially used for decentralized oracles, though not explicitly detailed in the file list.
