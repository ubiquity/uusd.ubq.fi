import { keccak256, toHex, stringToBytes } from 'viem';

const key = "ubiquity.contracts.ubiquity.pool.storage";
const hash = keccak256(stringToBytes(key));
console.log(`Hash: ${hash}`);

const hashAsBigInt = BigInt(hash);
console.log(`Hash as BigInt: ${hashAsBigInt}`);

// bytes32(uint256(keccak256("ubiquity.contracts.ubiquity.pool.storage")) - 1) & ~bytes32(uint256(0xff));
const basePos = (hashAsBigInt - 1n) & ~BigInt(0xff);
console.log(`Base Position: ${toHex(basePos)}`);
