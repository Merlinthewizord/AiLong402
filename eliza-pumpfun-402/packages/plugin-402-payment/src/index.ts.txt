### `/packages/plugin-402-payment/src/index.ts`

```typescript
import { Plugin } from "@ai16z/eliza";
import { initiatePaymentAction } from "./actions/initiate-payment";
import { verifyPaymentAction } from "./actions/verify-payment";
import { refundPaymentAction } from "./actions/refund-payment";
import { paymentStatusProvider } from "./providers/payment-status";
import { pricingProvider } from "./providers/pricing";
import { paymentRequiredEvaluator } from "./evaluators/payment-required";

export const payment402Plugin: Plugin = {
    name: "payment402",
    description: "HTTP 402 Payment Required plugin for Solana payments",
    actions: [
        initiatePaymentAction,
        verifyPaymentAction,
        refundPaymentAction
    ],
    providers: [
        paymentStatusProvider,
        pricingProvider
    ],
    evaluators: [
        paymentRequiredEvaluator
    ]
};

export default payment402Plugin;
