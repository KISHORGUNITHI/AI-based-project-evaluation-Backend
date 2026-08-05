import "dotenv/config";
import prisma from "../src/db/prisma.js";

async function main() {
    const id = process.argv[2] ?? "cmr0sc8b50006azitjw63u99m";

    const e = await prisma.evaluation.findUnique({
        where: { id },
        include: { submission: true, project: true },
    });

    if (!e) { console.log("Not found"); process.exit(1); }

    console.log("\n=== SUBMISSION URLS ===");
    console.log("GitHub :", e.submission?.githubUrl ?? "NONE");
    console.log("Report :", e.submission?.reportUrl ?? "NONE");
    console.log("PPT    :", e.submission?.pptUrl    ?? "NONE");

    console.log("\n=== EXTRACTED CONTENT ===");
    console.log("githubSummary len :", e.githubSummary?.length ?? 0);
    console.log("pdfText len       :", (e as any).pdfText?.length ?? 0);
    console.log("pptText len       :", (e as any).pptText?.length ?? 0);

    console.log("\n=== ANALYSIS RESULTS ===");
    console.log("codeAnalysis     :", JSON.stringify(e.codeAnalysis)?.slice(0, 300) ?? "null");
    console.log("documentAnalysis :", JSON.stringify(e.documentAnalysis)?.slice(0, 300) ?? "null");

    console.log("\n=== SCORES ===");
    console.log("aiScore              :", e.aiScore);
    console.log("problemStatementScore:", e.problemStatementScore);
    console.log("implementationScore  :", e.implementationScore);

    console.log("\n=== FEEDBACK (first 500 chars) ===");
    console.log(String(e.feedback ?? "").slice(0, 500));

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
