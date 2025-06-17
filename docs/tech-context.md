# Tech Context: UUSD Development Environment

## Technology Stack

### Core Technologies

#### TypeScript 5.0+
- **Purpose**: Type-safe development with comprehensive compile-time checking
- **Configuration**: Strict mode enabled with ES2022+ target for modern JavaScript features
- **Module System**: ESNext modules with bundler resolution for optimal tree-shaking
- **Usage Patterns**:
  - Interface-driven development for service contracts
  - Strict null checking to prevent runtime errors
  - Discriminated unions for type-safe error handling

#### Bun Runtime
- **Purpose**: Fast JavaScript runtime and package manager
- **Key Features**:
  - Native TypeScript execution without compilation step
  - Built-in `.env` file loading (no dotenv required)
  - Fast bundling and hot-reload for development
- **Commands**:
  ```bash
  bun install           # Install dependencies
  bun run dev          # Development with hot-reload
  bun run build        # Production build
  bun run app.ts       # Direct TypeScript execution
  ```

#### Viem 2.31+
- **Purpose**: Type-safe Ethereum library for Web3 interactions
- **Key Advantages**:
  - First-class TypeScript support with contract type inference
  - Tree-shakable modular architecture
  - Built-in error handling for common Web3 issues
  - Comprehensive ABI type generation
- **Usage Patterns**:
  ```typescript
  // Type-safe contract interactions
  const result = await publicClient.readContract({
    address: ADDRESSES.DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'mintDollar',
    args: [collateralIndex, amount, minOut, maxIn, maxGov, isOneToOne]
  });
  ```

### Build System

#### esbuild
- **Purpose**: Fast JavaScript bundler for production builds
- **Configuration**:
  ```bash
  # Development build with watch
  bun run esbuild src/app.ts --bundle --outdir=build --format=esm --platform=browser --watch

  # Production build with minification
  bun run esbuild src/app.ts --bundle --outdir=build --minify --format=esm --platform=browser
  ```
- **Key Features**:
  - Sub-second rebuild times
  - Tree-shaking for minimal bundle size
  - Source map support for debugging
  - ES modules output for modern browsers

### Development Tools

#### Package Management
- **Primary**: Bun (fast installation and execution)
- **Lock File**: `bun.lock` for reproducible builds
- **Script Runner**: Built-in bun script execution

#### File Naming Conventions
- **TypeScript Files**: `kebab-case.ts` (e.g., `wallet-service.ts`)
- **Components**: `component-name.ts` suffix
- **Services**: `service-name.ts` suffix
- **Utils**: `functionality-utils.ts` suffix

## Dependencies

### Production Dependencies

#### @ubiquity-dao/permit2-rpc-client ^0.1.2
- **Purpose**: Specialized client for Permit2 gasless approvals
- **Usage**: Advanced transaction signing patterns
- **Integration**: Used in transaction service for optimized approval flows

#### viem ^2.31.2
- **Purpose**: Core blockchain interaction library
- **Features Used**:
  - Contract read/write operations
  - Wallet client management
  - Transaction status monitoring
  - Event log parsing

### Development Dependencies

#### @types/bun latest
- **Purpose**: TypeScript definitions for Bun runtime
- **Includes**: File system APIs, test runner types, WebSocket support

#### esbuild ^0.19.0
- **Purpose**: Fast bundling for development and production
- **Features**: JavaScript/TypeScript compilation, minification, tree-shaking

#### typescript ^5.0.0 (peer dependency)
- **Purpose**: TypeScript compiler and language service
- **Configuration**: Defined in `tsconfig.json` with strict settings

## Development Workflow

### Local Development Setup

1. **Environment Setup**:
   ```bash
   # Install Bun globally
   curl -fsSL https://bun.sh/install | bash

   # Clone and setup project
   git clone <repository>
   cd uusd.ubq.fi
   bun install
   ```

