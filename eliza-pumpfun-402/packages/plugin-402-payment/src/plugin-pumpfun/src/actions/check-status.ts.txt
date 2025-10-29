/**
 * check-status.ts
 * 
 * Action for checking deployment status and token information
 * Monitors deployments, provides updates, and tracks token performance
 */

import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@ai16z/eliza";
import { TokenDeploymentService } from "../services/token-deployment";
import { MarketDataProvider } from "../providers/market-data";
import { TokenInfoProvider } from "../providers/token-info";

// Types
interface StatusQuery {
    type: "deployment" | "token" | "transaction";
    identifier: string; // deploymentId, tokenAddress, or txSignature
}

export const checkStatusAction: Action = {
    name: "CHECK_STATUS",
    similes: [
        "GET_STATUS",
        "DEPLOYMENT_STATUS",
        "TOKEN_STATUS",
        "CHECK_DEPLOYMENT",
        "CHECK_TOKEN",
        "HOW_IS_MY_TOKEN",
        "TRACK_DEPLOYMENT"
    ],
    description: "Checks the status of a token deployment or provides token information",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        
        // Check for status-related keywords
        const hasStatusKeyword = 
            text.includes("status") ||
            text.includes("check") ||
            text.includes("how is") ||
            text.includes("track") ||
            text.includes("monitor") ||
            text.includes("update");
        
        // Check for deployment/token identifiers
        const hasIdentifier = 
            /dep_[a-zA-Z0-9]+/.test(text) || // deployment ID
            /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(text) || // token address
            /[1-9A-HJ-NP-Za-km-z]{87,88}/.test(text); // transaction signature
        
        return hasStatusKeyword || hasIdentifier;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            // Parse the query
            const query = parseStatusQuery(message.content.text);
            
            if (!query) {
                callback({
                    text: "I can check the status of:\n\n" +
                        "• **Deployments**: Use your deployment ID (e.g., `dep_abc123`)\n" +
                        "• **Tokens**: Use the token address\n" +
                        "• **Transactions**: Use the transaction signature\n\n" +
                        "What would you like to check?",
                    action: "CHECK_STATUS_HELP"
                });
                return false;
            }

            // Route to appropriate handler
            switch (query.type) {
                case "deployment":
                    return await handleDeploymentStatus(runtime, query, callback);
                case "token":
                    return await handleTokenStatus(runtime, query, callback);
                case "transaction":
                    return await handleTransactionStatus(runtime, query, callback);
                default:
                    callback({
                        text: "I'm not sure what you want me to check. Please provide a deployment ID, token address, or transaction signature.",
                        action: "CHECK_STATUS_UNKNOWN",
                        error: true
                    });
                    return false;
            }
        } catch (error) {
            console.error("Check status error:", error);
            callback({
                text: `❌ Error checking status: ${error.message}`,
                action: "CHECK_STATUS_ERROR",
                error: true
            });
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Check status of dep_abc123"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "📊 Deployment Status: dep_abc123\n\n✅ Status: Completed\n🎉 Token: MoonCoin (MOON)\n📍 Address: 7xKXtg2CW87...\n⏰ Completed: 5 minutes ago"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How is my token doing? 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "📈 Token Performance: MoonCoin (MOON)\n\n💰 Price: $0.000123 (+45.67%)\n📊 Market Cap: $50K\n💧 Volume 24h: $12.5K\n👥 Holders: 42\n🔄 Bonding Curve: 15.5%"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Track my deployment"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check your most recent deployment...\n\n⏳ Status: Deploying (75% complete)\n⏰ Estimated time: 10-15 seconds\n\nI'll notify you when it's complete!"
                }
            }
        ]
    ]
};

/**
 * Handler Functions
 */

