export const ufaucetAbi = [
  {
    inputs: [{ internalType: "address", name: "amoMinterAddress", type: "address" }],
    name: "addAmoMinter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "collateralAddress", type: "address" },
      { internalType: "address", name: "chainLinkPriceFeedAddress", type: "address" },
      { internalType: "uint256", name: "poolCeiling", type: "uint256" },
    ],
    name: "addCollateralToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "allCollaterals", outputs: [{ internalType: "address[]", name: "", type: "address[]" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ internalType: "uint256", name: "collateralAmount", type: "uint256" }],
    name: "amoMinterBorrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "collateralAddress", type: "address" }],
    name: "collateralInformation",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "index", type: "uint256" },
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "address", name: "collateralAddress", type: "address" },
          { internalType: "address", name: "collateralPriceFeedAddress", type: "address" },
          { internalType: "uint256", name: "collateralPriceFeedStalenessThreshold", type: "uint256" },
          { internalType: "bool", name: "isEnabled", type: "bool" },
          { internalType: "uint256", name: "missingDecimals", type: "uint256" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "uint256", name: "poolCeiling", type: "uint256" },
          { internalType: "bool", name: "isMintPaused", type: "bool" },
          { internalType: "bool", name: "isRedeemPaused", type: "bool" },
          { internalType: "bool", name: "isBorrowPaused", type: "bool" },
          { internalType: "uint256", name: "mintingFee", type: "uint256" },
          { internalType: "uint256", name: "redemptionFee", type: "uint256" },
        ],
        internalType: "struct LibUbiquityPool.CollateralInformation",
        name: "returnData",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "collateralRatio", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [],
    name: "collateralUsdBalance",
    outputs: [{ internalType: "uint256", name: "balanceTally", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "collateralIndex", type: "uint256" }],
    name: "collectRedemption",
    outputs: [
      { internalType: "uint256", name: "governanceAmount", type: "uint256" },
      { internalType: "uint256", name: "collateralAmount", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "ethUsdPriceFeedInformation",
    outputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "collateralIndex", type: "uint256" }],
    name: "freeCollateralBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint256", name: "dollarAmount", type: "uint256" },
    ],
    name: "getDollarInCollateral",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getDollarPriceUsd",
    outputs: [{ internalType: "uint256", name: "dollarPriceUsd", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getGovernancePriceUsd",
    outputs: [{ internalType: "uint256", name: "governancePriceUsd", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "userAddress", type: "address" },
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
    ],
    name: "getRedeemCollateralBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "userAddress", type: "address" }],
    name: "getRedeemGovernanceBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "governanceEthPoolAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint256", name: "dollarAmount", type: "uint256" },
      { internalType: "uint256", name: "dollarOutMin", type: "uint256" },
      { internalType: "uint256", name: "maxCollateralIn", type: "uint256" },
      { internalType: "uint256", name: "maxGovernanceIn", type: "uint256" },
      { internalType: "bool", name: "isOneToOne", type: "bool" },
    ],
    name: "mintDollar",
    outputs: [
      { internalType: "uint256", name: "totalDollarMint", type: "uint256" },
      { internalType: "uint256", name: "collateralNeeded", type: "uint256" },
      { internalType: "uint256", name: "governanceNeeded", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint256", name: "dollarAmount", type: "uint256" },
      { internalType: "uint256", name: "governanceOutMin", type: "uint256" },
      { internalType: "uint256", name: "collateralOutMin", type: "uint256" },
    ],
    name: "redeemDollar",
    outputs: [
      { internalType: "uint256", name: "collateralOut", type: "uint256" },
      { internalType: "uint256", name: "governanceOut", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "amoMinterAddress", type: "address" }],
    name: "removeAmoMinter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "collateralAddress", type: "address" },
      { internalType: "address", name: "chainLinkPriceFeedAddress", type: "address" },
      { internalType: "uint256", name: "stalenessThreshold", type: "uint256" },
    ],
    name: "setCollateralChainLinkPriceFeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newCollateralRatio", type: "uint256" }],
    name: "setCollateralRatio",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "newPriceFeedAddress", type: "address" },
      { internalType: "uint256", name: "newStalenessThreshold", type: "uint256" },
    ],
    name: "setEthUsdChainLinkPriceFeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint256", name: "newMintFee", type: "uint256" },
      { internalType: "uint256", name: "newRedeemFee", type: "uint256" },
    ],
    name: "setFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newGovernanceEthPoolAddress", type: "address" }],
    name: "setGovernanceEthPoolAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint256", name: "newCeiling", type: "uint256" },
    ],
    name: "setPoolCeiling",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "newMintPriceThreshold", type: "uint256" },
      { internalType: "uint256", name: "newRedeemPriceThreshold", type: "uint256" },
    ],
    name: "setPriceThresholds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newRedemptionDelayBlocks", type: "uint256" }],
    name: "setRedemptionDelayBlocks",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "newPriceFeedAddress", type: "address" },
      { internalType: "uint256", name: "newStalenessThreshold", type: "uint256" },
    ],
    name: "setStableUsdChainLinkPriceFeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "stableUsdPriceFeedInformation",
    outputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "collateralIndex", type: "uint256" }],
    name: "toggleCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "collateralIndex", type: "uint256" },
      { internalType: "uint8", name: "toggleIndex", type: "uint8" },
    ],
    name: "toggleMintRedeemBorrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "collateralIndex", type: "uint256" }],
    name: "updateChainLinkCollateralPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const erc20Abi = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_spender",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_from",
        type: "address",
      },
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "_owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        name: "balance",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "_owner",
        type: "address",
      },
      {
        name: "_spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    payable: true,
    stateMutability: "payable",
    type: "fallback",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;

export const diamondAddress = "0xED3084c98148e2528DaDCB53C56352e549C488fA";
