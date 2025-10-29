/**
 * buy-token.ts
 * 
 * Action for buying tokens on Pump.fun through the agent
 * Handles token purchases with safety checks and transaction monitoring
 */

import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@ai16z/eliza";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import axios from "axios";
import { TokenInfoProvider } from "../providers/token-info";
import { MarketDataProvider } from "../providers/market-data";

// Types
interface BuyTokenParams {
    tokenAddress: string;
    amountSOL: number;
    slippageBps?: number;
    priorityFee?: number;
    userWallet: string;
}

interface BuyResult {
    success: boolean;
    signature?: string;
    tokenAmount?: number;
    pricePerToken?: number;
    totalCostSOL?: number;
    error?: string;
}

export const buyTokenAction: Action = {
    name: "BUY_TOKEN",
    similes: ["PURCHASE_TOKEN", "SWAP_FOR_TOKEN", "GET_TOKEN", "ACQUIRE_TOKEN"],
    description: "Buys a token on Pump.fun for the user",
    
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        
        // Check if message is about buying
        const isBuyIntent = 
            text.includes("buy") ||
            text.includes("purchase") ||
            text.includes("swap") ||
            text.includes("get");
        
        // Check if token address is present
        const hasTokenAddress = /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(message.content.text);
        
        // Check if amount is mentioned
        const hasAmount = /\d+\.?\d*\s*(sol|SOL)/.test(message.content.text);
        
        return isBuyIntent && (hasTokenAddress || hasAmount);
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            // Extract parameters from message
            const params = extractBuyParams(message.content.text);
            
            if (!params.tokenAddress) {
                callback({
                    text: "I need a token address to buy. Please provide the Solana token address you want to purchase.",
                    action: "BUY_TOKEN_MISSING_ADDRESS"
                });
                return false;
            }

            if (!params.amountSOL || params.amountSOL <= 0) {
                callback({
                    text: "Please specify how much SOL you want to spend. Example: 'buy 0.1 SOL worth of [token]'",
                    action: "BUY_TOKEN_MISSING_AMOUNT"
                });
                return false;
            }

            // Initialize providers
            const tokenInfoProvider = new TokenInfoProvider(runtime);
            const marketDataProvider = new MarketDataProvider(runtime);

            // Step 1: Validate token
            callback({
                text: `🔍 Validating token ${params.tokenAddress}...`,
                action: "BUY_TOKEN_VALIDATING"
            });

            const validation = await tokenInfoProvider.validateToken(params.tokenAddress);
            
            if (!validation.isValid || !validation.exists) {
                callback({
                    text: `❌ Invalid or non-existent token address: ${params.tokenAddress}\n\nPlease check the address and try again.`,
                    action: "BUY_TOKEN_INVALID",
                    error: true
                });
                return false;
            }

            if (!validation.isPumpfun) {
                callback({
                    text: `⚠️ This token is not on Pump.fun. I can only buy tokens that are on Pump.fun.\n\nToken: ${params.tokenAddress}`,
                    action: "BUY_TOKEN_NOT_PUMPFUN",
                    error: true
                });
                return false;
            }

            // Step 2: Safety checks
            const tokenInfo = await tokenInfoProvider.getTokenInfo(params.tokenAddress);
            const marketData = await marketDataProvider.getTokenData(params.tokenAddress);

            if (!tokenInfo || !marketData) {
                callback({
                    text: "❌ Could not fetch token information. Please try again later.",
                    action: "BUY_TOKEN_INFO_ERROR",
                    error: true
                });
                return false;
            }

            // Check safety flags
            const warnings = [];
            if (tokenInfo.flags.isRug) warnings.push("⚠️ **RUG PULL WARNING** - Token flagged as potential rug");
            if (tokenInfo.flags.isScam) warnings.push("🚨 **SCAM WARNING** - Token flagged as potential scam");
            if (!tokenInfo.flags.hasLiquidity) warnings.push("⚠️ Low liquidity - May be hard to sell");
            if (tokenInfo.pumpfun.bondingCurveProgress < 5) warnings.push("ℹ️ Very early stage (< 5% bonding curve)");

            // If dangerous warnings, require explicit confirmation
            if (tokenInfo.flags.isRug || tokenInfo.flags.isScam) {
                callback({
                    text: `🚨 **DANGER: This token has serious warnings!**\n\n${warnings.join("\n")}\n\n**Token:** ${tokenInfo.name} (${tokenInfo.symbol})\n**Address:** ${params.tokenAddress}\n\nI cannot proceed with this purchase due to safety concerns. This token appears to be dangerous.`,
                    action: "BUY_TOKEN_UNSAFE",
                    error: true
                });
                return false;
            }

            // Step 3: Show purchase preview
            const estimatedTokens = estimateTokenAmount(
                params.amountSOL,
                marketData.priceSOL,
                params.slippageBps || 500
            );

            const previewText = formatBuyPreview(
                tokenInfo,
                marketData,
                params,
                estimatedTokens,
                warnings
            );

            callback({
                text: previewText,
                action: "BUY_TOKEN_PREVIEW"
            });

            // In a real implementation, you would:
            // 1. Request user confirmation
            // 2. Create transaction
            // 3. Request signature from user
            // 4. Submit transaction
            // 5. Monitor for completion
            
            // For this demo, we'll simulate the process
            callback({
                text: `⚠️ **Important:** To complete this purchase, you need to:\n\n1. Approve the transaction in your wallet\n2. Sign the transaction\n3. Wait for confirmation\n\nThis is a simulated action. In production, I would create a real transaction for you to sign.`,
                action: "BUY_TOKEN_PENDING_CONFIRMATION"
            });

            // Simulate buy execution (in production, this would be real)
            const result = await simulateBuyExecution(runtime, params);

            if (result.success) {
                callback({
                    text: formatBuySuccess(tokenInfo, result),
                    action: "BUY_TOKEN_SUCCESS",
                    metadata: result
                });
                return true;
            } else {
                callback({
                    text: `❌ Purchase failed: ${result.error}\n\nPlease try again or contact support if the issue persists.`,
                    action: "BUY_TOKEN_FAILED",
                    error: true
                });
                return false;
            }

        } catch (error) {
            console.error("Buy token error:", error);
            callback({
                text: `❌ An error occurred while processing your purchase: ${error.message}\n\nPlease try again later.`,
                action: "BUY_TOKEN_ERROR",
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
                    text: "Buy 0.1 SOL worth of 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "🔍 Let me check that token for you...\n\n✅ Token validated: MoonCoin (MOON)\n💰 Price: $0.000123 (0.000000821 SOL)\n📊 Estimated tokens: ~121,800 MOON\n\nReady to proceed with the purchase?"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to buy some BONK"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I can help you buy BONK! I need two things:\n\n1. The token address (Solana address)\n2. How much SOL you want to spend\n\nPlease provide these details."
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Buy 1 SOL of that token we just deployed"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "🚀 Great! I'll help you buy your newly deployed token.\n\n⏳ Creating transaction for 1 SOL purchase...\n\nPlease approve the transaction in your wallet when prompted."
                }
            }
        ]
    ]
};