async function handleDeploymentStatus(
    runtime: IAgentRuntime,
    query: StatusQuery,
    callback: HandlerCallback
): Promise<boolean> {
    const deploymentService = new TokenDeploymentService(
        runtime,
        runtime.getSetting("SOLANA_RPC_URL")
    );

    callback({
        text: `🔍 Checking deployment status for \`${query.identifier}\`...`,
        action: "CHECK_STATUS_LOADING"
    });

    const deployment = await deploymentService.getDeploymentStatus(query.identifier);

    if (!deployment) {
        callback({
            text: `❌ Deployment not found: \`${query.identifier}\`\n\n` +
                `This deployment doesn't exist or may have been from a previous session.`,
            action: "CHECK_STATUS_NOT_FOUND",
            error: true
        });
        return false;
    }

    // Format status based on deployment state
    const statusText = formatDeploymentStatus(deployment);
    
    callback({
        text: statusText,
        action: "CHECK_STATUS_SUCCESS",
        metadata: deployment
    });

    // If completed, also show token performance
    if (deployment.status === "completed" && deployment.tokenAddress) {
        const marketDataProvider = new MarketDataProvider(runtime);
        const marketData = await marketDataProvider.getTokenData(deployment.tokenAddress);
        
        if (marketData) {
            callback({
                text: `\n📊 **Live Token Performance:**\n\n${formatTokenPerformance(marketData)}`,
                action: "CHECK_STATUS_TOKEN_PERFORMANCE"
            });
        }
    }

    return true;
}

async function handleTokenStatus(
    runtime: IAgentRuntime,
    query: StatusQuery,
    callback: HandlerCallback
): Promise<boolean> {
    const tokenInfoProvider = new TokenInfoProvider(runtime);
    const marketDataProvider = new MarketDataProvider(runtime);

    callback({
        text: `🔍 Fetching token information...`,
        action: "CHECK_STATUS_LOADING"
    });

    // Fetch token data in parallel
    const [tokenInfo, marketData] = await Promise.all([
        tokenInfoProvider.getTokenInfo(query.identifier),
        marketDataProvider.getTokenData(query.identifier)
    ]);

    if (!tokenInfo && !marketData) {
        callback({
            text: `❌ Token not found: \`${query.identifier}\`\n\n` +
                `This token doesn't exist or is not on Pump.fun.`,
            action: "CHECK_STATUS_NOT_FOUND",
            error: true
        });
        return false;
    }

    // Comprehensive token status
    const statusText = formatTokenStatus(tokenInfo, marketData);
    
    callback({
        text: statusText,
        action: "CHECK_STATUS_SUCCESS",
        metadata: { tokenInfo, marketData }
    });

    return true;
}

async function handleTransactionStatus(
    runtime: IAgentRuntime,
    query: StatusQuery,
    callback: HandlerCallback
): Promise<boolean> {
    const { Connection } = await import("@solana/web3.js");
    const connection = new Connection(
        runtime.getSetting("SOLANA_RPC_URL"),
        "confirmed"
    );

    callback({
        text: `🔍 Checking transaction \`${query.identifier}\`...`,
        action: "CHECK_STATUS_LOADING"
    });

    try {
        const tx = await connection.getParsedTransaction(
            query.identifier,
            { maxSupportedTransactionVersion: 0 }
        );

        if (!tx) {
            callback({
                text: `❌ Transaction not found: \`${query.identifier}\`\n\n` +
                    `This transaction doesn't exist or hasn't been processed yet.`,
                action: "CHECK_STATUS_NOT_FOUND",
                error: true
            });
            return false;
        }

        const statusText = formatTransactionStatus(tx);
        
        callback({
            text: statusText,
            action: "CHECK_STATUS_SUCCESS",
            metadata: tx
        });

        return true;
    } catch (error) {
        callback({
            text: `❌ Error fetching transaction: ${error.message}`,
            action: "CHECK_STATUS_ERROR",
            error: true
        });
        return false;
    }
}

/**
 * Helper Functions
 */

function parseStatusQuery(text: string): StatusQuery | null {
    // Check for deployment ID
    const deploymentMatch = text.match(/dep_[a-zA-Z0-9]+/);
    if (deploymentMatch) {
        return {
            type: "deployment",
            identifier: deploymentMatch[0]
        };
    }

    // Check for transaction signature (longer than token address)
    const txMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{87,88}/);
    if (txMatch) {
        return {
            type: "transaction",
            identifier: txMatch[0]
        };
    }

    // Check for token address
    const tokenMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (tokenMatch) {
        return {
            type: "token",
            identifier: tokenMatch[0]
        };
    }

    return null;
}

