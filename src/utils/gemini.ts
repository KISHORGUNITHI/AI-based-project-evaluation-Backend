/**
 * Legacy evaluation utility — now backed by NVIDIA NIM instead of Gemini.
 * Used by the old run-gemini.ts node (kept for backward compat).
 * New code should use the multi-agent pipeline (document-agent, github-agent, etc.)
 */
import { getNimModel } from "../lib/nim.js";

export interface FullEvaluationInput {
    projectTitle: string;
    githubUrl?: string;
    pdfText?: string;
    pptText?: string;
    githubSummary?: string;
    rubric?: {
        problemStatement: number;
        solutionDesign: number;
        implementation: number;
        innovation: number;
        documentation: number;
    };
}

export interface EvaluationOutput {
    aiScore: number;
    feedback: string;
    problemStatementScore?: number;
    solutionDesignScore?: number;
    implementationScore?: number;
    innovationScore?: number;
    documentationScore?: number;
    strengths?: string[];
    weaknesses?: string[];
    suggestions?: string[];
}

function extractJsonObject(text: string): string | null {
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === "{") depth++;
        else if (cleaned[i] === "}") {
            depth--;
            if (depth === 0) return cleaned.slice(start, i + 1).trim();
        }
    }
    return null;
}

export async function evaluateProject(input: FullEvaluationInput): Promise<EvaluationOutput> {
    const rubric = input.rubric ?? {
        problemStatement: 20,
        solutionDesign: 20,
        implementation: 25,
        innovation: 20,
        documentation: 15,
    };

    const sections: string[] = [];
    if (input.pdfText?.trim())      sections.push(`=== REPORT (PDF) ===\n${input.pdfText.substring(0, 15000)}`);
    if (input.pptText?.trim())      sections.push(`=== PRESENTATION ===\n${input.pptText.substring(0, 8000)}`);
    if (input.githubSummary?.trim()) sections.push(`=== GITHUB SUMMARY ===\n${input.githubSummary.substring(0, 5000)}`);

    if (sections.length === 0) {
        return {
            aiScore: 0,
            feedback: "No content provided for evaluation.",
            strengths: [],
            weaknesses: ["No submission content available"],
            suggestions: ["Upload a PDF report, PPT, or provide a GitHub URL"],
        };
    }

    const prompt = `You are a senior technical judge evaluating a student engineering project.

Project: ${input.projectTitle}
GitHub: ${input.githubUrl ?? "Not provided"}

Rubric weights:
- Problem Statement: ${rubric.problemStatement}%
- Solution Design: ${rubric.solutionDesign}%
- Implementation: ${rubric.implementation}%
- Innovation: ${rubric.innovation}%
- Documentation: ${rubric.documentation}%

${sections.join("\n\n")}

Score each criterion 0-10. Compute:
aiScore = (problemStatementScore*${rubric.problemStatement} + solutionDesignScore*${rubric.solutionDesign} + implementationScore*${rubric.implementation} + innovationScore*${rubric.innovation} + documentationScore*${rubric.documentation}) / 100 * 10

Return ONLY this JSON (no markdown):
{"aiScore":<0-100>,"problemStatementScore":<0-10>,"solutionDesignScore":<0-10>,"implementationScore":<0-10>,"innovationScore":<0-10>,"documentationScore":<0-10>,"strengths":["..."],"weaknesses":["..."],"suggestions":["..."],"feedback":"..."}`;

    try {
        const model = getNimModel();
        const response = await model.invoke(prompt);
        const raw = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        const jsonText = extractJsonObject(raw);
        if (!jsonText) throw new Error("Could not extract JSON from NIM response");

        const parsed = JSON.parse(jsonText);
        return {
            aiScore:               Number(parsed.aiScore) || 0,
            feedback:              parsed.feedback ?? "",
            problemStatementScore: Number(parsed.problemStatementScore) || undefined,
            solutionDesignScore:   Number(parsed.solutionDesignScore)   || undefined,
            implementationScore:   Number(parsed.implementationScore)   || undefined,
            innovationScore:       Number(parsed.innovationScore)       || undefined,
            documentationScore:    Number(parsed.documentationScore)    || undefined,
            strengths:   Array.isArray(parsed.strengths)   ? parsed.strengths   : [],
            weaknesses:  Array.isArray(parsed.weaknesses)  ? parsed.weaknesses  : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        };
    } catch (err) {
        console.error("[gemini.ts] NIM evaluation error:", err);
        return {
            aiScore: 0,
            feedback: `Evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            strengths: [], weaknesses: [], suggestions: [],
        };
    }
}

// Legacy wrapper
export async function evaluateProjectDocument(
    projectTitle: string,
    githubUrl: string | undefined,
    documentText: string,
): Promise<EvaluationOutput> {
    return evaluateProject({ projectTitle, githubUrl, pdfText: documentText });
}
