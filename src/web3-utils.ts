import { ethers } from "ethers";
import { backendSigner, userSigner } from "./main";
import { backendAddress } from "./constants";

export async function mintToken(tokenAddress: string) {
  const erc20ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];

  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, backendSigner);
    const tx = await tokenContract.transfer(backendAddress, ethers.utils.parseUnits("100000", 18)); // Mint 100000 token
    console.log("Mint transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("Mint transaction confirmed:", receipt);
  } catch (error) {
    console.error("Minting failed:", error);
  }
}

export async function approve(tokenAddress: string, spender: string, amount: string, signer: ethers.Signer) {
  const erc20ABI = ["function approve(address spender, uint256 amount) public returns (bool)"];

  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);
    const tx = await tokenContract.approve(spender, amount);
    console.log("Approve transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("Approve transaction confirmed:", receipt);
  } catch (error) {
    console.error("Approval failed:", error);
  }
}

export async function balanceOf(tokenAddress: string, account: string, signer: ethers.Signer) {
  const erc20ABI = ["function balanceOf(address account) public view returns (uint256)"];

  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);
    const balance = await tokenContract.balanceOf(account);
    console.log(`Balance of ${account}:`, ethers.utils.formatUnits(balance, 18));
    return balance;
  } catch (error) {
    console.error("Fetching balance failed:", error);
    throw error;
  }
}
