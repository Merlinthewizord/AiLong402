/**
 * market-data.ts
 * 
 * Provider for fetching real-time market data for Pump.fun tokens
 * Supplies context to the agent about token prices, volume, and trends
 */

import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import axios from "axios";

// Types
export interface TokenMarketData {
    address: string;
    symbol: string;
    name: string;
    priceUSD: number;
    priceSOL: number;
    marketCapUSD: number;
    volume24h: number;
    volumeChange24h: number;
    priceChange1h: number;
    priceChange24h: number;
    priceChange7d: number;
    liquidity: number;
    holders: number;
    bondingCurveProgress: number;
    isGraduated: boolean;
    totalSupply: number;
    circulatingSupply: number;
    ath: number;
    atl: number;
    createdAt: Date;
    links?: {
        pumpfun: string;
        dexscreener: string;
        birdeye: string;
    };
}

export interface TrendingToken {
    address: string;
    symbol: string;
    name: string;
    priceUSD: number;
    priceChange24h: number;
    volume24h: number;
    marketCapUSD: number;
    rank: number;
    score: number;
}

export interface MarketOverview {
    totalMarketCap: number;
    totalVolume24h: number;
    totalTokens: number;
    newTokens24h: number;
    graduatedTokens24h: number;
    averageMarketCap: number;
    topGainers: TrendingToken[];
    topLosers: TrendingToken[];
    trending: TrendingToken[];
    solPrice: number;
}

