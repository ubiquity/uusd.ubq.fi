#!/bin/bash

# constants
ANVIL_RPC=http://localhost:8545
LUSD=0x5f98805A4E8be255a32880FDeC7F6728C6568bA0

# may be changed depending on environment
WHALE_WALLET=0x24cbbef882a77c5aaa9abd6558e68b4c648453c5
BENEFICIARY_WALLET=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# enable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount true

# WHALE_WALLET sends 10k LUSD to BENEFICIARY_WALLET
cast send --rpc-url $ANVIL_RPC $LUSD --unlocked --from $WHALE_WALLET "transfer(address,uint256)(bool)" $BENEFICIARY_WALLET 10000000000000000000000

# disable auto impersonating
cast rpc --rpc-url $ANVIL_RPC anvil_autoImpersonateAccount false

#==========
# Assert
#==========

# enable debug mode
set -x
# check BENEFICIARY_WALLET balance
cast call --rpc-url $ANVIL_RPC $LUSD "balanceOf(address)(uint256)" $BENEFICIARY_WALLET
