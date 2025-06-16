import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    parseEther,
    formatEther,
    parseUnits,
    formatUnits,
    type Address,
    type WalletClient,
    type PublicClient,
    maxUint256
} from 'viem';
import { mainnet } from 'viem/chains';

// Contract addresses
const ADDRESSES = {
    DIAMOND: '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address,
    DOLLAR: '0xb6919ef2ee4afc163bc954c5678e2bb570c2d103' as Address,
    GOVERNANCE: '0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0' as Address,
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address
};

// Minimal ABIs - only functions we need
const DIAMOND_ABI = [
    {
        name: 'mintDollar',
        type: 'function',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' },
            { name: 'dollarOutMin', type: 'uint256' },
            { name: 'maxCollateralIn', type: 'uint256' },
            { name: 'maxGovernanceIn', type: 'uint256' },
            { name: 'isOneToOne', type: 'bool' }
        ],
        outputs: [
            { name: 'totalDollarMint', type: 'uint256' },
            { name: 'collateralNeeded', type: 'uint256' },
            { name: 'governanceNeeded', type: 'uint256' }
        ]
    },
    {
        name: 'redeemDollar',
        type: 'function',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' },
            { name: 'governanceOutMin', type: 'uint256' },
            { name: 'collateralOutMin', type: 'uint256' }
        ],
        outputs: [
            { name: 'collateralOut', type: 'uint256' },
            { name: 'governanceOut', type: 'uint256' }
        ]
    },
    {
        name: 'collectRedemption',
        type: 'function',
        inputs: [{ name: 'collateralIndex', type: 'uint256' }],
        outputs: [
            { name: 'governanceAmount', type: 'uint256' },
            { name: 'collateralAmount', type: 'uint256' }
        ]
    },
    {
        name: 'getDollarInCollateral',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'collateralRatio',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'getGovernancePriceUsd',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'allCollaterals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address[]' }]
    },
    {
        name: 'collateralInformation',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'collateralAddress', type: 'address' }],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'index', type: 'uint256' },
                { name: 'symbol', type: 'string' },
                { name: 'collateralAddress', type: 'address' },
                { name: 'collateralPriceFeedAddress', type: 'address' },
                { name: 'collateralPriceFeedStalenessThreshold', type: 'uint256' },
                { name: 'isEnabled', type: 'bool' },
                { name: 'missingDecimals', type: 'uint256' },
                { name: 'price', type: 'uint256' },
                { name: 'poolCeiling', type: 'uint256' },
                { name: 'isMintPaused', type: 'bool' },
                { name: 'isRedeemPaused', type: 'bool' },
                { name: 'isBorrowPaused', type: 'bool' },
                { name: 'mintingFee', type: 'uint256' },
                { name: 'redemptionFee', type: 'uint256' }
            ]
        }]
    },
    {
        name: 'getRedeemCollateralBalance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'userAddress', type: 'address' },
            { name: 'collateralIndex', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }]
    }
] as const;

const ERC20_ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'approve',
        type: 'function',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ type: 'bool' }]
    }
] as const;

interface CollateralOption {
    index: number;
    name: string;
    address: Address;
    mintingFee: number;
    redemptionFee: number;
    missingDecimals: number;
}

declare global {
    interface Window {
        ethereum?: any;
    }
}

class UUSDApp {
    private walletClient: WalletClient | null = null;
    private publicClient: PublicClient;
    private account: Address | null = null;
    private collateralOptions: CollateralOption[] = [];
    private currentTab: 'mint' | 'redeem' = 'mint';

    constructor() {
        this.publicClient = createPublicClient({
            chain: mainnet,
            transport: http()
        });

        // Expose to window for HTML onclick handlers
        (window as any).app = this;

        this.init();
    }

    private async init() {
        await this.loadCollateralOptions();
        this.setupEventListeners();
    }

