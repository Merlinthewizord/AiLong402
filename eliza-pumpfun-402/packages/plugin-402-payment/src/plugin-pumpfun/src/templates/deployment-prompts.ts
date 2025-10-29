/**
 * deployment-prompts.ts
 * 
 * Template prompts for the Pump.fun plugin
 * These help the agent understand and respond to token deployment requests
 */

export const deploymentPrompts = {
    // System prompt that teaches the agent about token deployment
    systemPrompt: `You are a helpful token deployment assistant that helps users create tokens on Pump.fun.

When a user wants to deploy a token, you need to collect the following information:
- Token Name (required): The full name of the token
- Token Symbol (required): 2-6 characters, uppercase
- Description (optional): A brief description of the token
- Image URL (optional): Link to token logo/image
- Social Links (optional): Twitter, Telegram, Website

IMPORTANT RULES:
1. You can only deploy tokens after receiving payment
2. Payment is 0.01 SOL per deployment
3. Always confirm the token details before requesting payment
4. Never proceed with deployment until payment is verified
5. If deployment fails, inform the user about the automatic refund

Example flow:
User: "I want to deploy a token called MoonCoin"
You: "Great! Let me help you deploy MoonCoin. I need a few more details:
- Token Symbol: (2-6 uppercase letters)
- Description: (optional)
- Image URL: (optional)
After you provide these, I'll create a payment request for 0.01 SOL."`,

    // Prompt for extracting token parameters from user message
    extractionPrompt: `Extract token deployment parameters from the following message.

User message: "{{message}}"

Extract these fields:
- tokenName: The full name of the token
- tokenSymbol: 2-6 uppercase letters
- description: Brief description
- imageUrl: URL to token image
- twitter: Twitter/X handle or URL
- telegram: Telegram link
- website: Website URL
- initialBuyAmount: SOL amount for initial buy (default 0)

Return as JSON object. If a field is not mentioned, set it to null.

Example response:
{
    "tokenName": "MoonCoin",
    "tokenSymbol": "MOON",
    "description": "To the moon!",
    "imageUrl": null,
    "twitter": null,
    "telegram": null,
    "website": null,
    "initialBuyAmount": 0
}`,

    // Prompt for validating token parameters
    validationPrompt: `Validate the following token parameters:

{{parameters}}

Check:
1. tokenName: Must be 1-32 characters, no special characters except spaces
2. tokenSymbol: Must be 2-6 uppercase letters, no spaces or special characters
3. imageUrl: Must be valid HTTP/HTTPS URL if provided
4. twitter: Must be valid Twitter/X URL or handle if provided
5. telegram: Must be valid Telegram URL if provided
6. website: Must be valid HTTP/HTTPS URL if provided
7. initialBuyAmount: Must be 0 or positive number if provided

Return validation result as:
{
    "isValid": true/false,
    "errors": ["error message 1", "error message 2"],
    "suggestions": ["suggestion 1", "suggestion 2"]
}`,

    // Prompt for confirming deployment details
    confirmationPrompt: `Generate a friendly confirmation message for the following token deployment:

Token Details:
{{parameters}}

The message should:
1. Summarize the token details
2. Mention the payment amount (0.01 SOL)
3. Ask for explicit confirmation
4. Be enthusiastic but professional
5. Include emojis appropriately

Example format:
"🚀 Ready to deploy your token!

**Token Name:** MoonCoin
**Symbol:** MOON
**Description:** To the moon!

**Cost:** 0.01 SOL

Reply 'yes' or 'confirm' to proceed with payment!"`,

    // Prompt for payment request message
    paymentRequestPrompt: `Generate a payment request message with these details:

Deployment ID: {{deploymentId}}
Payment Address: {{paymentAddress}}
Amount: {{amount}} SOL
Memo: {{memo}}
Deep Link: {{deepLink}}

The message should:
1. Be clear and concise
2. Include payment instructions
3. Show the deep link for mobile wallets
4. Mention the memo requirement
5. Explain what happens after payment

Example format:
"💰 Payment Required

**Amount:** 0.01 SOL
**Address:** \`7xKXtg2CW87...\`
**Memo:** \`PUMPFUN_DEPLOY_dep_abc123\`
**Deployment ID:** \`dep_abc123\`

**For mobile wallets:**
[Payment Link](solana:7xKXtg2CW87...?amount=0.01&memo=PUMPFUN_DEPLOY_dep_abc123)

Send the exact amount with the memo included. I'll deploy your token as soon as payment is confirmed! ⚡

Payment expires in 5 minutes."`,

    // Prompt for deployment success message
    successPrompt: `Generate a success message for this completed deployment:

Token Name: {{tokenName}}
Token Symbol: {{tokenSymbol}}
Token Address: {{tokenAddress}}
Transaction Signature: {{signature}}
Pump.fun URL: {{pumpfunUrl}}
Solscan URL: {{solscanUrl}}
DEXScreener URL: {{dexscreenerUrl}}

The message should:
1. Celebrate the successful deployment
2. Include all important links
3. Provide next steps or suggestions
4. Be enthusiastic and encouraging
5. Use emojis appropriately

Example format:
"🎉 **MoonCoin deployed successfully!**

✅ **Token Address:** \`7xKXtg2CW87...\`
🔗 **Pump.fun:** https://pump.fun/7xKXtg2...
🔍 **Solscan:** https://solscan.io/token/7xKXtg2...
📊 **DEXScreener:** https://dexscreener.com/solana/7xKXtg2...

Your token is now live! Share it with your community! 🚀"`,

    // Prompt for deployment failure message
    failurePrompt: `Generate a failure message for this deployment:

Deployment ID: {{deploymentId}}
Error: {{error}}
Payment Signature: {{paymentSignature}}

The message should:
1. Apologize for the failure
2. Explain what went wrong (if known)
3. Assure about automatic refund
4. Offer to try again
5. Be empathetic and helpful

Example format:
"❌ Deployment Failed

I encountered an error while deploying your token:
\`{{error}}\`

**Don't worry!** Your payment has been automatically refunded to your wallet.

**Refund Details:**
- Original Payment: \`{{paymentSignature}}\`
- Refund will arrive within 1-2 minutes

Would you like to try again? I can help troubleshoot the issue."`,

    // Prompt for handling missing information
    missingInfoPrompt: `The user wants to deploy a token but is missing required information.

Provided: {{providedInfo}}
Missing: {{missingInfo}}

Generate a friendly message that:
1. Acknowledges what they've provided
2. Asks for the missing information
3. Explains why it's needed
4. Provides examples if helpful
5. Keeps it conversational

Example:
"Great! I see you want to deploy a token called MoonCoin. 

I just need the **token symbol** (2-6 uppercase letters). This is the short ticker that will identify your token, like BTC for Bitcoin or ETH for Ethereum.

What symbol would you like for MoonCoin? For example: MOON, MNCO, etc."`,

    // Prompt for payment verification in progress
    verifyingPaymentPrompt: `Generate a message indicating payment verification is in progress:

Deployment ID: {{deploymentId}}
Payment Address: {{paymentAddress}}
Expected Amount: {{amount}} SOL

The message should:
1. Acknowledge that verification is happening
2. Be reassuring
3. Mention approximate wait time
4. Tell them what happens next

Example:
"⏳ Verifying your payment...

I'm monitoring the blockchain for your payment of 0.01 SOL to \`7xKXtg2CW87...\`

This usually takes 5-10 seconds. Once confirmed, I'll immediately deploy your token! ⚡"`,

    // Prompt for payment timeout
    paymentTimeoutPrompt: `Generate a timeout message for expired payment:

Deployment ID: {{deploymentId}}
Expired At: {{expiredAt}}

The message should:
1. Inform about timeout
2. Be understanding
3. Offer to create a new payment request
4. Keep it positive

Example:
"⏰ Payment Expired

The payment window for deployment \`dep_abc123\` has expired after 5 minutes.

No worries! Would you like me to create a new payment request? Your token details are saved and ready to deploy."`,

    // Prompt for handling price inquiries
    pricingPrompt: `Generate a response about deployment pricing.

Current Pricing:
- Basic: 0.01 SOL (~$1.50)
- Priority: 0.05 SOL (~$7.50) - faster deployment
- Premium: 0.1 SOL (~$15) - includes analytics

The message should:
1. Present pricing clearly
2. Explain what's included
3. Help them choose the right tier
4. Be transparent about costs

Example:
"💰 Token Deployment Pricing

**Basic Tier - 0.01 SOL (~$1.50)**
- Standard deployment speed
- All basic features
- Perfect for most users

**Priority Tier - 0.05 SOL (~$7.50)**
- Higher priority in queue
- Increased compute units
- Faster deployment

**Premium Tier - 0.1 SOL (~$15)**
- Expedited deployment
- Real-time analytics dashboard
- Priority support

Which tier works best for you?"`,

    // Prompt for deployment status check
    statusCheckPrompt: `Generate a status update message:

Deployment ID: {{deploymentId}}
Status: {{status}}
Token Address: {{tokenAddress}}
Progress: {{progress}}%

Status can be: pending_payment, payment_confirmed, deploying, completed, failed

The message should:
1. Clearly state current status
2. Show progress if applicable
3. Estimate time remaining if deploying
4. Be informative

Example for "deploying":
"🚀 Deployment in Progress

**Status:** Deploying to Solana
**Progress:** 75%
**Estimated time:** 10-15 seconds

Your token is being created on the blockchain. Almost there! ⚡"`,
};

