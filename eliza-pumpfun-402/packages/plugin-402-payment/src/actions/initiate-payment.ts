```typescript
import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@ai16z/eliza";
import { PublicKey } from "@solana/web3.js";
import { v4 as uuidv4 } from "uuid";

export const initiatePaymentAction: Action = {
    name: "INITIATE_PAYMENT",
    similes: ["START_PAYMENT", "REQUEST_PAYMENT", "CREATE_PAYMENT"],
    description: "Initiates a 402 payment request for token deployment",
    
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const hasDeploymentRequest = 
            message.content.text.toLowerCase().includes("deploy") ||
            message.content.text.toLowerCase().includes("create token");
        return hasDeploymentRequest;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            // Extract deployment parameters from message
            const deploymentParams = extractDeploymentParams(message.content.text);
            
            // Generate unique deployment ID
            const deploymentId = `dep_${uuidv4()}`;
            
            // Get payment wallet from runtime
            const paymentWallet = new PublicKey(
                runtime.getSetting("PAYMENT_WALLET_ADDRESS")
            );
            
            // Calculate price
            const priceSOL = parseFloat(runtime.getSetting("PRICE_PER_DEPLOYMENT_SOL"));
            const priceLamports = priceSOL * 1e9;
            
            // Create payment memo
            const memo = `PUMPFUN_DEPLOY_${deploymentId}`;
            
            // Store deployment request in database
            await runtime.databaseAdapter.createMemory({
                id: deploymentId,
                userId: message.userId,
                agentId: message.agentId,
                roomId: message.roomId,
                content: {
                    type: "payment_request",
                    deploymentParams,
                    paymentWallet: paymentWallet.toBase58(),
                    amount: priceSOL,
                    amountLamports: priceLamports,
                    memo,
                    status: "pending_payment",
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
                }
            });
            
            // Generate response
            const response = {
                status: 402,
                message: "Payment Required",
                deploymentId,
                payment: {
                    address: paymentWallet.toBase58(),
                    amount: priceSOL,
                    token: "SOL",
                    amountLamports: priceLamports,
                    memo,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                    deepLink: `solana:${paymentWallet.toBase58()}?amount=${priceSOL}&memo=${memo}`
                },
                deploymentParams
            };
            
            callback({
                text: formatPaymentResponse(response),
                action: "PAYMENT_INITIATED",
                metadata: response
            });
            
            return true;
        } catch (error) {
            console.error("Error initiating payment:", error);
            callback({
                text: "Sorry, I encountered an error creating the payment request. Please try again.",
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
                    text: "Deploy a token called MoonCoin with symbol MOON"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I can deploy that token for you! Here's your payment request:\n\nDeployment ID: dep_abc123\nAmount: 0.01 SOL\nPayment Address: 7xKXtg2...\n\nSend the payment with memo: PUMPFUN_DEPLOY_dep_abc123\n\nOnce I receive your payment, I'll deploy the token immediately!"
                }
            }
        ]
    ]
};

function extractDeploymentParams(text: string) {
    // Parse token parameters from natural language
    // This is a simplified version - implement proper NLP parsing
    const params: any = {};
    
    const nameMatch = text.match(/called\s+([A-Za-z0-9\s]+?)(?:\s+with|\s*$)/i);
    if (nameMatch) params.tokenName = nameMatch[1].trim();
    
    const symbolMatch = text.match(/symbol\s+([A-Z0-9]+)/i);
    if (symbolMatch) params.tokenSymbol = symbolMatch[1];
    
    return params;
}

function formatPaymentResponse(response: any): string {
    return `I can deploy **${response.deploymentParams.tokenName}** for you!

**Payment Required:**
💰 Amount: ${response.payment.amount} SOL
📍 Address: \`${response.payment.address}\`
📝 Memo: \`${response.payment.memo}\`
🆔 Deployment ID: \`${response.deploymentId}\`

**Payment Link:**
${response.payment.deepLink}

Send the exact amount with the memo included. I'll deploy your token as soon as payment is confirmed! ⚡`;
}
```
