import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { CardFactory, ActivityTypes } from "botbuilder";

import { ManagedIdentityCredential } from "@azure/identity";
import * as fs from "fs";
import * as path from "path";
import config from "../config";
import { convertA2UIToAdaptiveCard } from "./converter";
import { GeminiProvider, AIProvider } from "./aiProvider";

// Create storage for conversation history
const storage = new LocalStorage();

// Load instructions from file
function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "instructions.txt");
  return fs.readFileSync(instructionsFilePath, "utf-8").trim();
}

const instructions = loadInstructions();

// Initialize AI Provider (Generic)
const aiProvider: AIProvider = new GeminiProvider(process.env.GOOGLE_API_KEY || "");

const createTokenFactory = () => {
  return async (
    scope: string | string[],
    tenantId?: string,
  ): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId,
    });

    return tokenResponse.token;
  };
};

const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi"
    ? { ...tokenCredentials }
    : undefined;

const app = new App({
  ...credentialOptions,
  storage,
});

// Handle messages and actions
app.on("message", async ({ send, activity }) => {
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;
  
  try {
    let input = activity.text;
    
    // Handle action submissions (from buttons or forms)
    if (!input && activity.value) {
        input = `User performed action: ${JSON.stringify(activity.value)}`;
    }

    if (!input) return;

    // 1. Send Typing Indicator (Loader)
    const typingActivity = { type: ActivityTypes.Typing };
    await send(typingActivity as any);

    // 2. Process with AI Provider
    const history = storage.get(conversationKey) || [];
    const result = await aiProvider.generateResponse(history, input, instructions);
    
    // Update history
    history.push({ role: "user", content: input });
    history.push({ role: "assistant", content: JSON.stringify(result) });
    storage.set(conversationKey, history);

    // 3. Prepare Response
    const responseActivity = new MessageActivity(result.text)
      .addAiGenerated()
      .addFeedback();
    
    // Convert A2UI to Adaptive Card for Teams
    if (result.a2ui) {
        try {
            const adaptiveCardJson = convertA2UIToAdaptiveCard(result.a2ui);
            const card = CardFactory.adaptiveCard(adaptiveCardJson);
            responseActivity.addAttachments(card);
        } catch (convError) {
            console.error("Conversion error:", convError);
        }
    }
    
    await send(responseActivity);
  } catch (error) {
    console.error("Error in message handler:", error);
    await send("The agent encountered an error while processing your request.");
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("Your feedback is " + JSON.stringify(activity.value));
});

export default app;
