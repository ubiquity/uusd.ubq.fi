import { createPublicClient, http, toHex, hexToBigInt } from 'viem';
import { mainnet } from 'viem/chains';
import { program } from 'commander';

program
    .requiredOption('--address <address>', 'Contract address')
    .requiredOption('--slot <slot>', 'Starting storage slot (hex or decimal)')
    .option('--count <number>', 'Number of slots to read', '1');

program.parse(process.argv);

const options = program.opts();

const client = createPublicClient({
    chain: mainnet,
    transport: http('https://mainnet.gateway.tenderly.co')
});

async function main() {
    const startSlot = BigInt(options.slot);
    const count = parseInt(options.count, 10);

    console.log(`Reading ${count} storage slot(s) from address ${options.address} starting at slot ${options.slot}`);
    console.log('---');

    for (let i = 0; i < count; i++) {
        const currentSlot = startSlot + BigInt(i);
        const slotHex = toHex(currentSlot);

        try {
            const storageValue = await client.getStorageAt({
                address: options.address,
                slot: slotHex
            });

            if (storageValue) {
                const valueBigInt = hexToBigInt(storageValue);
                console.log(`Slot ${slotHex}: ${valueBigInt}`);
            } else {
                console.log(`Slot ${slotHex}: null`);
            }
        } catch (error) {
            console.error(`Error reading slot ${slotHex}:`, error);
        }
    }
}

main();