/**
 * Helper Functions
 */

function extractBuyParams(text: string): Partial<BuyTokenParams> {
    const params: Partial<BuyTokenParams> = {};

    // Extract token address
    const addressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (addressMatch) {
        params.tokenAddress = addressMatch[0];
    }

    // Extract SOL amount
    const amountMatch = text.match(/(\d+\.?\d*)\s*(sol|SOL)/i);
    if (amountMatch) {
        params.amountSOL = parseFloat(amountMatch[1]);
    }

    // Extract slippage if specified
    const slippageMatch = text.match(/(\d+\.?\d*)%?\s*slippage/i);
    if (slippageMatch) {
        params.slippageBps = parseFloat(slippageMatch[1]) * 100; // Convert to basis points
    } else {
        params.slippageBps = 500; // Default 5%
    }

    // Default priority fee
    params.priorityFee = 0.0001;

    return params;
}

function estimateTokenAmount(
    solAmount: number,
    pricePerTokenSOL: number,
    slippageBps: number
): number {
    // Account for slippage
    const slippageMultiplier = 1 - (slippageBps / 10000);
    const tokensBeforeSlippage = solAmount / pricePerTokenSOL;
    return tokensBeforeSlippage * slippageMultiplier;
}

function formatBuyPreview(
    tokenInfo: any,
    marketData: any,
    params: Partial<BuyTokenParams>,
    estimatedTokens: number,
    warnings: string[]
): string {
    const priceChange = marketData.priceChange24h >= 0 ? "+" : "";
    
    let preview = `📋 **Purchase Preview**\n\n`;
    preview += `**Token:** ${tokenInfo.name} (${tokenInfo.symbol})\n`;
    preview += `**Address:** \`${params.tokenAddress}\`\n\n`;
    
    preview += `**Purchase Details:**\n`;
    preview += `💰 Amount: ${params.amountSOL} SOL (~$${(params.amountSOL! * 150).toFixed(2)})\n`;
    preview += `📊 Current Price: $${marketData.priceUSD.toFixed(6)} (${marketData.priceSOL.toFixed(9)} SOL)\n`;
    preview += `📈 24h Change: ${priceChange}${marketData.priceChange24h.toFixed(2)}%\n`;
    preview += `🎯 Estimated Tokens: ~${estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${tokenInfo.symbol}\n`;
    preview += `⚡ Slippage Tolerance: ${(params.slippageBps! / 100).toFixed(1)}%\n`;
    preview += `💸 Priority Fee: ${params.priorityFee} SOL\n\n`;
    
    if (warnings.length > 0) {
        preview += `**⚠️ Warnings:**\n${warnings.join("\n")}\n\n`;
    }
    
    preview += `**Token Info:**\n`;
    preview += `🔄 Bonding Curve: ${tokenInfo.pumpfun.bondingCurveProgress.toFixed(1)}%\n`;
    preview += `👥 Holders: ${marketData.holders}\n`;
    preview += `📊 Market Cap: $${formatNumber(marketData.marketCapUSD)}\n`;
    preview += `💧 Liquidity: $${formatNumber(tokenInfo.pumpfun.virtualSolReserves * 150)}\n`;
    
    if (tokenInfo.flags.isVerified) {
        preview += `\n✅ Verified Token`;
    }
    
    preview += `\n\n⏳ Ready to proceed? Please confirm to execute the trade.`;
    
    return preview;
}