// Helper function to replace template variables
export function fillTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), String(value ?? ''));
    }
    return result;
}

// Export individual prompt templates for easy access
export const SYSTEM_PROMPT = deploymentPrompts.systemPrompt;
export const EXTRACTION_PROMPT = deploymentPrompts.extractionPrompt;
export const VALIDATION_PROMPT = deploymentPrompts.validationPrompt;
export const CONFIRMATION_PROMPT = deploymentPrompts.confirmationPrompt;
export const PAYMENT_REQUEST_PROMPT = deploymentPrompts.paymentRequestPrompt;
export const SUCCESS_PROMPT = deploymentPrompts.successPrompt;
export const FAILURE_PROMPT = deploymentPrompts.failurePrompt;
export const MISSING_INFO_PROMPT = deploymentPrompts.missingInfoPrompt;
export const VERIFYING_PAYMENT_PROMPT = deploymentPrompts.verifyingPaymentPrompt;
export const PAYMENT_TIMEOUT_PROMPT = deploymentPrompts.paymentTimeoutPrompt;
export const PRICING_PROMPT = deploymentPrompts.pricingPrompt;
export const STATUS_CHECK_PROMPT = deploymentPrompts.statusCheckPrompt;

// Example usage patterns
export const exampleUsage = {
    // How to use extraction prompt
    extractParameters: `
    import { fillTemplate, EXTRACTION_PROMPT } from './templates/deployment-prompts';
    
    const userMessage = "Deploy a token called MoonCoin with symbol MOON";
    const prompt = fillTemplate(EXTRACTION_PROMPT, { message: userMessage });
    
    // Send to LLM
    const response = await llm.generate(prompt);
    const parameters = JSON.parse(response);
    `,

    // How to use confirmation prompt
    generateConfirmation: `
    import { fillTemplate, CONFIRMATION_PROMPT } from './templates/deployment-prompts';
    
    const parameters = {
        tokenName: "MoonCoin",
        tokenSymbol: "MOON",
        description: "To the moon!"
    };
    
    const message = fillTemplate(CONFIRMATION_PROMPT, { 
        parameters: JSON.stringify(parameters, null, 2) 
    });
    `,

    // How to use success prompt
    celebrateSuccess: `
    import { fillTemplate, SUCCESS_PROMPT } from './templates/deployment-prompts';
    
    const message = fillTemplate(SUCCESS_PROMPT, {
        tokenName: "MoonCoin",
        tokenSymbol: "MOON",
        tokenAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        signature: "5wHu8W5N4KqgZz3nP8K...",
        pumpfunUrl: "https://pump.fun/7xKXtg2CW87...",
        solscanUrl: "https://solscan.io/token/7xKXtg2CW87...",
        dexscreenerUrl: "https://dexscreener.com/solana/7xKXtg2CW87..."
    });
    `
};
