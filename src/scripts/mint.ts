import { createPublicClient, http, parseUnits } from "viem";
import { getAllCollaterals, getCollateralInformation, mintDollar } from "./faucet";
import { allowanceButton, collateralInput, collateralSelect, dollarInput, governanceCheckBox, governanceFormControl, governanceInput, mintButton } from "./ui";
import { mainnet } from "viem/chains";
import { approveToSpend, getAllowance, getTokenDecimals } from "./erc20";
import { getConnectedClient } from "./connect-wallet";
import { diamondAddress } from "./constants";
import { ToastActions } from "./toast";

let selectedCollateralIndex = 0;
let dollarAmount = 0;
let maxCollateralIn = 0;
let maxGovernanceIn = 0;
let isOneToOne = false;

const collateralRecord: Record<string | number, `0x${string}`> = {};
const toastActions = new ToastActions();
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

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
  publicClient.watchBlocks({
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
        const err = error as Error;
        toastActions.showToast({
          toastType: "error",
          msg: err.message,
        });
      }
    },
  });
})();

async function check(collateralAddress: `0x${string}`, web3Client: ReturnType<typeof getConnectedClient>) {
  const decimals = await getTokenDecimals(collateralAddress);
  const maxCollatIn = parseUnits(maxCollateralIn.toString(), decimals);
  const allowance = web3Client?.account ? await getAllowance(collateralAddress, web3Client.account.address, diamondAddress) : BigInt(0);
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

        if (governanceFormControl !== null) {
          if (isOneToOne) governanceFormControl.classList.add("hidden");
          else governanceFormControl.classList.remove("hidden");
        }
      }, 500);
    });
  }

  if (governanceInput !== null) {
    governanceInput.addEventListener("input", (ev) => {
      maxGovernanceIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (dollarInput !== null) {
    dollarInput.addEventListener("input", (ev) => {
      dollarAmount = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (collateralInput !== null) {
    collateralInput.addEventListener("input", (ev) => {
      maxCollateralIn = Number((ev.target as HTMLInputElement).value || "0");
    });
  }

  if (allowanceButton !== null) {
    allowanceButton.addEventListener("click", async () => {
      try {
        allowanceButton.disabled = true;
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const decimals = await getTokenDecimals(collateralAddress);
        const allowedToSpend = parseUnits(maxCollateralIn.toString(), decimals);
        const txHash = await approveToSpend(collateralAddress, diamondAddress, allowedToSpend);
        allowanceButton.disabled = false;
        toastActions.showToast({
          toastType: "success",
          msg: `Successfully approved: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
        });
      } catch (error) {
        const err = error as Error;
        toastActions.showToast({
          toastType: "error",
          msg: err.name,
        });
      }
    });
  }

  if (mintButton !== null) {
    mintButton.addEventListener("click", async () => {
      try {
        mintButton.disabled = true;
        const collateralAddress = collateralRecord[selectedCollateralIndex];
        const decimals = await getTokenDecimals(collateralAddress);
        const allowedToSpend = parseUnits(maxCollateralIn.toString(), decimals);
        const dollarAmountBi = parseUnits(dollarAmount.toString(), 18);
        const governanceBi = parseUnits(maxGovernanceIn.toString(), 18);
        const txHash = await mintDollar(BigInt(selectedCollateralIndex), dollarAmountBi, allowedToSpend, governanceBi, isOneToOne);
        mintButton.disabled = false;
        toastActions.showToast({
          toastType: "success",
          msg: `Successfully minted: <a href="https://etherscan.io/tx/${txHash}" target="_blank">View on explorer</a>`,
        });
      } catch (error) {
        mintButton.disabled = false;
        const err = error as Error;
        toastActions.showToast({
          toastType: "error",
          msg: err.name,
        });
      }
    });
  }
}
