import { createPublicClient, http, parseUnits } from "viem";
import { getAllCollaterals, getCollateralInformation } from "./faucet";
import { allowanceButton, collateralInput, collateralSelect, dollarInput, governanceCheckBox, governanceInput, mintButton } from "./ui";
import { mainnet } from "viem/chains";
import { getAllowance, getTokenDecimals } from "./erc20";
import { getConnectedClient } from "./connect-wallet";
import { uFaucetAddress } from "./constants";

let selectedCollateralIndex = 0;
let dollarAmount = 0;
let maxCollateralIn = 0;
let maxGovernanceIn = 0;
let isOneToOne = false;

const collateralRecord: Record<string | number, `0x${string}`> = {};

(() => {
  setInterval(() => {
    if (mintButton !== null) {
      mintButton.disabled =
        dollarAmount <= 0 || maxCollateralIn <= 0 || (!isOneToOne && maxGovernanceIn <= 0) || typeof collateralRecord[selectedCollateralIndex] === "undefined";
    }

    if (allowanceButton !== null) {
      allowanceButton.disabled = typeof collateralRecord[selectedCollateralIndex] === "undefined" || maxCollateralIn <= 0;
    }
  }, 500);
})();

void (async () => {
  const pubClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  });

  pubClient.watchBlocks({
    onBlock: async () => {
      try {
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const web3Client = getConnectedClient();

        if (allowanceButton !== null) allowanceButton.disabled = web3Client === null || !collateralAddress || !web3Client.account;
        if (mintButton !== null) mintButton.disabled = web3Client === null || !collateralAddress || !web3Client.account;

        if (collateralAddress && web3Client && web3Client.account) {
          await check(collateralAddress, web3Client);
        }
      } catch (error) {
        // Do something
      }
    },
  });
})();

async function check(collateralAddress: `0x${string}`, web3Client: ReturnType<typeof getConnectedClient>) {
  const decimals = await getTokenDecimals(collateralAddress);
  const maxCollatIn = parseUnits(maxCollateralIn.toString(), decimals);
  const allowance = web3Client?.account ? await getAllowance(collateralAddress, web3Client.account.address, uFaucetAddress) : BigInt(0);
  const isAllowed = Number(allowance) >= Number(maxCollatIn);

  if (isAllowed) {
    if (mintButton !== null && mintButton.classList.contains("hidden")) {
      mintButton.classList.remove("hidden");
      mintButton.classList.add("flex");
    }
    if (allowanceButton !== null && !allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.add("hidden");
      allowanceButton.classList.remove("flex");
    }
  } else {
    if (mintButton !== null && !mintButton.classList.contains("hidden")) {
      mintButton.classList.add("hidden");
      mintButton.classList.remove("flex");
    }
    if (allowanceButton !== null && allowanceButton.classList.contains("hidden")) {
      allowanceButton.classList.remove("hidden");
      allowanceButton.classList.add("flex");
    }
  }
}

export async function initCollateralList() {
  if (collateralSelect !== null) {
    const collaterals = await getAllCollaterals();
    const collateralInformation = await Promise.all(collaterals.map(getCollateralInformation));

    collateralInformation.forEach((info) => {
      collateralRecord[Number(info.index)] = info.collateralAddress;
    });

    const options = collateralInformation.map((info) => {
      const option = document.createElement("option");

      option.value = String(info.index);
      option.innerText = info.symbol;

      return option;
    });

    options.forEach((option) => {
      collateralSelect.appendChild(option);
    });
  }
}

export async function initUiEvents() {
  if (collateralSelect !== null) {
    collateralSelect.addEventListener("change", (ev) => {
      selectedCollateralIndex = Number((ev.target as HTMLSelectElement).value);
    });
  }

  if (governanceCheckBox !== null) {
    governanceCheckBox.addEventListener("click", (ev) => {
      setTimeout(() => {
        isOneToOne = !(ev.target as HTMLInputElement).checked;

        if (governanceInput !== null) {
          if (isOneToOne) governanceInput.classList.add("hidden");
          else governanceInput.classList.remove("hidden");
        }
      }, 500);
    });
  }

  if (governanceInput !== null) {
    governanceInput.addEventListener("change", (ev) => {
      maxGovernanceIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (dollarInput !== null) {
    dollarInput.addEventListener("change", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (collateralInput !== null) {
    collateralInput.addEventListener("change", (ev) => {
      maxCollateralIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }
}
