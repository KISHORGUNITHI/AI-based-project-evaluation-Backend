import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Creates a ChatOpenAI instance pointed at NVIDIA NIM.
 * Model defaults to llama-3.3-70b-instruct which supports structured output.
 */
export function getNimModel(): ChatOpenAI {
    return new ChatOpenAI({
        apiKey: env.NVIDIA_API_KEY,
        model: env.NIM_MODEL,
        configuration: {
            baseURL: NIM_BASE_URL,
        },
        temperature: 0.2,
        maxTokens: 2048,
    });
}