export class MarketDataProvider {
    private runtime: IAgentRuntime;
    private pumpfunApiUrl: string;
    private cache: Map<string, { data: any; timestamp: number }>;
    private cacheDuration: number = 30000; // 30 seconds

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.pumpfunApiUrl = runtime.getSetting("PUMPFUN_API_URL") || "https://pumpportal.fun/api";
        this.cache = new Map();
    }

    /**
     * Get market data for a specific token
     */
    async getTokenData(tokenAddress: string): Promise<TokenMarketData | null> {
        const cacheKey = `token:${tokenAddress}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // Fetch from Pump.fun API
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}`,
                { timeout: 5000 }
            );

            if (!response.data) {
                return null;
            }

            const data = this.parseTokenData(response.data);
            this.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`Error fetching token data for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Get trending tokens
     */
    async getTrendingTokens(limit: number = 10): Promise<TrendingToken[]> {
        const cacheKey = "trending";
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/trending`,
                { params: { limit }, timeout: 5000 }
            );

            const trending = response.data.map((token: any, index: number) => 
                this.parseTrendingToken(token, index + 1)
            );

            this.setCache(cacheKey, trending);
            return trending;
        } catch (error) {
            console.error("Error fetching trending tokens:", error.message);
            return [];
        }
    }

    /**
     * Get market overview
     */
    async getMarketOverview(): Promise<MarketOverview> {
        const cacheKey = "market:overview";
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const [trending, newTokens, solPrice] = await Promise.all([
                this.getTrendingTokens(20),
                this.getNewTokens(50),
                this.getSolPrice(),
            ]);

            // Calculate top gainers/losers
            const sorted = [...trending].sort((a, b) => b.priceChange24h - a.priceChange24h);
            const topGainers = sorted.slice(0, 10);
            const topLosers = sorted.slice(-10).reverse();

            // Calculate aggregates
            const totalMarketCap = trending.reduce((sum, t) => sum + t.marketCapUSD, 0);
            const totalVolume24h = trending.reduce((sum, t) => sum + t.volume24h, 0);
            const averageMarketCap = totalMarketCap / trending.length;

            const overview: MarketOverview = {
                totalMarketCap,
                totalVolume24h,
                totalTokens: newTokens.length,
                newTokens24h: newTokens.filter(t => 
                    Date.now() - new Date(t.createdAt).getTime() < 24 * 60 * 60 * 1000
                ).length,
                graduatedTokens24h: newTokens.filter(t => t.isGraduated).length,
                averageMarketCap,
                topGainers,
                topLosers,
                trending: trending.slice(0, 10),
                solPrice,
            };

            this.setCache(cacheKey, overview);
            return overview;
        } catch (error) {
            console.error("Error fetching market overview:", error.message);
            throw error;
        }
    }

    /**
     * Get newly created tokens
     */
    async getNewTokens(limit: number = 20): Promise<TokenMarketData[]> {
        const cacheKey = `new:${limit}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/new`,
                { params: { limit }, timeout: 5000 }
            );

            const tokens = response.data.map((token: any) => this.parseTokenData(token));
            this.setCache(cacheKey, tokens);
            return tokens;
        } catch (error) {
            console.error("Error fetching new tokens:", error.message);
            return [];
        }
    }

    /**
     * Search tokens by name or symbol
     */
    async searchTokens(query: string, limit: number = 10): Promise<TokenMarketData[]> {
        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/search`,
                { params: { q: query, limit }, timeout: 5000 }
            );

            return response.data.map((token: any) => this.parseTokenData(token));
        } catch (error) {
            console.error(`Error searching tokens for "${query}":`, error.message);
            return [];
        }
    }

    /**
     * Get SOL price in USD
     */
    async getSolPrice(): Promise<number> {
        const cacheKey = "sol:price";
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                "https://api.coingecko.com/api/v3/simple/price",
                { params: { ids: "solana", vs_currencies: "usd" }, timeout: 5000 }
            );

            const price = response.data.solana.usd;
            this.setCache(cacheKey, price);
            return price;
        } catch (error) {
            console.error("Error fetching SOL price:", error.message);
            return 150; // Default fallback
        }
    }

    /**
     * Get token performance metrics
     */
    async getTokenPerformance(tokenAddress: string): Promise<{
        priceHistory: Array<{ timestamp: number; price: number }>;
        volumeHistory: Array<{ timestamp: number; volume: number }>;
        holdersHistory: Array<{ timestamp: number; holders: number }>;
    } | null> {
        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}/history`,
                { params: { interval: "1h", limit: 24 }, timeout: 5000 }
            );

            return {
                priceHistory: response.data.prices || [],
                volumeHistory: response.data.volumes || [],
                holdersHistory: response.data.holders || [],
            };
        } catch (error) {
            console.error(`Error fetching performance for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Compare multiple tokens
     */
    async compareTokens(addresses: string[]): Promise<{
        tokens: TokenMarketData[];
        comparison: {
            bestPerformer: string;
            worstPerformer: string;
            highestVolume: string;
            highestMarketCap: string;
        };
    }> {
        const tokens = await Promise.all(
            addresses.map(addr => this.getTokenData(addr))
        );

        const validTokens = tokens.filter(t => t !== null) as TokenMarketData[];

        if (validTokens.length === 0) {
            throw new Error("No valid tokens found");
        }

        const comparison = {
            bestPerformer: validTokens.reduce((best, t) => 
                t.priceChange24h > best.priceChange24h ? t : best
            ).address,
            worstPerformer: validTokens.reduce((worst, t) => 
                t.priceChange24h < worst.priceChange24h ? t : worst
            ).address,
            highestVolume: validTokens.reduce((highest, t) => 
                t.volume24h > highest.volume24h ? t : highest
            ).address,
            highestMarketCap: validTokens.reduce((highest, t) => 
                t.marketCapUSD > highest.marketCapUSD ? t : highest
            ).address,
        };

        return { tokens: validTokens, comparison };
    }

    /**
     * Private helper methods
     */

    private parseTokenData(data: any): TokenMarketData {
        const solPrice = 150; // Could fetch real-time

        return {
            address: data.mint || data.address,
            symbol: data.symbol || data.ticker,
            name: data.name,
            priceUSD: data.priceUsd || data.price_usd || 0,
            priceSOL: data.priceSol || data.price_sol || 0,
            marketCapUSD: data.marketCap || data.market_cap || 0,
            volume24h: data.volume24h || data.volume_24h || 0,
            volumeChange24h: data.volumeChange24h || 0,
            priceChange1h: data.priceChange1h || 0,
            priceChange24h: data.priceChange24h || data.change_24h || 0,
            priceChange7d: data.priceChange7d || 0,
            liquidity: data.liquidity || 0,
            holders: data.holders || data.holder_count || 0,
            bondingCurveProgress: data.bondingCurveProgress || 0,
            isGraduated: data.complete || data.is_graduated || false,
            totalSupply: data.totalSupply || 1000000000,
            circulatingSupply: data.circulatingSupply || data.totalSupply || 1000000000,
            ath: data.ath || data.priceUSD,
            atl: data.atl || data.priceUSD,
            createdAt: new Date(data.createdTimestamp || data.created_at || Date.now()),
            links: {
                pumpfun: `https://pump.fun/${data.mint || data.address}`,
                dexscreener: `https://dexscreener.com/solana/${data.mint || data.address}`,
                birdeye: `https://birdeye.so/token/${data.mint || data.address}?chain=solana`,
            },
        };
    }

    private parseTrendingToken(data: any, rank: number): TrendingToken {
        return {
            address: data.mint || data.address,
            symbol: data.symbol || data.ticker,
            name: data.name,
            priceUSD: data.priceUsd || data.price_usd || 0,
            priceChange24h: data.priceChange24h || data.change_24h || 0,
            volume24h: data.volume24h || data.volume_24h || 0,
            marketCapUSD: data.marketCap || data.market_cap || 0,
            rank,
            score: data.trendScore || rank,
        };
    }

    private getFromCache(key: string): any | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > this.cacheDuration) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });

        // Cleanup old cache entries
        if (this.cache.size > 1000) {
            const entries = Array.from(this.cache.entries());
            const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = sorted.slice(0, 100);
            toDelete.forEach(([key]) => this.cache.delete(key));
        }
    }

    /**
     * Format market data for agent context
     */
    formatForContext(data: TokenMarketData): string {
        const priceChange = data.priceChange24h >= 0 ? "+" : "";
        
        return `Token: ${data.name} (${data.symbol})
Address: ${data.address}
Price: $${data.priceUSD.toFixed(6)} (${data.priceSOL.toFixed(9)} SOL)
24h Change: ${priceChange}${data.priceChange24h.toFixed(2)}%
Market Cap: $${this.formatNumber(data.marketCapUSD)}
Volume 24h: $${this.formatNumber(data.volume24h)}
Holders: ${data.holders}
Bonding Curve: ${data.bondingCurveProgress.toFixed(1)}%
Graduated: ${data.isGraduated ? "Yes" : "No"}`;
    }

    private formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(2) + "K";
        }
        return num.toFixed(2);
    }
}

