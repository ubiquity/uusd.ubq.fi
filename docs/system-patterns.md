# System Patterns: uusd.ubq.fi

## System Architecture:

-   **`contracts/packages/dapp`**: This is a Next.js application that serves as the primary user interface for interacting with the Ubiquity protocol. It consumes data from the blockchain and allows users to mint, redeem, stake, and participate in governance.
-   **`src/` (Root Level)**: This directory contains the core application logic, services, components, and utilities that power the `uusd.ubq.fi` frontend. It interacts with the smart contracts via web3 libraries.
-   **`tools/`**: Contains various utility scripts and tools for development, deployment, and interaction with the contracts and the dapp.

## Key Technical Decisions:

-   **Diamond Standard (EIP-2535):** The core Ubiquity Dollar contract is implemented using the Diamond Standard. This allows for upgradeability, modularity, and the ability to add or remove functionalities (facets) without redeploying the entire contract. This is crucial for long-term protocol evolution and maintenance.
-   **TypeScript:** The frontend application and many scripts are written in TypeScript, providing type safety and improving code maintainability.
-   **Bun:** Used as the JavaScript runtime and package manager, offering performance benefits for development and build processes.

## Design Patterns in Use:

-   **Proxy Pattern (Diamond Standard):** Enables upgradeability and modularity of smart contracts.
-   **Facet Pattern:** A core part of the Diamond Standard, where different functionalities are separated into distinct "facets" that can be added or removed from the main Diamond contract.
-   **Strategy Pattern (for AMOs):** Different AMO strategies can be implemented and integrated into the protocol to manage liquidity and maintain the peg.
-   **Service-Oriented Architecture (Frontend):** The frontend application is structured with distinct services (e.g., `contract-service`, `price-service`) to manage interactions with the blockchain and external APIs.

## Component Relationships:

-   **UUSD (Ubiquity Dollar):** The central stablecoin, managed by the Diamond contract.

-   **AMOs (Algorithmic Market Operations):** Smart contracts that interact with UUSD to manage its supply and demand in various DeFi protocols (e.g., lending pools, liquidity pools).
-   **Governance Contracts:** Manage proposals, voting, and execution of protocol upgrades and parameter changes.
-   **Frontend Dapp:** Interacts with all these smart contracts to provide a user interface for the Ubiquity Dollar ecosystem.