function formatBuySuccess(tokenInfo: any, result: BuyResult): string {
    return `✅ **Purchase Successful!**\n\n` +
        `🎉 You received **${result.tokenAmount!.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenInfo.symbol}**\n\n` +
        `**Transaction Details:**\n` +
        `📝 Signature: \`${result.signature}\`\n` +
        `💰 Total Cost: ${result.totalCostSOL} SOL\n` +
        `📊 Price per Token: ${result.pricePerToken!.toFixed(9)} SOL\n\n` +
        `**Links:**\n` +
        `🔍 [View on Solscan](https://solscan.io/tx/${result.signature})\n` +
        `📊 [View on DEXScreener](https://dexscreener.com/solana/${tokenInfo.address})\n\n` +
        `Your tokens have been added to your wallet! 🚀`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + "M";
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + "K";
    }
    return num.toFixed(2);
}

async function simulateBuyExecution(
    runtime: IAgentRuntime,
    params: Partial<BuyTokenParams>
): Promise<BuyResult> {
    // In production, this would:
    // 1. Create a Pump.fun swap transaction
    // 2. Sign with user's wallet
    // 3. Submit to Solana
    // 4. Wait for confirmation
    // 5. Return actual results

    // Simulated for demo purposes
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                success: true,
                signature: "5wHu8W5N4KqgZz3nP8K1234567890abcdef",
                tokenAmount: 121800,
                pricePerToken: 0.000000821,
                totalCostSOL: params.amountSOL,
            });
        }, 2000);
    });
}

/**
 * Real buy execution (commented out for safety)
 * Uncomment and implement when ready for production
 */
/*
async function executeBuy(
    runtime: IAgentRuntime,
    params: BuyTokenParams
): Promise<BuyResult> {
    try {
        const connection = new Connection(
            runtime.getSetting("SOLANA_RPC_URL"),
            "confirmed"
        );
        
        const pumpfunApiUrl = runtime.getSetting("PUMPFUN_API_URL");
        
        // Create swap transaction
        const response = await axios.post(
            `${pumpfunApiUrl}/trade`,
            {
                publicKey: params.userWallet,
                action: "buy",
                mint: params.tokenAddress,
                amount: params.amountSOL,
                denominatedInSol: "true",
                slippage: params.slippageBps,
                priorityFee: params.priorityFee,
            }
        );
        
        // Deserialize transaction
        const transaction = VersionedTransaction.deserialize(
            Buffer.from(response.data, "base64")
        );
        
        // In production: Send to user for signing via wallet adapter
        // For now, return transaction data
        
        return {
            success: true,
            signature: "pending_user_signature",
            tokenAmount: 0, // Will be calculated after execution
            pricePerToken: 0,
            totalCostSOL: params.amountSOL,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}
*/
