import { githubAgent } from "./src/features/project-evaluation/langgraph/nodes/github-agent.js";
import { evaluationAgent } from "./src/features/project-evaluation/langgraph/nodes/evaluation-agent.js";
import { validatorAgent } from "./src/features/project-evaluation/langgraph/nodes/validator-agent.js";
import type { EvaluationState } from "./src/features/project-evaluation/langgraph/state.js";

async function run() {
  const state: EvaluationState = {
    evaluationId: "test-eval-123",
    projectTitle: "Enterprise Website",
    githubUrl: "https://github.com/KISHORGUNITHI/Enterprise_Website",
    reportUrl: undefined,
    pptUrl: undefined,
    rubric: {
      problemStatement: 20,
      solutionDesign: 20,
      implementation: 20,
      innovation: 20,
      documentation: 20,
    },
    githubSummary: "Frontend HTML/JS application with admin panel, responsive UI, authentication modules, and user dashboard.",
    documentAnalysis: {
      problemStatementScore: 7,
      solutionDesignScore: 8,
      innovationScore: 7,
      documentationScore: 8,
      methodologySummary: "Agile methodology with client-side MVC.",
      strengths: ["Clear project scope"],
      weaknesses: ["Needs backend integration"],
    },
  };

  const onProgress = (evt: any) => console.log("[PROGRESS]", evt);

  console.log("Running githubAgent...");
  const githubRes = await githubAgent(state, onProgress);
  console.log("githubAgent finished:", Object.keys(githubRes));

  const stateWithGithub: EvaluationState = {
    ...state,
    ...githubRes,
  };

  console.log("Running evaluationAgent...");
  const evalRes = await evaluationAgent(stateWithGithub, onProgress);
  console.log("evaluationAgent finished:", evalRes.evaluation?.aiScore);

  const stateWithEval: EvaluationState = {
    ...stateWithGithub,
    ...evalRes,
  };

  console.log("Running validatorAgent...");
  const valRes = await validatorAgent(stateWithEval, onProgress);
  console.log("validatorAgent finished:", valRes.evaluation?.aiScore);

  console.log("ALL NODES PASSED SUCCESSFULLY!");
}

run().catch((e) => {
  console.error("Evaluation test failed:", e);
  process.exit(1);
});
