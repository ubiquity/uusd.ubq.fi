import type { PriceDataPoint } from '../services/price-history-service.ts';

/**
 * Configuration for sparkline rendering
 */
export interface SparklineConfig {
    width: number;
    height: number;
    lineColor: string;
    lineWidth: number;
    fillColor?: string;
    showDots?: boolean;
    dotColor?: string;
    dotRadius?: number;
}

/**
 * Default sparkline configuration
 */
const DEFAULT_CONFIG: SparklineConfig = {
    width: 100,
    height: 30,
    lineColor: '#00d4aa',
    lineWidth: 2,
    fillColor: 'rgba(0, 212, 170, 0.1)',
    showDots: false,
    dotColor: '#00d4aa',
    dotRadius: 2
};

/**
 * Lightweight sparkline component for displaying price history
 */
export class SparklineComponent {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: SparklineConfig;
    private data: PriceDataPoint[] = [];
    private animationId: number | null = null;

    constructor(container: HTMLElement, config: Partial<SparklineConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.config.width;
        this.canvas.height = this.config.height;
        this.canvas.style.display = 'block';

        // Set up high DPI support
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.config.width * dpr;
        this.canvas.height = this.config.height * dpr;
        this.canvas.style.width = `${this.config.width}px`;
        this.canvas.style.height = `${this.config.height}px`;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D context from canvas');
        }

        this.ctx = ctx;
        this.ctx.scale(dpr, dpr);

        // Add canvas to container
        container.appendChild(this.canvas);

        // Add tooltip functionality
        this.setupTooltip();
    }

    /**
     * Update sparkline with new price data
     */
    updateData(data: PriceDataPoint[]): void {
        this.data = [...data].sort((a, b) => a.timestamp - b.timestamp);
        this.render();
    }

    /**
     * Render the sparkline
     */
    private render(): void {
        if (this.data.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Clear canvas
        this.ctx.clearRect(0, 0, this.config.width, this.config.height);

        if (this.data.length === 1) {
            this.renderSinglePoint();
            return;
        }

        // Calculate scaling
        const prices = this.data.map(d => Number(d.price));
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        // Handle flat line case
        if (priceRange === 0) {
            this.renderFlatLine();
            return;
        }

        // Calculate points
        const points = this.data.map((d, i) => ({
            x: (i / (this.data.length - 1)) * this.config.width,
            y: this.config.height - ((Number(d.price) - minPrice) / priceRange) * this.config.height
        }));

        // Draw filled area if configured
        if (this.config.fillColor) {
            this.drawFill(points);
        }

        // Draw line
        this.drawLine(points);

        // Draw dots if configured
        if (this.config.showDots) {
            this.drawDots(points);
        }
    }

    /**
     * Draw the price line
     */
    private drawLine(points: Array<{ x: number; y: number }>): void {
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.config.lineColor;
        this.ctx.lineWidth = this.config.lineWidth;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        points.forEach((point, i) => {
            if (i === 0) {
                this.ctx.moveTo(point.x, point.y);
            } else {
                this.ctx.lineTo(point.x, point.y);
            }
        });

        this.ctx.stroke();
    }

    /**
     * Draw filled area under the line
     */
    private drawFill(points: Array<{ x: number; y: number }>): void {
        if (!this.config.fillColor) return;

        this.ctx.beginPath();
        this.ctx.fillStyle = this.config.fillColor;

        // Start from bottom left
        this.ctx.moveTo(points[0].x, this.config.height);

        // Draw to first point
        this.ctx.lineTo(points[0].x, points[0].y);

        // Draw along the price line
        points.forEach(point => {
            this.ctx.lineTo(point.x, point.y);
        });

        // Close the path at bottom right
        this.ctx.lineTo(points[points.length - 1].x, this.config.height);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * Draw dots at data points
     */
    private drawDots(points: Array<{ x: number; y: number }>): void {
        if (!this.config.showDots || !this.config.dotRadius) return;

        this.ctx.fillStyle = this.config.dotColor || this.config.lineColor;

        points.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, this.config.dotRadius!, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }

    /**
     * Render empty state
     */
    private renderEmptyState(): void {
        this.ctx.clearRect(0, 0, this.config.width, this.config.height);

        // Draw placeholder line
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.config.height / 2);
        this.ctx.lineTo(this.config.width, this.config.height / 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    /**
     * Render single data point
     */
    private renderSinglePoint(): void {
        this.ctx.clearRect(0, 0, this.config.width, this.config.height);

        const centerX = this.config.width / 2;
        const centerY = this.config.height / 2;

        // Draw a dot in the center
        this.ctx.fillStyle = this.config.lineColor;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    /**
     * Render flat line (all prices are the same)
     */
    private renderFlatLine(): void {
        this.ctx.clearRect(0, 0, this.config.width, this.config.height);

        const y = this.config.height / 2;

        this.ctx.strokeStyle = this.config.lineColor;
        this.ctx.lineWidth = this.config.lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.config.width, y);
        this.ctx.stroke();
    }

    /**
     * Set up tooltip functionality
     */
    private setupTooltip(): void {
        this.canvas.style.cursor = 'pointer';

        this.canvas.addEventListener('mousemove', (event) => {
            if (this.data.length === 0) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;

            // Find closest data point
            const index = Math.round((x / this.config.width) * (this.data.length - 1));
            const dataPoint = this.data[Math.max(0, Math.min(index, this.data.length - 1))];

            if (dataPoint) {
                this.showTooltip(event, dataPoint);
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }

    /**
     * Show tooltip with price and time information
     */
    private showTooltip(event: MouseEvent, dataPoint: PriceDataPoint): void {
        const price = Number(dataPoint.price) / 1000000; // Convert from 6 decimal precision
        const time = new Date(dataPoint.timestamp * 1000);

        // Remove existing tooltip
        this.hideTooltip();

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'sparkline-tooltip';
        tooltip.innerHTML = `
            <div>$${price.toFixed(4)}</div>
            <div>${time.toLocaleDateString()} ${time.toLocaleTimeString()}</div>
        `;

        // Style tooltip
        Object.assign(tooltip.style, {
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            lineHeight: '1.4',
            pointerEvents: 'none',
            zIndex: '1000',
            left: `${event.pageX + 10}px`,
            top: `${event.pageY - 10}px`,
            transform: 'translateY(-100%)'
        });

        document.body.appendChild(tooltip);
    }

    /**
     * Hide tooltip
     */
    private hideTooltip(): void {
        const existing = document.querySelector('.sparkline-tooltip');
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Get the current trend direction
     */
    getTrend(): 'up' | 'down' | 'flat' {
        if (this.data.length < 2) return 'flat';

        const firstPrice = Number(this.data[0].price);
        const lastPrice = Number(this.data[this.data.length - 1].price);

        const change = lastPrice - firstPrice;
        const threshold = firstPrice * 0.001; // 0.1% threshold

        if (change > threshold) return 'up';
        if (change < -threshold) return 'down';
        return 'flat';
    }

    /**
     * Get price change percentage
     */
    getPriceChange(): number {
        if (this.data.length < 2) return 0;

        const firstPrice = Number(this.data[0].price);
        const lastPrice = Number(this.data[this.data.length - 1].price);

        return ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    /**
     * Destroy the component and clean up resources
     */
    destroy(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        this.hideTooltip();

        if (this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<SparklineConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.render();
    }
}