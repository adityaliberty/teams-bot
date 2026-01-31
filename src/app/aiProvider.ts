import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AIResponse {
    text: string;
    a2ui?: any;
}

export interface AIProvider {
    generateResponse(history: any[], input: string, instructions: string): Promise<AIResponse>;
}

export class GeminiProvider implements AIProvider {
    private model: any;

    constructor(apiKey: string) {
        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                responseMimeType: "application/json",
            }
        });
    }

    async generateResponse(history: any[], input: string, instructions: string): Promise<AIResponse> {
        const contents = [
            { role: "user", parts: [{ text: `SYSTEM INSTRUCTIONS:\n${instructions}` }] },
            ...history.map((msg: any) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }]
            })),
            { role: "user", parts: [{ text: input }] }
        ];

        const result = await this.model.generateContent({ contents });
        const responseText = result.response.text();

        try {
            return JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse AI response:", responseText);
            return { text: responseText };
        }
    }
}