    private setupEventListeners() {
        const mintAmount = document.getElementById('mintAmount') as HTMLInputElement;
        const redeemAmount = document.getElementById('redeemAmount') as HTMLInputElement;
        const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
        const redeemCollateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        mintAmount?.addEventListener('input', () => this.updateMintOutput());
        collateralSelect?.addEventListener('change', () => this.updateMintOutput());
        forceCollateralOnly?.addEventListener('change', () => this.updateMintOutput());

        redeemAmount?.addEventListener('input', () => this.updateRedeemOutput());
        redeemCollateralSelect?.addEventListener('change', () => this.updateRedeemOutput());
    }

    async connectWallet() {
        try {
            if (!window.ethereum) {
                throw new Error('Please install a wallet extension');
            }

            this.walletClient = createWalletClient({
                chain: mainnet,
                transport: custom(window.ethereum)
            });

            const [address] = await this.walletClient.requestAddresses();
            this.account = address;

            // Update UI
            document.getElementById('connectWallet')!.style.display = 'none';
            document.getElementById('walletInfo')!.style.display = 'block';
            document.getElementById('walletAddress')!.textContent =
                `${address.slice(0, 6)}...${address.slice(-4)}`;

            // Enable forms
            document.getElementById('mintButton')!.disabled = false;
            document.getElementById('redeemButton')!.disabled = false;

            await this.checkForPendingRedemptions();
        } catch (error: any) {
            this.showError('mint', error.message);
        }
    }

