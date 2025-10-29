
```typescript
import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@ai16z/eliza";
import { PumpFunService } from "../services/pumpfun-api";

export const deployTokenAction: Action = {
    name: "DEPLOY_TOKEN",
    similes: ["CREATE_TOKEN", "LAUNCH_TOKEN", "MINT_TOKEN"],
    description: "Deploys a new token on Pump.fun",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Only allow if payment has been verified
        const deploymentId = extractDeploymentId(message.content.text);
        if (!deploymentId) return false;

        const deployment = await runtime.databaseAdapter.getMemoryById(deploymentId);
        return deployment?.content?.status === "payment_confirmed";
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            const deploymentId = extractDeploymentId(message.content.text);
            const deployment = await runtime.databaseAdapter.getMemoryById(deploymentId);
            
            if (!deployment) {
                throw new Error("Deployment not found");
            }

            const params = deployment.content.deploymentParams;
            
            // Initialize Pump.fun service
            const pumpfun = new PumpFunService(
                runtime.getSetting("PUMPFUN_API_URL"),
                runtime.getSetting("PUMPFUN_PRIVATE_KEY")
            );

            // Update status
            await runtime.databaseAdapter.updateMemory(deploymentId, {
                ...deployment,
                content: {
                    ...deployment.content,
                    status: "deploying"
                }
            });

            callback({
                text: `🚀 Deploying ${params.tokenName} (${params.tokenSymbol})...\n\nThis will take about 10-20 seconds.`,
                action: "DEPLOYMENT_STARTED"
            });

            // Deploy token
            const result = await pumpfun.deployToken({
                name: params.tokenName,
                symbol: params.tokenSymbol,
                description: params.description || `${params.tokenName} token`,
                imageUrl: params.imageUrl,
                twitter: params.twitter,
                telegram: params.telegram,
                website: params.website,
                initialBuyAmount: params.initialBuyAmount || 0,
                slippageBps: params.slippageBps || 500,
                priorityFee: params.priorityFee || 0.0001
            });

            // Update with results
            await runtime.databaseAdapter.updateMemory(deploymentId, {
                ...deployment,
                content: {
                    ...deployment.content,
                    status: "completed",
                    tokenAddress: result.mint,
                    signature: result.signature,
                    completedAt: new Date()
                }
            });

            callback({
                text: formatDeploymentSuccess(result, params),
                action: "DEPLOYMENT_COMPLETED",
                metadata: result
            });

            return true;
        } catch (error) {
            console.error("Deployment error:", error);
            
            callback({
                text: `❌ Deployment failed: ${error.message}\n\nDon't worry, you'll receive a refund automatically.`,
                action: "DEPLOYMENT_FAILED",
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
                    text: "Deploy deployment dep_abc123"
                }
            },
            {
                user: "{{agent}}",
                content: {
                    text: "🚀 Token deployed successfully!\n\n✅ MoonCoin (MOON)\n📍 Address: 7xKXtg2CW87...\n🔗 https://pump.fun/7xKXtg2CW87..."
                }
            }
        ]
    ]
};

function extractDeploymentId(text: string): string | null {
    const match = text.match(/dep_[a-zA-Z0-9]+/);
    return match ? match[0] : null;
}

function formatDeploymentSuccess(result: any, params: any): string {
    return `🎉 **${params.tokenName}** deployed successfully!

✅ **Token Address:** \`${result.mint}\`
🔗 **Pump.fun:** https://pump.fun/${result.mint}
🔍 **Solscan:** https://solscan.io/token/${result.mint}
📊 **DEXScreener:** https://dexscreener.com/solana/${result.mint}
📝 **Signature:** \`${result.signature}\`

Your token is now live on Pump.fun! 🚀`;
}
```
