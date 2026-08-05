import {type IRouter,Router} from "express";
import {evaluateProject,evaluateGithubProject } from "../controllers/project-evaluation-controller";
import {upload} from "../../../middleware/upload"

const router: IRouter = Router();

router.post("/pdf", upload.single("file"), evaluateProject);
router.post("/github", evaluateGithubProject);

export { router as projectEvaluationRouter };