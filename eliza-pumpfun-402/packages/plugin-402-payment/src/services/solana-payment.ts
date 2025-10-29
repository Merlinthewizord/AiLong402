
import {
    Connection,
    PublicKey,
    ParsedTransactionWithMeta,
    ParsedInstruction
} from "@solana/web3.js";

export class SolanaPaymentService {
    private connection: Connection;
    private paymentWallet: PublicKey;

    constructor(rpcUrl: string, paymentWallet: string) {
        this.connection = new Connection(rpcUrl, "confirmed");
        this.paymentWallet = new PublicKey(paymentWallet);
    }

    async monitorPayment(
        expectedAmount: number,
        expectedMemo: string,
        timeoutMs: number = 300000
    ): Promise {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const signatures = await this.connection.getSignaturesForAddress(
                this.paymentWallet,
                { limit: 10 }
            );

            for (const sigInfo of signatures) {
                const tx = await this.connection.getParsedTransaction(
                    sigInfo.signature,
                    { maxSupportedTransactionVersion: 0 }
                );

                if (tx && this.verifyPayment(tx, expectedAmount, expectedMemo)) {
                    return sigInfo.signature;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return null;
    }

    private verifyPayment(
        tx: ParsedTransactionWithMeta,
        expectedAmount: number,
        expectedMemo: string
    ): boolean {
        // Check if transaction succeeded
        if (tx.meta?.err) return false;

        // Verify transfer amount
        const transfer = this.findTransferInstruction(tx);
        if (!transfer || transfer.lamports !== expectedAmount) return false;

        // Verify memo
        const memo = this.findMemoInstruction(tx);
        if (!memo || memo !== expectedMemo) return false;

        return true;
    }

    private findTransferInstruction(tx: ParsedTransactionWithMeta): any {
        for (const instruction of tx.transaction.message.instructions) {
            const parsed = instruction as ParsedInstruction;
            if (
                parsed.program === "system" &&
                parsed.parsed?.type === "transfer" &&
                parsed.parsed?.info?.destination === this.paymentWallet.toBase58()
            ) {
                return parsed.parsed.info;
            }
        }
        return null;
    }

    private findMemoInstruction(tx: ParsedTransactionWithMeta): string | null {
        for (const instruction of tx.transaction.message.instructions) {
            const parsed = instruction as ParsedInstruction;
            if (parsed.program === "spl-memo") {
                return parsed.parsed;
            }
        }
        return null;
    }

    async getTransaction(signature: string): Promise {
        return this.connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });
    }

    async verifyTransactionSignature(
        signature: string,
        expectedAmount: number,
        expectedMemo: string
    ): Promise {
        const tx = await this.getTransaction(signature);
        if (!tx) return false;
        return this.verifyPayment(tx, expectedAmount, expectedMemo);
    }
}
```

