/**
 * token-info.ts
 * 
 * Provider for fetching detailed token information and metadata
 * Supplies context about token details, social links, and creator info
 */

import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { Connection, PublicKey } from "@solana/web3.js";
import axios from "axios";

// Types
export interface TokenInfo {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    supply: {
        total: string;
        circulating: string;
    };
    metadata: {
        description: string;
        imageUrl: string;
        metadataUri?: string;
        attributes?: Array<{ trait_type: string; value: string }>;
    };
    creator: {
        address: string;
        verified: boolean;
    };
    social: {
        twitter?: string;
        telegram?: string;
        website?: string;
        discord?: string;
    };
    pumpfun: {
        bondingCurve: string;
        bondingCurveProgress: number;
        isComplete: boolean;
        virtualSolReserves: number;
        virtualTokenReserves: number;
        poolAddress?: string;
    };
    dates: {
        created: Date;
        graduated?: Date;
        lastUpdate: Date;
    };
    flags: {
        isRug: boolean;
        isScam: boolean;
        hasLiquidity: boolean;
        isVerified: boolean;
        hasAudit: boolean;
    };
}

export interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    external_url?: string;
    animation_url?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
    properties?: {
        files?: Array<{ uri: string; type: string }>;
        category?: string;
    };
}

export interface CreatorInfo {
    address: string;
    totalTokensCreated: number;
    successfulTokens: number;
    totalVolume: number;
    averageMarketCap: number;
    reputation: "new" | "experienced" | "veteran" | "trusted" | "suspicious";
    recentTokens: Array<{
        address: string;
        name: string;
        symbol: string;
        marketCap: number;
        priceChange24h: number;
    }>;
}

export class TokenInfoProvider {
    private runtime: IAgentRuntime;
    private connection: Connection;
    private pumpfunApiUrl: string;
    private cache: Map<string, { data: any; timestamp: number }>;
    private cacheDuration: number = 60000; // 1 minute

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.connection = new Connection(
            runtime.getSetting("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com",
            "confirmed"
        );
        this.pumpfunApiUrl = runtime.getSetting("PUMPFUN_API_URL") || "https://pumpportal.fun/api";
        this.cache = new Map();
    }