function formatDeploymentStatus(deployment: any): string {
    const statusEmoji = {
        pending_payment: "⏳",
        payment_confirmed: "✅",
        deploying: "🚀",
        completed: "🎉",
        failed: "❌",
        refunded: "💰"
    };

    const statusText = {
        pending_payment: "Pending Payment",
        payment_confirmed: "Payment Confirmed",
        deploying: "Deploying",
        completed: "Completed",
        failed: "Failed",
        refunded: "Refunded"
    };

    let result = `📊 **Deployment Status**\n\n`;
    result += `${statusEmoji[deployment.status]} **Status:** ${statusText[deployment.status]}\n`;
    result += `🆔 **ID:** \`${deployment.deploymentId}\`\n`;

    if (deployment.status === "pending_payment") {
        result += `\n⏰ Waiting for payment confirmation...\n`;
        result += `💡 Once payment is received, deployment will start automatically.`;
    }

    if (deployment.status === "payment_confirmed") {
        result += `\n✅ Payment received and confirmed!\n`;
        result += `⏳ Deployment will begin shortly...`;
    }

    if (deployment.status === "deploying") {
        const elapsed = Date.now() - new Date(deployment.createdAt).getTime();
        const progress = Math.min(95, (elapsed / 20000) * 100); // Estimate progress
        
        result += `\n📊 **Progress:** ${progress.toFixed(0)}%\n`;
        result += `⏰ **Estimated time:** ${Math.max(5, 20 - Math.floor(elapsed / 1000))} seconds\n`;
        result += `\n🔄 Your token is being deployed to the blockchain...`;
    }

    if (deployment.status === "completed") {
        result += `\n✅ **Token Address:** \`${deployment.tokenAddress}\`\n`;
        result += `📝 **Signature:** \`${deployment.signature}\`\n`;
        result += `⏰ **Completed:** ${formatTimeAgo(deployment.completedAt)}\n`;
        result += `\n**Links:**\n`;
        result += `🔗 [View on Pump.fun](https://pump.fun/${deployment.tokenAddress})\n`;
        result += `🔍 [View on Solscan](https://solscan.io/token/${deployment.tokenAddress})\n`;
        result += `📊 [View on DEXScreener](https://dexscreener.com/solana/${deployment.tokenAddress})`;

        if (deployment.metadata) {
            result += `\n\n**Performance:**\n`;
            if (deployment.metadata.bondingCurveProgress !== undefined) {
                result += `🔄 Bonding Curve: ${deployment.metadata.bondingCurveProgress.toFixed(1)}%\n`;
            }
            if (deployment.metadata.marketCap) {
                result += `📊 Market Cap: $${formatNumber(deployment.metadata.marketCap)}\n`;
            }
            if (deployment.metadata.holders) {
                result += `👥 Holders: ${deployment.metadata.holders}`;
            }
        }
    }

    if (deployment.status === "failed") {
        result += `\n❌ **Error:** ${deployment.error || "Unknown error"}\n`;
        result += `\n💰 **Refund Status:** ${deployment.status === "refunded" ? "Processed" : "Processing..."}\n`;
        result += `💡 Your payment will be automatically refunded within 1-2 minutes.`;
    }

    return result;
}