/**
 * ElizaOS Provider Export
 * This provider supplies market data context to the agent
 */
export const marketDataProvider: Provider = {
    name: "marketData",
    description: "Provides real-time market data for Pump.fun tokens",

    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        const provider = new MarketDataProvider(runtime);
        
        try {
            // Extract token address from message if present
            const tokenMatch = message.content.text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
            
            if (tokenMatch) {
                const tokenAddress = tokenMatch[0];
                const data = await provider.getTokenData(tokenAddress);
                
                if (data) {
                    return provider.formatForContext(data);
                }
            }

            // Otherwise provide market overview
            const overview = await provider.getMarketOverview();
            
            return `Market Overview:
Total Market Cap: $${provider['formatNumber'](overview.totalMarketCap)}
24h Volume: $${provider['formatNumber'](overview.totalVolume24h)}
New Tokens (24h): ${overview.newTokens24h}
SOL Price: $${overview.solPrice.toFixed(2)}

Top Trending:
${overview.trending.slice(0, 5).map((t, i) => 
    `${i + 1}. ${t.symbol} - $${t.priceUSD.toFixed(6)} (${t.priceChange24h >= 0 ? "+" : ""}${t.priceChange24h.toFixed(2)}%)`
).join("\n")}`;
        } catch (error) {
            console.error("Error in marketData provider:", error);
            return "Market data temporarily unavailable.";
        }
    },
};

export default marketDataProvider;