    /**
     * Get comprehensive token information
     */
    async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
        const cacheKey = `info:${tokenAddress}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // Fetch from multiple sources
            const [pumpfunData, onChainData, metadata] = await Promise.all([
                this.fetchPumpfunData(tokenAddress),
                this.fetchOnChainData(tokenAddress),
                this.fetchMetadata(tokenAddress),
            ]);

            if (!pumpfunData && !onChainData) {
                return null;
            }

            const info = this.combineTokenInfo(pumpfunData, onChainData, metadata);
            this.setCache(cacheKey, info);
            return info;
        } catch (error) {
            console.error(`Error fetching token info for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Get token metadata from IPFS/Arweave
     */
    async getTokenMetadata(metadataUri: string): Promise<TokenMetadata | null> {
        const cacheKey = `metadata:${metadataUri}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // Handle IPFS URLs
            let fetchUrl = metadataUri;
            if (metadataUri.startsWith("ipfs://")) {
                fetchUrl = metadataUri.replace("ipfs://", "https://ipfs.io/ipfs/");
            }

            const response = await axios.get(fetchUrl, { timeout: 5000 });
            const metadata = response.data as TokenMetadata;

            this.setCache(cacheKey, metadata);
            return metadata;
        } catch (error) {
            console.error(`Error fetching metadata from ${metadataUri}:`, error.message);
            return null;
        }
    }

    /**
     * Get creator information
     */
    async getCreatorInfo(creatorAddress: string): Promise<CreatorInfo | null> {
        const cacheKey = `creator:${creatorAddress}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/creators/${creatorAddress}`,
                { timeout: 5000 }
            );

            const data = response.data;
            const info: CreatorInfo = {
                address: creatorAddress,
                totalTokensCreated: data.totalTokens || 0,
                successfulTokens: data.successfulTokens || 0,
                totalVolume: data.totalVolume || 0,
                averageMarketCap: data.averageMarketCap || 0,
                reputation: this.calculateReputation(data),
                recentTokens: (data.recentTokens || []).map((t: any) => ({
                    address: t.mint,
                    name: t.name,
                    symbol: t.symbol,
                    marketCap: t.marketCap,
                    priceChange24h: t.priceChange24h,
                })),
            };

            this.setCache(cacheKey, info);
            return info;
        } catch (error) {
            console.error(`Error fetching creator info for ${creatorAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Validate token address
     */
    async validateToken(tokenAddress: string): Promise<{
        isValid: boolean;
        exists: boolean;
        isPumpfun: boolean;
        warnings: string[];
    }> {
        try {
            // Check if valid Solana address
            let pubkey: PublicKey;
            try {
                pubkey = new PublicKey(tokenAddress);
            } catch {
                return {
                    isValid: false,
                    exists: false,
                    isPumpfun: false,
                    warnings: ["Invalid Solana address format"],
                };
            }

            // Check if token exists on-chain
            const accountInfo = await this.connection.getAccountInfo(pubkey);
            if (!accountInfo) {
                return {
                    isValid: true,
                    exists: false,
                    isPumpfun: false,
                    warnings: ["Token does not exist on Solana"],
                };
            }

            // Check if it's a Pump.fun token
            const info = await this.getTokenInfo(tokenAddress);
            const warnings: string[] = [];

            if (info) {
                if (info.flags.isRug) warnings.push("⚠️ Token flagged as potential rug");
                if (info.flags.isScam) warnings.push("⚠️ Token flagged as potential scam");
                if (!info.flags.hasLiquidity) warnings.push("ℹ️ Token has low liquidity");
                if (info.pumpfun.bondingCurveProgress < 10) {
                    warnings.push("ℹ️ Bonding curve less than 10% complete");
                }
            }

            return {
                isValid: true,
                exists: true,
                isPumpfun: info !== null,
                warnings,
            };
        } catch (error) {
            console.error(`Error validating token ${tokenAddress}:`, error.message);
            return {
                isValid: true,
                exists: false,
                isPumpfun: false,
                warnings: ["Could not verify token"],
            };
        }
    }

    /**
     * Get token holders information
     */
    async getTokenHolders(tokenAddress: string, limit: number = 100): Promise<Array<{
        address: string;
        balance: string;
        percentage: number;
        rank: number;
    }>> {
        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}/holders`,
                { params: { limit }, timeout: 5000 }
            );

            return response.data.map((holder: any, index: number) => ({
                address: holder.address,
                balance: holder.balance,
                percentage: holder.percentage,
                rank: index + 1,
            }));
        } catch (error) {
            console.error(`Error fetching holders for ${tokenAddress}:`, error.message);
            return [];
        }
    }

    /**
     * Get token transactions
     */
    async getTokenTransactions(
        tokenAddress: string,
        limit: number = 50
    ): Promise<Array<{
        signature: string;
        type: "buy" | "sell" | "transfer";
        amount: number;
        priceUSD: number;
        walletAddress: string;
        timestamp: Date;
    }>> {
        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}/trades`,
                { params: { limit }, timeout: 5000 }
            );

            return response.data.map((tx: any) => ({
                signature: tx.signature,
                type: tx.type,
                amount: tx.amount,
                priceUSD: tx.priceUsd,
                walletAddress: tx.wallet,
                timestamp: new Date(tx.timestamp),
            }));
        } catch (error) {
            console.error(`Error fetching transactions for ${tokenAddress}:`, error.message);
            return [];
        }
    }

    /**
     * Private helper methods
     */

    private async fetchPumpfunData(tokenAddress: string): Promise<any> {
        try {
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}`,
                { timeout: 5000 }
            );
            return response.data;
        } catch (error) {
            console.error("Error fetching Pump.fun data:", error.message);
            return null;
        }
    }

    private async fetchOnChainData(tokenAddress: string): Promise<any> {
        try {
            const pubkey = new PublicKey(tokenAddress);
            const accountInfo = await this.connection.getAccountInfo(pubkey);
            
            if (!accountInfo) return null;

            // Parse token account data (simplified)
            return {
                owner: accountInfo.owner.toBase58(),
                executable: accountInfo.executable,
                lamports: accountInfo.lamports,
            };
        } catch (error) {
            console.error("Error fetching on-chain data:", error.message);
            return null;
        }
    }

    private async fetchMetadata(tokenAddress: string): Promise<TokenMetadata | null> {
        try {
            // Try to fetch metadata from Pump.fun first
            const response = await axios.get(
                `${this.pumpfunApiUrl}/coins/${tokenAddress}/metadata`,
                { timeout: 5000 }
            );

            if (response.data.metadataUri) {
                return await this.getTokenMetadata(response.data.metadataUri);
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private combineTokenInfo(
        pumpfunData: any,
        onChainData: any,
        metadata: TokenMetadata | null
    ): TokenInfo {
        return {
            address: pumpfunData?.mint || pumpfunData?.address,
            name: metadata?.name || pumpfunData?.name,
            symbol: metadata?.symbol || pumpfunData?.symbol,
            decimals: pumpfunData?.decimals || 9,
            supply: {
                total: pumpfunData?.totalSupply?.toString() || "1000000000",
                circulating: pumpfunData?.circulatingSupply?.toString() || "1000000000",
            },
            metadata: {
                description: metadata?.description || pumpfunData?.description || "",
                imageUrl: metadata?.image || pumpfunData?.image || pumpfunData?.imageUrl || "",
                metadataUri: pumpfunData?.metadataUri,
                attributes: metadata?.attributes,
            },
            creator: {
                address: pumpfunData?.creator || pumpfunData?.deployer || "",
                verified: pumpfunData?.creatorVerified || false,
            },
            social: {
                twitter: pumpfunData?.twitter || metadata?.external_url,
                telegram: pumpfunData?.telegram,
                website: pumpfunData?.website,
                discord: pumpfunData?.discord,
            },
            pumpfun: {
                bondingCurve: pumpfunData?.bondingCurve || "",
                bondingCurveProgress: pumpfunData?.bondingCurveProgress || 0,
                isComplete: pumpfunData?.complete || false,
                virtualSolReserves: pumpfunData?.virtualSolReserves || 0,
                virtualTokenReserves: pumpfunData?.virtualTokenReserves || 0,
                poolAddress: pumpfunData?.poolAddress,
            },
            dates: {
                created: new Date(pumpfunData?.createdTimestamp || Date.now()),
                graduated: pumpfunData?.graduatedTimestamp ? new Date(pumpfunData.graduatedTimestamp) : undefined,
                lastUpdate: new Date(),
            },
            flags: {
                isRug: pumpfunData?.rugCheck?.isRug || false,
                isScam: pumpfunData?.scamCheck?.isScam || false,
                hasLiquidity: (pumpfunData?.virtualSolReserves || 0) > 0,
                isVerified: pumpfunData?.verified || false,
                hasAudit: pumpfunData?.audited || false,
            },
        };
    }

    private calculateReputation(data: any): CreatorInfo["reputation"] {
        const totalTokens = data.totalTokens || 0;
        const successfulTokens = data.successfulTokens || 0;
        const successRate = totalTokens > 0 ? successfulTokens / totalTokens : 0;
        const totalVolume = data.totalVolume || 0;

        // Check for suspicious patterns
        if (totalTokens > 10 && successRate < 0.1) {
            return "suspicious";
        }

        // Calculate reputation based on experience and success
        if (totalTokens < 3) {
            return "new";
        } else if (totalTokens < 10) {
            return "experienced";
        } else if (totalTokens < 50 && successRate > 0.5) {
            return "veteran";
        } else if (successRate > 0.7 && totalVolume > 1000000) {
            return "trusted";
        }

        return "experienced";
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
        if (this.cache.size > 500) {
            const entries = Array.from(this.cache.entries());
            const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = sorted.slice(0, 50);
            toDelete.forEach(([key]) => this.cache.delete(key));
        }
    }

    /**
     * Format token info for agent context
     */
    formatForContext(info: TokenInfo): string {
        const socials = [];
        if (info.social.twitter) socials.push(`Twitter: ${info.social.twitter}`);
        if (info.social.telegram) socials.push(`Telegram: ${info.social.telegram}`);
        if (info.social.website) socials.push(`Website: ${info.social.website}`);

        const flags = [];
        if (info.flags.isVerified) flags.push("✅ Verified");
        if (info.flags.hasAudit) flags.push("🔒 Audited");
        if (info.flags.isRug) flags.push("⚠️ Rug Warning");
        if (info.flags.isScam) flags.push("🚨 Scam Warning");

        return `Token Information: ${info.name} (${info.symbol})
Address: ${info.address}
Description: ${info.metadata.description || "No description"}
Creator: ${info.creator.address}${info.creator.verified ? " ✓" : ""}
Total Supply: ${this.formatSupply(info.supply.total)}
Bonding Curve: ${info.pumpfun.bondingCurveProgress.toFixed(1)}%
Graduated: ${info.pumpfun.isComplete ? "Yes" : "No"}
Created: ${info.dates.created.toLocaleDateString()}
${socials.length > 0 ? "\nSocial Links:\n" + socials.join("\n") : ""}
${flags.length > 0 ? "\nFlags: " + flags.join(", ") : ""}`;
    }

    private formatSupply(supply: string): string {
        const num = parseFloat(supply);
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + "B";
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(2) + "K";
        }
        return num.toFixed(2);
    }
}

/**
 * ElizaOS Provider Export
 * This provider supplies detailed token information to the agent
 */
export const tokenInfoProvider: Provider = {
    name: "tokenInfo",
    description: "Provides detailed information about Pump.fun tokens",

    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        const provider = new TokenInfoProvider(runtime);
        
        try {
            // Extract token address from message
            const tokenMatch = message.content.text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
            
            if (!tokenMatch) {
                return "To get token information, please provide a valid Solana token address.";
            }

            const tokenAddress = tokenMatch[0];
            const info = await provider.getTokenInfo(tokenAddress);
            
            if (!info) {
                return `Could not find information for token: ${tokenAddress}`;
            }

            return provider.formatForContext(info);
        } catch (error) {
            console.error("Error in tokenInfo provider:", error);
            return "Token information temporarily unavailable.";
        }
    },
};

export default tokenInfoProvider;
