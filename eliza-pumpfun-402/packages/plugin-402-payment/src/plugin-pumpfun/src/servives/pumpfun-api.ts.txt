import axios from "axios";
import { Keypair, Connection, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export interface DeployTokenParams {
    name: string;
    symbol: string;
    description: string;
    imageUrl?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    initialBuyAmount?: number;
    slippageBps?: number;
    priorityFee?: number;
}

export interface DeployTokenResult {
    mint: string;
    signature: string;
    metadataUri?: string;
}

export class PumpFunService {
    private apiUrl: string;
    private keypair: Keypair;
    private connection: Connection;

    constructor(apiUrl: string, privateKey: string) {
        this.apiUrl = apiUrl;
        this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        this.connection = new Connection(
            "https://api.mainnet-beta.solana.com",
            "confirmed"
        );
    }

    async deployToken(params: DeployTokenParams): Promise {
        try {
            // Create token metadata
            const formData = new FormData();
            formData.append("name", params.name);
            formData.append("symbol", params.symbol);
            formData.append("description", params.description);
            
            if (params.imageUrl) {
                // Download and upload image
                const imageResponse = await axios.get(params.imageUrl, {
                    responseType: "arraybuffer"
                });
                const imageBlob = new Blob([imageResponse.data]);
                formData.append("file", imageBlob, "image.png");
            }

            if (params.twitter) formData.append("twitter", params.twitter);
            if (params.telegram) formData.append("telegram", params.telegram);
            if (params.website) formData.append("website", params.website);

            // Upload metadata to IPFS via Pump.fun
            const metadataResponse = await axios.post(
                `${this.apiUrl}/ipfs`,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" }
                }
            );

            const metadataUri = metadataResponse.data.metadataUri;

            // Create token deployment transaction
            const deployResponse = await axios.post(
                `${this.apiUrl}/trade`,
                {
                    publicKey: this.keypair.publicKey.toBase58(),
                    action: "create",
                    tokenMetadata: {
                        name: params.name,
                        symbol: params.symbol,
                        uri: metadataUri
                    },
                    mint: Keypair.generate().publicKey.toBase58(),
                    denominatedInSol: "true",
                    amount: params.initialBuyAmount || 0,
                    slippage: params.slippageBps || 500,
                    priorityFee: params.priorityFee || 0.0001
                }
            );

            // Sign and send transaction
            const transaction = VersionedTransaction.deserialize(
                Buffer.from(deployResponse.data, "base64")
            );
            
            transaction.sign([this.keypair]);

            const signature = await this.connection.sendTransaction(transaction);
            
            // Wait for confirmation
            await this.connection.confirmTransaction(signature, "confirmed");

            return {
                mint: deployResponse.data.mint,
                signature,
                metadataUri
            };
        } catch (error) {
            console.error("Pump.fun deployment error:", error);
            throw new Error(`Failed to deploy token: ${error.message}`);
        }
    }

    async getTokenInfo(mintAddress: string) {
        try {
            const response = await axios.get(
                `${this.apiUrl}/coins/${mintAddress}`
            );
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get token info: ${error.message}`);
        }
    }
}
```

### `/agent/src/character.ts`

```typescript
import { Character } from "@ai16z/eliza";

export const pumpfun402Character: Character = {
    name: "PumpBot",
    username: "pumpbot",
    bio: [
        "I'm PumpBot, your 402 payment-enabled token deployment assistant.",
        "I help you deploy tokens on Pump.fun using secure Solana payments.",
        "Send me SOL, and I'll handle the rest - it's that simple!"
    ],
    lore: [
        "Built on the HTTP 402 Payment Required standard",
        "Powered by Solana's lightning-fast blockchain",
        "Connected to Pump.fun for seamless token launches",
        "Designed for AI agents and automated systems"
    ],
    messageExamples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to deploy a token called MoonCoin"
                }
            },
            {
                user: "PumpBot",
                content: {
                    text: "Great! I can deploy MoonCoin for you. Send 0.01 SOL to my payment address and I'll get it deployed right away!"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How much does it cost?"
                }
            },
            {
                user: "PumpBot",
                content: {
                    text: "Token deployment costs 0.01 SOL (about $1.50). This includes the Pump.fun deployment fee and my service fee. Payment is verified on-chain before deployment."
                }
            }
        ]
    ],
    postExamples: [],
    topics: [
        "token deployment",
        "pump.fun",
        "solana payments",
        "402 payment protocol",
        "blockchain",
        "cryptocurrency"
    ],
    style: {
        all: [
            "professional and helpful",
            "clear about payment requirements",
            "transparent about costs",
            "quick to respond",
            "uses emojis appropriately"
        ],
        chat: [
            "friendly but businesslike",
            "provides exact payment details",
            "confirms actions before executing"
        ],
        post: [
            "informative about token launches",
            "celebrates successful deployments"
        ]
    },
    adjectives: [
        "efficient",
        "reliable",
        "transparent",
        "secure",
        "fast"
    ]
};
```
