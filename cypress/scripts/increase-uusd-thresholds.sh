#!/bin/bash

# constants
ANVIL_RPC=http://localhost:8545
DIAMOND="0xED3084c98148e2528DaDCB53C56352e549C488fA"

# may be changed depending on environment
ADMIN_WALLET=0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd

# enable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount true

# owner sets (for ease of QA):
# 1. `mintPriceThreshold = 0` (allows minting anytime)
# 2. `redeemPriceThreshold = 100_000_000` (100$, allows redeeming when UUSD < 100$)
cast send --rpc-url $ANVIL_RPC $DIAMOND --unlocked --from $ADMIN_WALLET "setPriceThresholds(uint256,uint256)" 0 100000000

# disable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount false
