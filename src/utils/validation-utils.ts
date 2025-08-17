import type { Address } from "viem";
import { parseUnits } from "viem";

/**
 * Interface for input validation results
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Pure function to validate mint form inputs
 */
export function validateMintInputs(amount: string, collateralIndex: string): ValidationResult {
  if (!amount || amount.trim() === "") {
    return { isValid: false, error: "Amount is required" };
  }

  if (!collateralIndex || collateralIndex.trim() === "") {
    return { isValid: false, error: "Collateral selection is required" };
  }

  if (!/^\d*\.?\d*$/.test(amount) || amount === "." || amount === "") {
    return { isValid: false, error: "Amount must be a positive number" };
  }

  try {
    const parsedAmount = parseUnits(amount, 18);
    if (parsedAmount <= 0n) {
      return { isValid: false, error: "Amount must be a positive number" };
    }
  } catch {
    return { isValid: false, error: "Amount must be a positive number" };
  }

  return { isValid: true };
}

/**
 * Pure function to validate redeem form inputs
 */
export function validateRedeemInputs(amount: string, collateralIndex: string): ValidationResult {
  if (!amount || amount.trim() === "") {
    return { isValid: false, error: "Amount is required" };
  }

  if (!collateralIndex || collateralIndex.trim() === "") {
    return { isValid: false, error: "Collateral selection is required" };
  }

  if (!/^\d*\.?\d*$/.test(amount) || amount === "." || amount === "") {
    return { isValid: false, error: "Amount must be a positive number" };
  }

  try {
    const parsedAmount = parseUnits(amount, 18);
    if (parsedAmount <= 0n) {
      return { isValid: false, error: "Amount must be a positive number" };
    }
  } catch {
    return { isValid: false, error: "Amount must be a positive number" };
  }

  return { isValid: true };
}

/**
 * Pure function to validate wallet connection state
 */
export function validateWalletConnection(account: Address | null): ValidationResult {
  if (!account) {
    return { isValid: false, error: "Please connect wallet first" };
  }

  return { isValid: true };
}

/**
 * Pure function to validate Ethereum address format
 */
export function validateAddress(address: string): ValidationResult {
  if (!address || address.trim() === "") {
    return { isValid: false, error: "Address is required" };
  }

  // Basic Ethereum address validation (0x followed by 40 hex characters)
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!addressRegex.test(address)) {
    return { isValid: false, error: "Invalid Ethereum address format" };
  }

  return { isValid: true };
}

/**
 * Pure function to validate numeric input string
 */
export function validateNumericInput(input: string, fieldName: string = "Value"): ValidationResult {
  if (!input || input.trim() === "") {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (!/^\d*\.?\d*$/.test(input) || input === "." || input === "") {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  try {
    const parsedValue = parseUnits(input, 18);
    if (parsedValue < 0n) {
      return { isValid: false, error: `${fieldName} cannot be negative` };
    }
  } catch {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }

  return { isValid: true };
}

/**
 * Pure function to validate BigInt amount is greater than zero
 */
export function validatePositiveBigInt(amount: bigint, fieldName: string = "Amount"): ValidationResult {
  if (amount <= 0n) {
    return { isValid: false, error: `${fieldName} must be greater than zero` };
  }

  return { isValid: true };
}

/**
 * Pure function to validate collateral index selection
 */
export function validateCollateralSelection(collateralIndex: string): ValidationResult {
  if (!collateralIndex || collateralIndex.trim() === "") {
    return { isValid: false, error: "Please select a collateral type" };
  }

  const index = parseInt(collateralIndex);
  if (isNaN(index) || index < 0) {
    return { isValid: false, error: "Invalid collateral selection" };
  }

  return { isValid: true };
}

/**
 * Pure function to check if input indicates empty form state
 */
export function isEmptyFormState(amount: string, collateralIndex: string): boolean {
  return !amount || !collateralIndex;
}

/**
 * Pure function to validate transaction parameters
 */
export function validateTransactionParams(amount: bigint, collateralIndex: number, account: Address | null): ValidationResult {
  const walletValidation = validateWalletConnection(account);
  if (!walletValidation.isValid) {
    return walletValidation;
  }

  const amountValidation = validatePositiveBigInt(amount, "Transaction amount");
  if (!amountValidation.isValid) {
    return amountValidation;
  }

  if (collateralIndex < 0) {
    return { isValid: false, error: "Invalid collateral index" };
  }

  return { isValid: true };
}
