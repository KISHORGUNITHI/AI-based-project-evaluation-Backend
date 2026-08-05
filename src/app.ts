import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { auth } from "./auth";
import { env } from "./config/env";
import { registerSwaggerDocs } from "./docs/swagger";
import { healthRouter } from "./features/health/routes/health-routes";
import adminRouter from "./features/health/routes/adminRoutes";
import evaluationRouter from "./features/health/routes/evaluationRoutes";
import judgeRouter from "./features/health/routes/judgeRoutes";
import analyticsRouter from "./features/health/routes/analyticsRoutes";
import notificationRouter from "./features/health/routes/notificationRoutes";
import judgeDashboardRouter from "./features/health/routes/judgedashboardRoutes";
import projectRouter from "./features/health/routes/projectRoutes";
import studentRouter from "./features/health/routes/studentRoutes";
import studentDashboardRouter from "./features/health/routes/studentdashboardRoutes";
import submissionRouter from "./features/health/routes/submissionRoutes";
import teamRouter from "./features/health/routes/teamroutes";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { projectEvaluationRouter } from "./features/project-evaluation/routes/project-evaluation-routes";
import {
	authRateLimit,
	apiRateLimit,
	evaluationRateLimit,
	uploadRateLimit,
} from "./middleware/rate-limit";

// ── Global BigInt serialisation fix ─────────────────────────────────────────
// JSON.stringify cannot handle BigInt natively. Patch it globally so all
// res.json() calls automatically convert BigInt values to strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
	return this.toString();
};


const app: Express = express();

const allowedOrigins = new Set([
	env.FRONTEND_URL,
	"http://localhost:3000",
	"http://localhost:5173",
	"http://localhost:5174",
	"http://localhost:5175",
	"http://localhost:5176",
	"http://localhost:4173",
]);

app.use(
	cors({
		origin: (origin, callback) => {
			// Allow requests with no origin (Postman, server-to-server)
			if (!origin) return callback(null, true);
			// Allow everything in development
			if (env.NODE_ENV === "development") return callback(null, true);
			// Allow known explicit origins
			if (allowedOrigins.has(origin)) return callback(null, true);
			// Allow any Vercel deployment URL (preview + production)
			if (/\.vercel\.app$/.test(origin)) {
				return callback(null, true);
			}
			callback(new Error("Not allowed by CORS"));
		},
		credentials: true,
	}),
);

registerSwaggerDocs(app);

// Better Auth — must be registered before express.json()
app.use(cookieParser());

// Mount better-auth — handle all /api/auth/* requests including OPTIONS preflight
// We manually handle OPTIONS first so CORS headers are set before toNodeHandler takes over
app.use("/api/auth", authRateLimit, (req, res, next) => {
	// Handle OPTIONS preflight manually — toNodeHandler returns 405 for OPTIONS
	if (req.method === "OPTIONS") {
		const origin = req.headers.origin;
		const isAllowed =
			!origin ||
			env.NODE_ENV === "development" ||
			allowedOrigins.has(origin) ||
			/\.vercel\.app$/.test(origin);

		if (isAllowed) {
			res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
			res.setHeader("Access-Control-Allow-Credentials", "true");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
			res.status(204).end();
		} else {
			res.status(403).end();
		}
		return;
	}
	next();
}, toNodeHandler(auth));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (PDFs, PPTs) statically
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Feature routes
app.use("/api/health", healthRouter);
app.use("/api/admin",       apiRateLimit,        adminRouter);
app.use("/api/student",     apiRateLimit,        studentRouter);
app.use("/api/student",     apiRateLimit,        studentDashboardRouter);
app.use("/api/judge",       apiRateLimit,        judgeRouter);
app.use("/api/judge",       apiRateLimit,        judgeDashboardRouter);
app.use("/api/team",        apiRateLimit,        teamRouter);
app.use("/api/project",     uploadRateLimit,     projectRouter);
app.use("/api/submission",  uploadRateLimit,     submissionRouter);
app.use("/api/evaluation",  evaluationRateLimit, evaluationRouter);
app.use("/api/analytics",   apiRateLimit,        analyticsRouter);
app.use("/api/notifications", apiRateLimit,      notificationRouter);

app.use(
  "/api/evaluation",
  evaluationRateLimit,
  projectEvaluationRouter,
);

app.use(notFound);
app.use(errorHandler);

export { app };