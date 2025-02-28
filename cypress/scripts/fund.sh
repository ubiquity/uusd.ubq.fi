#!/bin/bash

# constants
ANVIL_RPC=http://localhost:8545
LUSD=0x5f98805A4E8be255a32880FDeC7F6728C6568bA0
UBQ=0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0

# may be changed depending on environment
WHALE_WALLET_LUSD=0x24cbbef882a77c5aaa9abd6558e68b4c648453c5
WHALE_WALLET_UBQ=0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd
BENEFICIARY_WALLET=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# enable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount true

# WHALE_WALLET_LUSD sends 10k LUSD to BENEFICIARY_WALLET
cast send --rpc-url $ANVIL_RPC $LUSD --unlocked --from $WHALE_WALLET_LUSD "transfer(address,uint256)(bool)" $BENEFICIARY_WALLET 10000000000000000000000

# WHALE_WALLET_UBQ sends 500k UBQ to BENEFICIARY_WALLET
cast send --rpc-url $ANVIL_RPC $UBQ --unlocked --from $WHALE_WALLET_UBQ "transfer(address,uint256)(bool)" $BENEFICIARY_WALLET 50000000000000000000000

# disable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount false

#==========
# Assert
#==========

# enable debug mode
set -x
# check BENEFICIARY_WALLET balances
cast call --rpc-url $ANVIL_RPC $LUSD "balanceOf(address)(uint256)" $BENEFICIARY_WALLET
cast call --rpc-url $ANVIL_RPC $UBQ "balanceOf(address)(uint256)" $BENEFICIARY_WALLET
