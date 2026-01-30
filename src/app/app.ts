import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import config from "../config";

// Create storage for conversation history
const storage = new LocalStorage();

// Load instructions from file on initialization
function loadInstructions(): string {
  const instructionsFilePath = path.join(__dirname, "instructions.txt");
  return fs.readFileSync(instructionsFilePath, "utf-8").trim();
}

const instructions = loadInstructions();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  generationConfig: {
    responseMimeType: "application/json",
  }
});

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

// Helper to process with Gemini
async function processWithGemini(userId: string, conversationKey: string, input: string) {
  const history = storage.get(conversationKey) || [];
  
  const contents = [
    { role: "user", parts: [{ text: `SYSTEM INSTRUCTIONS:\n${instructions}` }] },
    ...history.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    })),
    { role: "user", parts: [{ text: input }] }
  ];

  const result = await model.generateContent({ contents });
  const responseText = result.response.text();
  
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (e) {
    console.error("Failed to parse Gemini response:", responseText);
    parsed = { text: responseText, a2ui: null };
  }

  // Update history
  history.push({ role: "user", content: input });
  history.push({ role: "assistant", content: parsed.text });
  storage.set(conversationKey, history);

  return parsed;
}

// Handlers are consolidated above

// Handle A2UI Actions and normal messages
app.on("message", async ({ send, activity }) => {
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;
  
  try {
    let input = activity.text;
    
    // Check if this is an action submission from A2UI
    if (!input && activity.value && activity.value.action) {
        input = `User performed action: "${activity.value.action}" with data: ${JSON.stringify(activity.value.data || {})}`;
    }

    if (!input) return;

    const result = await processWithGemini(activity.from.id, conversationKey, input);
    
    const responseActivity = new MessageActivity(result.text)
      .addAiGenerated()
      .addFeedback();
    
    if (result.a2ui) {
        (responseActivity as any).channelData = {
            ...(responseActivity as any).channelData,
            a2ui: result.a2ui
        };
    }
    
    await send(responseActivity);
  } catch (error) {
    console.error(error);
    await send("The agent encountered an error while processing your request with Gemini.");
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("Your feedback is " + JSON.stringify(activity.value));
});

export default app;