function formatTokenStatus(tokenInfo: any, marketData: any): string {
    if (!tokenInfo && !marketData) {
        return "❌ No data available for this token.";
    }

    const info = tokenInfo || {};
    const market = marketData || {};

    let result = `📊 **Token Status**\n\n`;
    
    // Basic Info
    result += `**${info.name || "Unknown"} (${info.symbol || "???"})**\n`;
    result += `📍 Address: \`${info.address || market.address}\`\n\n`;

    // Price & Performance
    if (market.priceUSD) {
        const priceChange = market.priceChange24h >= 0 ? "+" : "";
        result += `**Market Data:**\n`;
        result += `💰 Price: $${market.priceUSD.toFixed(6)} (${market.priceSOL?.toFixed(9)} SOL)\n`;
        result += `📈 24h Change: ${priceChange}${market.priceChange24h.toFixed(2)}%\n`;
        result += `📊 Market Cap: $${formatNumber(market.marketCapUSD)}\n`;
        result += `💧 Volume 24h: $${formatNumber(market.volume24h)}\n`;
        result += `👥 Holders: ${market.holders}\n\n`;
    }

    // Pump.fun Specific
    if (info.pumpfun) {
        result += `**Pump.fun Info:**\n`;
        result += `🔄 Bonding Curve: ${info.pumpfun.bondingCurveProgress?.toFixed(1)}%\n`;
        result += `🎓 Graduated: ${info.pumpfun.isComplete ? "Yes ✅" : "No"}\n`;
        if (info.pumpfun.virtualSolReserves) {
            result += `💧 SOL Reserves: ${info.pumpfun.virtualSolReserves.toFixed(2)} SOL\n`;
        }
        result += `\n`;
    }

    // Social & Links
    if (info.social && Object.keys(info.social).some(k => info.social[k])) {
        result += `**Social Links:**\n`;
        if (info.social.twitter) result += `🐦 [Twitter](${info.social.twitter})\n`;
        if (info.social.telegram) result += `📱 [Telegram](${info.social.telegram})\n`;
        if (info.social.website) result += `🌐 [Website](${info.social.website})\n`;
        result += `\n`;
    }

    // Flags & Warnings
    if (info.flags) {
        const warnings = [];
        if (info.flags.isVerified) warnings.push("✅ Verified");
        if (info.flags.hasAudit) warnings.push("🔒 Audited");
        if (info.flags.isRug) warnings.push("⚠️ Rug Warning");
        if (info.flags.isScam) warnings.push("🚨 Scam Warning");
        if (!info.flags.hasLiquidity) warnings.push("⚠️ Low Liquidity");
        
        if (warnings.length > 0) {
            result += `**Status:** ${warnings.join(", ")}\n\n`;
        }
    }

    // Chart Links
    result += `**Charts:**\n`;
    result += `📊 [DEXScreener](https://dexscreener.com/solana/${info.address || market.address})\n`;
    result += `📈 [Birdeye](https://birdeye.so/token/${info.address || market.address}?chain=solana)`;

    return result;
}

function formatTokenPerformance(marketData: any): string {
    const priceChange = marketData.priceChange24h >= 0 ? "+" : "";
    
    return `💰 **Price:** $${marketData.priceUSD.toFixed(6)} (${priceChange}${marketData.priceChange24h.toFixed(2)}%)\n` +
        `📊 **Market Cap:** $${formatNumber(marketData.marketCapUSD)}\n` +
        `💧 **Volume 24h:** $${formatNumber(marketData.volume24h)}\n` +
        `👥 **Holders:** ${marketData.holders}\n` +
        `🔄 **Bonding Curve:** ${marketData.bondingCurveProgress?.toFixed(1)}%`;
}

function formatTransactionStatus(tx: any): string {
    const success = !tx.meta?.err;
    
    let result = `📝 **Transaction Status**\n\n`;
    result += `${success ? "✅" : "❌"} **Status:** ${success ? "Success" : "Failed"}\n`;
    result += `📍 **Signature:** \`${tx.transaction.signatures[0]}\`\n`;
    result += `⏰ **Block Time:** ${new Date(tx.blockTime! * 1000).toLocaleString()}\n`;
    result += `🔢 **Slot:** ${tx.slot}\n`;
    
    if (tx.meta?.fee) {
        result += `💸 **Fee:** ${(tx.meta.fee / 1e9).toFixed(6)} SOL\n`;
    }

    if (!success && tx.meta?.err) {
        result += `\n❌ **Error:** ${JSON.stringify(tx.meta.err)}`;
    }

    result += `\n\n🔍 [View on Solscan](https://solscan.io/tx/${tx.transaction.signatures[0]})`;

    return result;
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + "M";
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + "K";
    }
    return num.toFixed(2);
}

function formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

export default checkStatusAction;
