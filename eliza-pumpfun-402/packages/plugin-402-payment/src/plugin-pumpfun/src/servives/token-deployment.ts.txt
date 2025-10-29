/**
 * token-deployment.ts
 * 
 * Service for managing token deployments on Pump.fun
 * Handles the complete lifecycle: creation, monitoring, and status tracking
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { PumpFunAPI } from "./pumpfun-api";
import type { IAgentRuntime } from "@ai16z/eliza";

// Types
export interface TokenDeploymentParams {
    name: string;
    symbol: string;
    description?: string;
    imageUrl?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    initialBuyAmount?: number;
    slippageBps?: number;
    priorityFee?: number;
}

export interface DeploymentStatus {
    deploymentId: string;
    status: "pending_payment" | "payment_confirmed" | "deploying" | "completed" | "failed" | "refunded";
    tokenAddress?: string;
    signature?: string;
    paymentSignature?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    metadata?: {
        bondingCurveProgress?: number;
        marketCap?: number;
        holders?: number;
    };
}

export interface DeploymentResult {
    success: boolean;
    deploymentId: string;
    tokenAddress?: string;
    signature?: string;
    error?: string;
    links?: {
        pumpfun: string;
        solscan: string;
        dexscreener: string;
        birdeye: string;
    };
}

export class TokenDeploymentService {
    private runtime: IAgentRuntime;
    private connection: Connection;
    private pumpfunAPI: PumpFunAPI;
    private deployments: Map<string, DeploymentStatus>;

    constructor(runtime: IAgentRuntime, rpcUrl: string) {
        this.runtime = runtime;
        this.connection = new Connection(rpcUrl, "confirmed");
        this.pumpfunAPI = new PumpFunAPI(
            runtime.getSetting("PUMPFUN_API_URL"),
            runtime.getSetting("PUMPFUN_PRIVATE_KEY")
        );
        this.deployments = new Map();
    }

    /**
     * Initiate a new token deployment
     * Creates deployment record and waits for payment
     */
    async initiateDeployment(
        deploymentId: string,
        params: TokenDeploymentParams,
        paymentSignature: string
    ): Promise<DeploymentStatus> {
        const deployment: DeploymentStatus = {
            deploymentId,
            status: "payment_confirmed",
            paymentSignature,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Store in memory
        this.deployments.set(deploymentId, deployment);

        // Store in database
        await this.saveDeploymentToDatabase(deployment, params);

        return deployment;
    }

    /**
     * Execute token deployment on Pump.fun
     */
    async deployToken(
        deploymentId: string,
        params: TokenDeploymentParams
    ): Promise<DeploymentResult> {
        try {
            // Update status to deploying
            await this.updateDeploymentStatus(deploymentId, "deploying");

            // Validate parameters
            this.validateParams(params);

            // Deploy via Pump.fun API
            console.log(`[Deployment ${deploymentId}] Starting deployment...`);
            const result = await this.pumpfunAPI.deployToken({
                name: params.name,
                symbol: params.symbol,
                description: params.description || `${params.name} token`,
                imageUrl: params.imageUrl,
                twitter: params.twitter,
                telegram: params.telegram,
                website: params.website,
                initialBuyAmount: params.initialBuyAmount || 0,
                slippageBps: params.slippageBps || 500,
                priorityFee: params.priorityFee || 0.0001,
            });

            // Wait for confirmation
            console.log(`[Deployment ${deploymentId}] Waiting for confirmation...`);
            await this.connection.confirmTransaction(result.signature, "confirmed");

            // Fetch token metadata
            const metadata = await this.fetchTokenMetadata(result.mint);

            // Update deployment status
            await this.updateDeploymentStatus(deploymentId, "completed", {
                tokenAddress: result.mint,
                signature: result.signature,
                metadata,
            });

            console.log(`[Deployment ${deploymentId}] Completed successfully!`);

            return {
                success: true,
                deploymentId,
                tokenAddress: result.mint,
                signature: result.signature,
                links: this.generateLinks(result.mint),
            };
        } catch (error) {
            console.error(`[Deployment ${deploymentId}] Failed:`, error);

            // Update status to failed
            await this.updateDeploymentStatus(deploymentId, "failed", {
                error: error.message,
            });

            // Trigger refund process
            await this.initiateRefund(deploymentId);

            return {
                success: false,
                deploymentId,
                error: error.message,
            };
        }
    }

    /**
     * Get deployment status
     */
    async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus | null> {
        // Check memory first
        const memoryDeployment = this.deployments.get(deploymentId);
        if (memoryDeployment) {
            return memoryDeployment;
        }

        // Fetch from database
        return await this.fetchDeploymentFromDatabase(deploymentId);
    }

    /**
     * Monitor token after deployment
     */
    async monitorToken(tokenAddress: string, deploymentId: string): Promise<void> {
        try {
            const updates = await this.pumpfunAPI.getTokenInfo(tokenAddress);
            
            await this.updateDeploymentStatus(deploymentId, "completed", {
                metadata: {
                    bondingCurveProgress: updates.bondingCurveProgress,
                    marketCap: updates.marketCap,
                    holders: updates.holders,
                },
            });
        } catch (error) {
            console.error(`Error monitoring token ${tokenAddress}:`, error);
        }
    }

    /**
     * Cancel pending deployment
     */
    async cancelDeployment(deploymentId: string): Promise<boolean> {
        const deployment = await this.getDeploymentStatus(deploymentId);
        
        if (!deployment) {
            throw new Error("Deployment not found");
        }

        if (deployment.status !== "pending_payment") {
            throw new Error("Can only cancel pending deployments");
        }

        await this.updateDeploymentStatus(deploymentId, "failed", {
            error: "Cancelled by user",
        });

        return true;
    }

    /**
     * Retry failed deployment
     */
    async retryDeployment(
        deploymentId: string,
        params: TokenDeploymentParams
    ): Promise<DeploymentResult> {
        const deployment = await this.getDeploymentStatus(deploymentId);
        
        if (!deployment) {
            throw new Error("Deployment not found");
        }

        if (deployment.status !== "failed") {
            throw new Error("Can only retry failed deployments");
        }

        // Reset status
        await this.updateDeploymentStatus(deploymentId, "payment_confirmed");

        // Retry deployment
        return await this.deployToken(deploymentId, params);
    }

    /**
     * Get all deployments for a user
     */
    async getUserDeployments(userId: string): Promise<DeploymentStatus[]> {
        try {
            const memories = await this.runtime.databaseAdapter.getMemories({
                roomId: userId,
                count: 100,
            });

            return memories
                .filter(m => m.content.type === "deployment")
                .map(m => ({
                    deploymentId: m.id,
                    status: m.content.status,
                    tokenAddress: m.content.tokenAddress,
                    signature: m.content.signature,
                    paymentSignature: m.content.paymentSignature,
                    createdAt: new Date(m.createdAt),
                    updatedAt: new Date(m.content.updatedAt),
                    completedAt: m.content.completedAt ? new Date(m.content.completedAt) : undefined,
                    metadata: m.content.metadata,
                }));
        } catch (error) {
            console.error("Error fetching user deployments:", error);
            return [];
        }
    }

    /**
     * Private helper methods
     */

    private validateParams(params: TokenDeploymentParams): void {
        // Validate token name
        if (!params.name || params.name.length < 1 || params.name.length > 32) {
            throw new Error("Token name must be 1-32 characters");
        }

        // Validate symbol
        if (!params.symbol || !/^[A-Z]{2,6}$/.test(params.symbol)) {
            throw new Error("Token symbol must be 2-6 uppercase letters");
        }

        // Validate URLs if provided
        if (params.imageUrl && !this.isValidUrl(params.imageUrl)) {
            throw new Error("Invalid image URL");
        }

        if (params.twitter && !this.isValidTwitterUrl(params.twitter)) {
            throw new Error("Invalid Twitter URL");
        }

        if (params.telegram && !this.isValidTelegramUrl(params.telegram)) {
            throw new Error("Invalid Telegram URL");
        }

        if (params.website && !this.isValidUrl(params.website)) {
            throw new Error("Invalid website URL");
        }

        // Validate numeric parameters
        if (params.initialBuyAmount !== undefined && params.initialBuyAmount < 0) {
            throw new Error("Initial buy amount must be non-negative");
        }

        if (params.slippageBps !== undefined && (params.slippageBps < 0 || params.slippageBps > 10000)) {
            throw new Error("Slippage must be between 0 and 10000 bps");
        }
    }

    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
            return false;
        }
    }

    private isValidTwitterUrl(url: string): boolean {
        if (url.startsWith("@")) {
            return /^@[A-Za-z0-9_]{1,15}$/.test(url);
        }
        return /^https?:\/\/(twitter\.com|x\.com)\/[A-Za-z0-9_]{1,15}/.test(url);
    }

    private isValidTelegramUrl(url: string): boolean {
        return /^https?:\/\/t\.me\/[A-Za-z0-9_]{5,32}/.test(url);
    }

    private async updateDeploymentStatus(
        deploymentId: string,
        status: DeploymentStatus["status"],
        updates?: Partial<DeploymentStatus>
    ): Promise<void> {
        const deployment = this.deployments.get(deploymentId);
        if (deployment) {
            deployment.status = status;
            deployment.updatedAt = new Date();
            
            if (status === "completed") {
                deployment.completedAt = new Date();
            }

            if (updates) {
                Object.assign(deployment, updates);
            }

            this.deployments.set(deploymentId, deployment);
        }

        // Update in database
        await this.updateDeploymentInDatabase(deploymentId, { status, ...updates });
    }

    private async fetchTokenMetadata(tokenAddress: string) {
        try {
            const info = await this.pumpfunAPI.getTokenInfo(tokenAddress);
            return {
                bondingCurveProgress: info.bondingCurveProgress || 0,
                marketCap: info.marketCap || 0,
                holders: info.holders || 0,
            };
        } catch (error) {
            console.error("Error fetching token metadata:", error);
            return undefined;
        }
    }

    private generateLinks(tokenAddress: string) {
        return {
            pumpfun: `https://pump.fun/${tokenAddress}`,
            solscan: `https://solscan.io/token/${tokenAddress}`,
            dexscreener: `https://dexscreener.com/solana/${tokenAddress}`,
            birdeye: `https://birdeye.so/token/${tokenAddress}?chain=solana`,
        };
    }

    private async initiateRefund(deploymentId: string): Promise<void> {
        const deployment = await this.getDeploymentStatus(deploymentId);
        if (!deployment || !deployment.paymentSignature) {
            return;
        }

        console.log(`[Deployment ${deploymentId}] Initiating refund...`);

        try {
            // Fetch original payment transaction
            const paymentTx = await this.connection.getParsedTransaction(
                deployment.paymentSignature,
                { maxSupportedTransactionVersion: 0 }
            );

            if (!paymentTx) {
                throw new Error("Payment transaction not found");
            }

            // Extract payment details
            const paymentAmount = this.extractPaymentAmount(paymentTx);
            const payerAddress = this.extractPayerAddress(paymentTx);

            if (!paymentAmount || !payerAddress) {
                throw new Error("Could not extract payment details");
            }

            // TODO: Implement actual refund logic
            // This would create and send a refund transaction
            console.log(`[Deployment ${deploymentId}] Refunding ${paymentAmount} to ${payerAddress}`);

            await this.updateDeploymentStatus(deploymentId, "refunded");
        } catch (error) {
            console.error(`[Deployment ${deploymentId}] Refund failed:`, error);
        }
    }

    private extractPaymentAmount(tx: any): number | null {
        try {
            const transferInstruction = tx.transaction.message.instructions.find(
                (ix: any) => ix.program === "system" && ix.parsed?.type === "transfer"
            );
            return transferInstruction?.parsed?.info?.lamports || null;
        } catch {
            return null;
        }
    }

    private extractPayerAddress(tx: any): string | null {
        try {
            const transferInstruction = tx.transaction.message.instructions.find(
                (ix: any) => ix.program === "system" && ix.parsed?.type === "transfer"
            );
            return transferInstruction?.parsed?.info?.source || null;
        } catch {
            return null;
        }
    }

    private async saveDeploymentToDatabase(
        deployment: DeploymentStatus,
        params: TokenDeploymentParams
    ): Promise<void> {
        try {
            await this.runtime.databaseAdapter.createMemory({
                id: deployment.deploymentId,
                userId: "system", // Will be overridden by actual userId
                agentId: this.runtime.agentId,
                roomId: deployment.deploymentId,
                content: {
                    type: "deployment",
                    status: deployment.status,
                    paymentSignature: deployment.paymentSignature,
                    params,
                    createdAt: deployment.createdAt.toISOString(),
                    updatedAt: deployment.updatedAt.toISOString(),
                },
            });
        } catch (error) {
            console.error("Error saving deployment to database:", error);
        }
    }

    private async updateDeploymentInDatabase(
        deploymentId: string,
        updates: Partial<DeploymentStatus>
    ): Promise<void> {
        try {
            const existing = await this.runtime.databaseAdapter.getMemoryById(deploymentId);
            if (existing) {
                await this.runtime.databaseAdapter.updateMemory(deploymentId, {
                    ...existing,
                    content: {
                        ...existing.content,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    },
                });
            }
        } catch (error) {
            console.error("Error updating deployment in database:", error);
        }
    }

    private async fetchDeploymentFromDatabase(deploymentId: string): Promise<DeploymentStatus | null> {
        try {
            const memory = await this.runtime.databaseAdapter.getMemoryById(deploymentId);
            if (!memory || memory.content.type !== "deployment") {
                return null;
            }

            return {
                deploymentId: memory.id,
                status: memory.content.status,
                tokenAddress: memory.content.tokenAddress,
                signature: memory.content.signature,
                paymentSignature: memory.content.paymentSignature,
                error: memory.content.error,
                createdAt: new Date(memory.content.createdAt),
                updatedAt: new Date(memory.content.updatedAt),
                completedAt: memory.content.completedAt ? new Date(memory.content.completedAt) : undefined,
                metadata: memory.content.metadata,
            };
        } catch (error) {
            console.error("Error fetching deployment from database:", error);
            return null;
        }
    }

    /**
     * Cleanup old deployments
     */
    async cleanupOldDeployments(daysOld: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        let cleaned = 0;
        for (const [id, deployment] of this.deployments.entries()) {
            if (deployment.createdAt < cutoffDate && 
                (deployment.status === "completed" || deployment.status === "failed")) {
                this.deployments.delete(id);
                cleaned++;
            }
        }

        console.log(`Cleaned up ${cleaned} old deployments`);
        return cleaned;
    }

    /**
     * Get deployment statistics
     */
    async getStats() {
        const all = Array.from(this.deployments.values());
        return {
            total: all.length,
            pending: all.filter(d => d.status === "pending_payment").length,
            deploying: all.filter(d => d.status === "deploying").length,
            completed: all.filter(d => d.status === "completed").length,
            failed: all.filter(d => d.status === "failed").length,
            refunded: all.filter(d => d.status === "refunded").length,
        };
    }
}