2. **Development Server**:
   ```bash
   # Start development with hot-reload
   bun run dev

   # This runs both:
   # - bun run build:watch (esbuild in watch mode)
   # - bun run serve (local HTTP server)
   ```

3. **Environment Variables**:
   ```bash
   # Bun automatically loads .env files
   # No manual dotenv configuration required
   INFURA_PROJECT_ID=your_infura_key
   WALLET_CONNECT_PROJECT_ID=your_walletconnect_key
   ```

### Build Process

#### Development Build
```bash
bun run build:watch
# Outputs: build/ directory with source maps
# Features: Fast rebuilds, unminified for debugging
```

#### Production Build
```bash
bun run build
# Outputs: build/ directory with minified and optimized files
# Features: Tree-shaking, minification, optimized for size
```

### Testing Strategy

#### Unit Testing (Planned)
- **Framework**: Bun's built-in test runner
- **Patterns**: Service layer mocking, pure function testing
- **Coverage**: Business logic and utility functions

#### Integration Testing (Planned)
- **Scope**: Component interactions with mocked services
- **Tools**: Custom test utilities for Web3 mocking

#### E2E Testing (Planned)
- **Framework**: Playwright or similar
- **Scope**: Full user workflows with testnet deployments

## TypeScript Configuration

### tsconfig.json Settings
```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

### Key Configuration Decisions

- **Target ESNext**: Use latest JavaScript features for modern browsers
- **Bundler Resolution**: Optimized for esbuild bundling
- **Strict Mode**: Maximum type safety and error prevention
- **No Emit**: TypeScript used only for type checking, not compilation
- **DOM Types**: Full browser API support for UI components

## Performance Considerations

### Bundle Optimization
- **Tree-shaking**: Only imported functions included in final bundle
- **Code Splitting**: Planned for future feature modules
- **Dynamic Imports**: Lazy loading for non-critical functionality

### Runtime Performance
- **Pure Functions**: Calculation utilities optimized for repeated calls
- **Memoization**: Cache expensive blockchain calls where appropriate
- **Event Debouncing**: Prevent excessive API calls from user input

### Development Speed
- **Hot Reload**: Sub-second update cycles during development
- **TypeScript**: Compile-time error catching reduces debug time
- **Bun Runtime**: Fast package installation and script execution

## Browser Compatibility

### Target Browsers
- **Chrome/Edge**: Version 90+ (ES2022 support)
- **Firefox**: Version 90+ (ES2022 support)
- **Safari**: Version 15+ (ES2022 support)

### Polyfills
- **Not Required**: Modern features only, no legacy browser support
- **BigInt**: Native support assumed for Web3 operations
- **ES Modules**: Native browser support for import/export

## Security Considerations

### Code Security
- **Type Safety**: TypeScript prevents many runtime vulnerabilities
- **Dependency Scanning**: Regular updates and vulnerability checks
- **Input Validation**: Comprehensive validation at service boundaries

### Web3 Security
- **Contract Verification**: All contract addresses and ABIs verified
- **Transaction Validation**: Comprehensive parameter checking
- **Error Handling**: Secure error messages without sensitive data exposure

## Deployment Constraints

### Build Requirements
- **Node.js**: Not required (Bun handles all JavaScript execution)
- **Dependencies**: Must be installable via Bun package manager
- **Output**: Build directory with bundled files and `index.html`

### Production Environment
- **Static Hosting**: Application deployable to any static file host
- **CDN Compatible**: All assets cacheable and CDN-friendly
- **HTTPS Required**: Web3 wallet connections require secure context

## Migration Considerations

### From Current Monolith
- **Incremental**: Can refactor modules one at a time
- **Compatibility**: New architecture must maintain current functionality
- **Testing**: Each extracted module must be testable in isolation

### Future Scaling
- **Modular Growth**: New features added as separate modules
- **Performance**: Module boundaries designed for optimal bundle splitting
- **Maintenance**: Clear separation enables independent module updates