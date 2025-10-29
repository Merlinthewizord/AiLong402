
import { Plugin } from "@ai16z/eliza";
import { deployTokenAction } from "./actions/deploy-token";
import { buyTokenAction } from "./actions/buy-token";
import { checkStatusAction } from "./actions/check-status";
import { tokenInfoProvider } from "./providers/token-info";
import { marketDataProvider } from "./providers/market-data";

export const pumpfunPlugin: Plugin = {
    name: "pumpfun",
    description: "Pump.fun token deployment and trading plugin",
    actions: [
        deployTokenAction,
        buyTokenAction,
        checkStatusAction
    ],
    providers: [
        tokenInfoProvider,
        marketDataProvider
    ]
};

export default pumpfunPlugin;
```
