export default interface EvaluationDTO {
	projectId: string;
	submissionId: string;
}

export interface AssignJudgeDTO {
	judgeId: string;
}

export interface AiScoreDTO {
	aiScore: number;
	feedback?: string;
}

export interface JudgeScoreDTO {
	judgeScore: number;
	feedback?: string;
}