    switchTab(tab: 'mint' | 'redeem') {
        this.currentTab = tab;

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab:nth-child(${tab === 'mint' ? 1 : 2})`)?.classList.add('active');

        // Update tab content
        document.getElementById('mintTab')!.classList.toggle('active', tab === 'mint');
        document.getElementById('redeemTab')!.classList.toggle('active', tab === 'redeem');
    }

    private async loadCollateralOptions() {
        try {
            const addresses = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'allCollaterals'
            });

            const options = await Promise.all(
                addresses.map(async (address) => {
                    const info = await this.publicClient.readContract({
                        address: ADDRESSES.DIAMOND,
                        abi: DIAMOND_ABI,
                        functionName: 'collateralInformation',
                        args: [address]
                    });

                    return {
                        index: Number(info.index),
                        name: info.symbol,
                        address: address,
                        mintingFee: Number(formatUnits(info.mintingFee, 6)),
                        redemptionFee: Number(formatUnits(info.redemptionFee, 6)),
                        missingDecimals: Number(info.missingDecimals),
                        isEnabled: info.isEnabled,
                        isMintPaused: info.isMintPaused
                    };
                })
            );

            this.collateralOptions = options.filter(o => o.isEnabled && !o.isMintPaused);
            this.populateCollateralDropdowns();
        } catch (error) {
            console.error('Failed to load collateral options:', error);
        }
    }

    private populateCollateralDropdowns() {
        const selects = ['collateralSelect', 'redeemCollateralSelect'];

        selects.forEach(id => {
            const select = document.getElementById(id) as HTMLSelectElement;
            if (!select) return;

            select.innerHTML = '<option value="">Select a collateral</option>';

            this.collateralOptions.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.index.toString();
                opt.textContent = option.name;
                select.appendChild(opt);
            });
        });
    }

    private async updateMintOutput() {
        try {
            const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

            const amount = amountInput.value;
            const collateralIndex = collateralSelect.value;

            if (!amount || !collateralIndex) {
                document.getElementById('mintOutput')!.style.display = 'none';
                document.getElementById('mintButton')!.textContent = 'Enter amount to continue';
                return;
            }

            document.getElementById('mintOutput')!.style.display = 'block';

            const collateral = this.collateralOptions.find(o => o.index === parseInt(collateralIndex));
            if (!collateral) return;

            const dollarAmount = parseEther(amount);
            const isForceCollateralOnly = forceCollateralOnly.checked;

            // Calculate mint output
            const output = await this.calculateMintOutput(
                collateral,
                dollarAmount,
                isForceCollateralOnly
            );

            // Update UI
            document.getElementById('collateralNeeded')!.textContent =
                `${formatUnits(output.collateralNeeded, 18 - collateral.missingDecimals)} ${collateral.name}`;
            document.getElementById('ubqNeeded')!.textContent =
                `${formatEther(output.governanceNeeded)} UBQ`;
            document.getElementById('mintingFee')!.textContent =
                `${collateral.mintingFee}%`;
            document.getElementById('totalMinted')!.textContent =
                `${formatEther(output.totalDollarMint)} UUSD`;

            // Update button text based on approval status
            if (this.account) {
                await this.updateMintButton(collateral, output);
            }
        } catch (error) {
            console.error('Error updating mint output:', error);
        }
    }

    private async calculateMintOutput(
        collateral: CollateralOption,
        dollarAmount: bigint,
        isForceCollateralOnly: boolean
    ) {
        const collateralRatio = await this.publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'collateralRatio'
        });

        const governancePrice = await this.publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getGovernancePriceUsd'
        });

        const poolPricePrecision = 1000000n;
        let collateralNeeded: bigint;
        let governanceNeeded: bigint;

        if (isForceCollateralOnly || collateralRatio >= poolPricePrecision) {
            collateralNeeded = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getDollarInCollateral',
                args: [BigInt(collateral.index), dollarAmount]
            });
            governanceNeeded = 0n;
        } else if (collateralRatio === 0n) {
            collateralNeeded = 0n;
            governanceNeeded = (dollarAmount * poolPricePrecision) / governancePrice;
        } else {
            const dollarForCollateral = (dollarAmount * collateralRatio) / poolPricePrecision;
            const dollarForGovernance = dollarAmount - dollarForCollateral;

            collateralNeeded = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getDollarInCollateral',
                args: [BigInt(collateral.index), dollarForCollateral]
            });
            governanceNeeded = (dollarForGovernance * poolPricePrecision) / governancePrice;
        }

        const mintingFee = parseUnits(collateral.mintingFee.toString(), 6);
        const totalDollarMint = (dollarAmount * (poolPricePrecision - mintingFee)) / poolPricePrecision;

        return { totalDollarMint, collateralNeeded, governanceNeeded };
    }

    private async updateMintButton(collateral: CollateralOption, output: any) {
        const button = document.getElementById('mintButton') as HTMLButtonElement;

        if (!this.walletClient || !this.account) {
            button.textContent = 'Connect wallet first';
            return;
        }

        // Check allowances
        const [collateralAllowance, governanceAllowance] = await Promise.all([
            output.collateralNeeded > 0n ?
                this.publicClient.readContract({
                    address: collateral.address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [this.account, ADDRESSES.DIAMOND]
                }) : maxUint256,
            output.governanceNeeded > 0n ?
                this.publicClient.readContract({
                    address: ADDRESSES.GOVERNANCE,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [this.account, ADDRESSES.DIAMOND]
                }) : maxUint256
        ]);

        if (collateralAllowance < output.collateralNeeded) {
            button.textContent = `Approve ${collateral.name}`;
        } else if (governanceAllowance < output.governanceNeeded) {
            button.textContent = 'Approve UBQ';
        } else {
            button.textContent = 'Mint UUSD';
        }
    }

    private async updateRedeemOutput() {
        try {
            const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;

            const amount = amountInput.value;
            const collateralIndex = collateralSelect.value;

            if (!amount || !collateralIndex) {
                document.getElementById('redeemOutput')!.style.display = 'none';
                document.getElementById('redeemButton')!.textContent = 'Enter amount to continue';
                return;
            }

            document.getElementById('redeemOutput')!.style.display = 'block';

            const collateral = this.collateralOptions.find(o => o.index === parseInt(collateralIndex));
            if (!collateral) return;

            const dollarAmount = parseEther(amount);

            // Calculate redeem output
            const output = await this.calculateRedeemOutput(collateral, dollarAmount);

            // Update UI
            document.getElementById('collateralRedeemed')!.textContent =
                `${formatUnits(output.collateralRedeemed, 18 - collateral.missingDecimals)} ${collateral.name}`;
            document.getElementById('ubqRedeemed')!.textContent =
                `${formatEther(output.governanceRedeemed)} UBQ`;
            document.getElementById('redemptionFee')!.textContent =
                `${collateral.redemptionFee * 100}%`;

            // Update button text
            if (this.account) {
                await this.updateRedeemButton();
            }
        } catch (error) {
            console.error('Error updating redeem output:', error);
        }
    }

    private async calculateRedeemOutput(collateral: CollateralOption, dollarAmount: bigint) {
        const collateralRatio = await this.publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'collateralRatio'
        });

        const governancePrice = await this.publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getGovernancePriceUsd'
        });

        const poolPricePrecision = 1000000n;
        const redemptionFee = parseUnits(collateral.redemptionFee.toString(), 6);
        const dollarAfterFee = (dollarAmount * (poolPricePrecision - redemptionFee)) / poolPricePrecision;

        let collateralRedeemed: bigint;
        let governanceRedeemed: bigint;

        if (collateralRatio >= poolPricePrecision) {
            const collateralOut = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getDollarInCollateral',
                args: [BigInt(collateral.index), dollarAfterFee]
            });
            collateralRedeemed = collateralOut;
            governanceRedeemed = 0n;
        } else if (collateralRatio === 0n) {
            collateralRedeemed = 0n;
            governanceRedeemed = (dollarAfterFee * poolPricePrecision) / governancePrice;
        } else {
            const collateralOut = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getDollarInCollateral',
                args: [BigInt(collateral.index), dollarAfterFee]
            });
            collateralRedeemed = (collateralOut * collateralRatio) / poolPricePrecision;
            governanceRedeemed = (dollarAfterFee * (poolPricePrecision - collateralRatio)) / governancePrice;
        }

        return { collateralRedeemed, governanceRedeemed };
    }

    private async updateRedeemButton() {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;

        if (!this.walletClient || !this.account) {
            button.textContent = 'Connect wallet first';
            return;
        }

        // Check if there's a pending redemption
        const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;
        const collateralIndex = collateralSelect.value;

        if (collateralIndex) {
            const redeemBalance = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getRedeemCollateralBalance',
                args: [this.account, BigInt(collateralIndex)]
            });

            if (redeemBalance > 0n) {
                button.textContent = 'Collect Redemption';
                return;
            }
        }

        // Check UUSD allowance
        const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;
        const amount = amountInput.value ? parseEther(amountInput.value) : 0n;

        if (amount > 0n) {
            const allowance = await this.publicClient.readContract({
                address: ADDRESSES.DOLLAR,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [this.account, ADDRESSES.DIAMOND]
            });

            if (allowance < amount) {
                button.textContent = 'Approve UUSD';
            } else {
                button.textContent = 'Redeem UUSD';
            }
        }
    }

    private async checkForPendingRedemptions() {
        if (!this.account) return;

        for (const collateral of this.collateralOptions) {
            const balance = await this.publicClient.readContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'getRedeemCollateralBalance',
                args: [this.account, BigInt(collateral.index)]
            });

            if (balance > 0n) {
                this.showSuccess('redeem', `You have a pending redemption for ${collateral.name}. Switch to the Redeem tab to collect.`);
                break;
            }
        }
    }

    async handleMint(event: Event) {
        event.preventDefault();

        if (!this.walletClient || !this.account) {
            this.showError('mint', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
            const button = document.getElementById('mintButton') as HTMLButtonElement;

            const amount = parseEther(amountInput.value);
            const collateralIndex = parseInt(collateralSelect.value);
            const collateral = this.collateralOptions.find(o => o.index === collateralIndex);

            if (!collateral) return;

            const originalText = button.textContent;
            button.disabled = true;

            // Calculate output for approval amounts
            const output = await this.calculateMintOutput(collateral, amount, forceCollateralOnly.checked);

            // Handle approvals if needed
            if (button.textContent?.includes('Approve')) {
                if (button.textContent.includes(collateral.name)) {
                    button.innerHTML = `Approving ${collateral.name}...<span class="loading"></span>`;

                    const hash = await this.walletClient.writeContract({
                        address: collateral.address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [ADDRESSES.DIAMOND, maxUint256]
                    });

                    await this.publicClient.waitForTransactionReceipt({ hash });
                } else if (button.textContent.includes('UBQ')) {
                    button.innerHTML = 'Approving UBQ...<span class="loading"></span>';

                    const hash = await this.walletClient.writeContract({
                        address: ADDRESSES.GOVERNANCE,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [ADDRESSES.DIAMOND, maxUint256]
                    });

                    await this.publicClient.waitForTransactionReceipt({ hash });
                }

                // Update button after approval
                await this.updateMintOutput();
                button.disabled = false;
                return;
            }

            // Execute mint
            button.innerHTML = 'Minting...<span class="loading"></span>';

            const hash = await this.walletClient.writeContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'mintDollar',
                args: [
                    BigInt(collateralIndex),
                    amount,
                    0n, // dollarOutMin
                    maxUint256, // maxCollateralIn
                    maxUint256, // maxGovernanceIn
                    forceCollateralOnly.checked
                ]
            });

            await this.publicClient.waitForTransactionReceipt({ hash });

            this.showSuccess('mint', `Successfully minted ${amountInput.value} UUSD!`);
            amountInput.value = '';
            await this.updateMintOutput();

        } catch (error: any) {
            this.showError('mint', error.message);
        } finally {
            const button = document.getElementById('mintButton') as HTMLButtonElement;
            button.disabled = false;
            button.innerHTML = button.textContent || 'Mint UUSD';
        }
    }

    async handleRedeem(event: Event) {
        event.preventDefault();

        if (!this.walletClient || !this.account) {
            this.showError('redeem', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;
            const button = document.getElementById('redeemButton') as HTMLButtonElement;

            const amount = parseEther(amountInput.value);
            const collateralIndex = parseInt(collateralSelect.value);
            const collateral = this.collateralOptions.find(o => o.index === collateralIndex);

            if (!collateral) return;

            button.disabled = true;

            // Check if collecting redemption
            if (button.textContent === 'Collect Redemption') {
                button.innerHTML = 'Collecting...<span class="loading"></span>';

                const hash = await this.walletClient.writeContract({
                    address: ADDRESSES.DIAMOND,
                    abi: DIAMOND_ABI,
                    functionName: 'collectRedemption',
                    args: [BigInt(collateralIndex)]
                });

                await this.publicClient.waitForTransactionReceipt({ hash });

                this.showSuccess('redeem', 'Successfully collected redemption!');
                await this.updateRedeemOutput();
                return;
            }

            // Handle UUSD approval if needed
            if (button.textContent === 'Approve UUSD') {
                button.innerHTML = 'Approving UUSD...<span class="loading"></span>';

                const hash = await this.walletClient.writeContract({
                    address: ADDRESSES.DOLLAR,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [ADDRESSES.DIAMOND, maxUint256]
                });

                await this.publicClient.waitForTransactionReceipt({ hash });
                await this.updateRedeemOutput();
                button.disabled = false;
                return;
            }

            // Execute redeem
            button.innerHTML = 'Redeeming...<span class="loading"></span>';

            const hash = await this.walletClient.writeContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'redeemDollar',
                args: [
                    BigInt(collateralIndex),
                    amount,
                    0n, // governanceOutMin
                    0n  // collateralOutMin
                ]
            });

            await this.publicClient.waitForTransactionReceipt({ hash });

            this.showSuccess('redeem', `Successfully redeemed ${amountInput.value} UUSD! Collect your redemption to receive tokens.`);
            amountInput.value = '';
            await this.updateRedeemOutput();

        } catch (error: any) {
            this.showError('redeem', error.message);
        } finally {
            const button = document.getElementById('redeemButton') as HTMLButtonElement;
            button.disabled = false;
            button.innerHTML = button.textContent || 'Redeem UUSD';
        }
    }

    private showError(tab: string, message: string) {
        const errorEl = document.getElementById(`${tab}Error`);
        const successEl = document.getElementById(`${tab}Success`);

        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        if (successEl) {
            successEl.style.display = 'none';
        }
    }

    private showSuccess(tab: string, message: string) {
        const errorEl = document.getElementById(`${tab}Error`);
        const successEl = document.getElementById(`${tab}Success`);

        if (successEl) {
            successEl.textContent = message;
            successEl.style.display = 'block';
        }

        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }
}

// Initialize app
new UUSDApp();
