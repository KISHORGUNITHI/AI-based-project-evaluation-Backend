import { ChatOpenAI } from "@langchain/openai";
import { evaluationResultZodSchema } from "./src/features/project-evaluation/langgraph/nodes/evaluation-agent.js";
import { env } from "./src/config/env.js";

async function main() {
  const model = new ChatOpenAI({
    apiKey: env.NVIDIA_API_KEY,
    model: env.NIM_MODEL,
    configuration: { baseURL: "https://integrate.api.nvidia.com/v1" },
    temperature: 0.1,
    maxTokens: 1000,
  });

  const structured = model.withStructuredOutput(evaluationResultZodSchema);
  console.log("Invoking structured...");
  try {
    const res = await structured.invoke("Evaluate project: HTML/JS Enterprise Website with responsive admin panel and UI. Rubric: problemStatement 20, solutionDesign 20, implementation 20, innovation 20, documentation 20. Return scores and arrays.");
    console.log("SUCCESS:", res);
  } catch (err: any) {
    console.error("FAILED:", err);
  }
}

main();
