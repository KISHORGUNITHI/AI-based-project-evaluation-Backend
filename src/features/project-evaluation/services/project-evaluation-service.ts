import { PdfParserService } from "./pdf-parser-service";
import { LlmEvaluationService } from "./llm-evaluation-service";
import { GithubCloneService } from "../github/github-clone-service";
import { GithubParserService } from "../github/github-parser-service";
import { GithubSummaryService } from "../github/github-summary-service";

export class ProjectEvaluationService {
    private pdfParser = new PdfParserService();
    private llmService = new LlmEvaluationService();
    private githubCloneService = new GithubCloneService();
    private githubParserService = new GithubParserService();
    private githubSummaryService = new GithubSummaryService();

    async evaluateReport(filepath:string) {
        const reportText=await this.pdfParser.extractText(filepath);
        return this.llmService.evaluate(reportText);
    }

     async evaluateGithubRepository(repositoryUrl: string){
        const repositoryPath=await this.githubCloneService.cloneRepository(repositoryUrl);
        console.log(repositoryPath);
        try{
            const project=await this.githubParserService.parseRepository(repositoryPath);
            const summary =this.githubSummaryService.generateSummary(project);
            return await this.llmService.evaluate(summary);
        }
        finally {
            await this.githubCloneService.deleteRepository(repositoryPath);
        }
    }
}