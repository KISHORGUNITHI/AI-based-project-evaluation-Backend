import { env } from "../config/env";

type OpenApiSchema = Record<string, unknown>;

interface OpenApiDocument {
	openapi: string;
	info: { title: string; description: string; version: string };
	servers: Array<{ url: string; description: string }>;
	tags: Array<{ name: string; description: string }>;
	paths: Record<string, unknown>;
	components: {
		securitySchemes: Record<string, OpenApiSchema>;
		schemas: Record<string, OpenApiSchema>;
	};
}

// ─── helpers ────────────────────────────────────────────────────────────────
const bearer = [{ bearerAuth: [] }];
const pathParam = (name: string, desc?: string) => ({
	in: "path", name, required: true,
	description: desc,
	schema: { type: "string" },
});
const err = (desc: string) => ({
	description: desc,
	content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
});
const ok = (desc: string, schemaRef: string) => ({
	description: desc,
	content: { "application/json": { schema: { $ref: schemaRef } } },
});

export const openApiDocument: OpenApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "AI Project Evaluation API",
		description: "Full API reference — Auth, Student, Judge, Team, Project, Submission, Evaluation and Dashboard endpoints.",
		version: "1.0.0",
	},
	servers: [{ url: env.BETTER_AUTH_URL, description: `${env.NODE_ENV} server` }],
	tags: [
		{ name: "Auth",              description: "Sign-up, sign-in, sign-out, session." },
		{ name: "Health",            description: "Service and dependency health checks." },
		{ name: "Student",           description: "Student profile management." },
		{ name: "Student Dashboard", description: "Student stats, teams, projects, submissions and evaluations." },
		{ name: "Judge",             description: "Judge profile management." },
		{ name: "Judge Dashboard",   description: "Judge assigned projects, submissions and evaluations." },
		{ name: "Team",              description: "Team creation and member management." },
		{ name: "Project",           description: "Project management for teams." },
		{ name: "Submission",        description: "Project submission versioning." },
		{ name: "Evaluation",        description: "Scoring, judge assignment and finalization." },
	],
	components: {
		securitySchemes: {
			bearerAuth: {
				type: "http", scheme: "bearer", bearerFormat: "JWT",
				description: "Token returned by POST /api/auth/sign-in/email",
			},
		},
		schemas: {
			// ── Shared ──────────────────────────────────────────────────────
			ErrorResponse: {
				type: "object", required: ["message"],
				properties: { message: { type: "string", example: "Something went wrong" } },
			},
			MessageResponse: {
				type: "object", required: ["message"],
				properties: { message: { type: "string", example: "Operation successful" } },
			},
			// ── Auth ─────────────────────────────────────────────────────────
			SignUpRequest: {
				type: "object", required: ["name", "email", "password"],
				properties: {
					name:     { type: "string", example: "Mohan Kumar" },
					email:    { type: "string", format: "email", example: "mohan@example.com" },
					password: { type: "string", format: "password", example: "Test@1234" },
				},
			},
			SignInRequest: {
				type: "object", required: ["email", "password"],
				properties: {
					email:    { type: "string", format: "email", example: "mohan@example.com" },
					password: { type: "string", format: "password", example: "Test@1234" },
				},
			},
			AuthResponse: {
				type: "object",
				properties: {
					token: { type: "string", example: "9V6oT6UkuOPm87y93QGJ" },
					user: {
						type: "object",
						properties: {
							id:    { type: "string" },
							name:  { type: "string" },
							email: { type: "string" },
							role:  { type: "string", enum: ["STUDENT", "JUDGE", "ADMIN"] },
						},
					},
				},
			},
			// ── Health ───────────────────────────────────────────────────────
			HealthResponse: {
				type: "object",
				required: ["success", "status", "timestamp", "environment", "uptime", "services"],
				properties: {
					success:     { type: "boolean", example: true },
					status:      { type: "string", enum: ["healthy", "degraded"] },
					timestamp:   { type: "string", format: "date-time" },
					environment: { type: "string", enum: ["development", "production", "test"] },
					uptime:      { type: "integer", example: 120 },
					services: {
						type: "object",
						properties: { database: { type: "string", enum: ["healthy", "unhealthy"] } },
					},
				},
			},
			PdfEvaluationResponse: {
				type: "object",
				required: ["success", "data"],
				properties: {
					success: {
						type: "boolean"
					},
					data: {
						type: "object",
						required: [
							"project_title",
							"problem_statementScore",
							"solution_design_score",
							"implementation_score",
							"innovation_score",
							"documentation_score",
							"overall_score",
							"strengths",
							"weaknesses",
							"suggestions"
						],
					properties: {
						project_title: {
							type: "string"
						},
						problem_statement_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						solution_design_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						implementation_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						innovation_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						documentation_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						overall_score: {
							type: "number",
							minimum: 0,
							maximum: 10
						},
						strengths: {
							type: "array",
							items: {
								type: "string"
							}
						},
						weaknesses: {
							type: "array",
							items: {
								type: "string"
							}
						},
						suggestions: {
							type: "array",
							items: {
								type: "string"
							}
						},
					},
				},
			},
			ErrorResponse: {
				type: "object",
				required: ["rollNumber", "department", "collegeName", "phonenumber", "year"],
				properties: {
					id:          { type: "string", example: "cmqjabc123" },
					userId:      { type: "string", example: "user-xyz" },
					rollNumber:  { type: "string", example: "CS2024001" },
					department:  { type: "string", example: "Computer Science" },
					collegeName: { type: "string", example: "MIT Chennai" },
					phonenumber: { type: "string", example: "9876543210", description: "Serialised as string (BigInt)" },
					year:        { type: "integer", example: 3 },
					cgpa:        { type: "string", example: "8.9", nullable: true },
					githubUrl:   { type: "string", format: "uri", nullable: true },
					leetcode:    { type: "string", format: "uri", nullable: true },
					portfolio:   { type: "string", format: "uri", nullable: true },
					linkedin:    { type: "string", format: "uri", nullable: true },
					createdAt:   { type: "string", format: "date-time" },
					updatedAt:   { type: "string", format: "date-time" },
				},
			},
			// ── Judge ─────────────────────────────────────────────────────────
			JudgeProfile: {
				type: "object",
				properties: {
					id:           { type: "string" },
					userId:       { type: "string" },
					organization: { type: "string", example: "TechCorp India", nullable: true },
					designation:  { type: "string", example: "Senior Engineer", nullable: true },
					expertise:    { type: "array", items: { type: "string" }, example: ["AI", "Backend"] },
					experience:   { type: "integer", example: 7, nullable: true },
					bio:          { type: "string", nullable: true },
					createdAt:    { type: "string", format: "date-time" },
					updatedAt:    { type: "string", format: "date-time" },
				},
			},
			// ── Team ──────────────────────────────────────────────────────────
			Team: {
				type: "object",
				properties: {
					id:           { type: "string", example: "cmqteam001" },
					name:         { type: "string", example: "Alpha Squad" },
					createdBy:    { type: "string" },
					teamLeaderId: { type: "string" },
					members:      { type: "array", items: { $ref: "#/components/schemas/TeamMember" } },
					createdAt:    { type: "string", format: "date-time" },
					updatedAt:    { type: "string", format: "date-time" },
				},
			},
			TeamMember: {
				type: "object",
				properties: {
					id: { type: "string" }, teamId: { type: "string" }, studentId: { type: "string" },
					createdAt: { type: "string", format: "date-time" },
				},
			},
			CreateTeamRequest: {
				type: "object", required: ["name"],
				properties: {
					name:         { type: "string", example: "Alpha Squad" },
					teamLeaderId: { type: "string" },
					members: { type: "array", items: { type: "object", properties: { studentId: { type: "string" } } }, example: [] },
				},
			},
			UpdateTeamRequest: {
				type: "object",
				properties: { name: { type: "string" }, teamLeaderId: { type: "string" } },
			},
			MemberRequest: {
				type: "object", required: ["studentId"],
				properties: { studentId: { type: "string", example: "student-xyz" } },
			},
			// ── Project ───────────────────────────────────────────────────────
			Project: {
				type: "object",
				properties: {
					id:          { type: "string" },
					title:       { type: "string", example: "AI Attendance System" },
					description: { type: "string", example: "Automated attendance using face recognition" },
					techStack:   { type: "array", items: { type: "string" }, example: ["Python", "OpenCV"] },
					repoUrl:     { type: "string", format: "uri", nullable: true },
					teamId:      { type: "string" },
					createdBy:   { type: "string" },
					createdAt:   { type: "string", format: "date-time" },
					updatedAt:   { type: "string", format: "date-time" },
				},
			},
			CreateProjectRequest: {
				type: "object", required: ["title", "teamId"],
				properties: {
					title:       { type: "string", example: "AI Attendance System" },
					description: { type: "string" },
					techStack:   { type: "array", items: { type: "string" } },
					repoUrl:     { type: "string", format: "uri" },
					teamId:      { type: "string" },
				},
			},
			UpdateProjectRequest: {
				type: "object",
				properties: {
					title:       { type: "string" },
					description: { type: "string" },
					techStack:   { type: "array", items: { type: "string" } },
					repoUrl:     { type: "string", format: "uri" },
				},
			},
			// ── Submission ────────────────────────────────────────────────────
			Submission: {
				type: "object",
				properties: {
					id:          { type: "string" },
					projectId:   { type: "string" },
					version:     { type: "integer", example: 1 },
					submittedBy: { type: "string" },
					repoUrl:     { type: "string", format: "uri", nullable: true },
					demoUrl:     { type: "string", format: "uri", nullable: true },
					notes:       { type: "string", nullable: true },
					status:      { type: "string", enum: ["SUBMITTED", "EVALUATING", "EVALUATED", "REJECTED"] },
					createdAt:   { type: "string", format: "date-time" },
					updatedAt:   { type: "string", format: "date-time" },
				},
			},
			CreateSubmissionRequest: {
				type: "object", required: ["projectId"],
				properties: {
					projectId: { type: "string" },
					repoUrl:   { type: "string", format: "uri" },
					demoUrl:   { type: "string", format: "uri" },
					notes:     { type: "string" },
				},
			},
			// ── Evaluation ────────────────────────────────────────────────────
			Evaluation: {
				type: "object",
				properties: {
					id:           { type: "string" },
					projectId:    { type: "string" },
					submissionId: { type: "string" },
					judgeId:      { type: "string", nullable: true },
					aiScore:      { type: "number", example: 86, nullable: true },
					judgeScore:   { type: "number", example: 92, nullable: true },
					finalScore:   { type: "number", example: 89.6, nullable: true },
					feedback:     { type: "string", nullable: true },
					status:       { type: "string", enum: ["PENDING", "AI_EVALUATING", "AI_COMPLETED", "JUDGE_EVALUATING", "COMPLETED"] },
					createdAt:    { type: "string", format: "date-time" },
					updatedAt:    { type: "string", format: "date-time" },
				},
			},
			},
		},
	},
	paths: {
		// ── Auth ───────────────────────────────────────────────────────────────
		"/api/auth/sign-up/email": {
			post: {
				tags: ["Auth"], summary: "Register a new user",
				description: "Creates a new account. Role defaults to STUDENT. Update it in the DB or via admin API.",
				operationId: "signUp",
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SignUpRequest" } } } },
				responses: {
					"200": ok("Account created.", "#/components/schemas/AuthResponse"),
					"400": err("Email already in use or missing fields."),
				},
			},
		},
		"/api/auth/sign-in/email": {
			post: {
				tags: ["Auth"], summary: "Sign in",
				description: "Returns a bearer token. Pass it as `Authorization: Bearer <token>` on subsequent requests.",
				operationId: "signIn",
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SignInRequest" } } } },
				responses: {
					"200": ok("Signed in successfully.", "#/components/schemas/AuthResponse"),
					"401": { description: "Invalid credentials." },
				},
			},
		},
		"/api/auth/sign-out": {
			post: {
				tags: ["Auth"], summary: "Sign out",
				operationId: "signOut",
				security: bearer,
				responses: { "200": { description: "Signed out." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/auth/get-session": {
			get: {
				tags: ["Auth"], summary: "Get current session",
				operationId: "getSession",
				security: bearer,
				responses: {
					"200": { description: "Active session with user object." },
					"401": { description: "No active session." },
				},
			},
		},
		// ── Health ─────────────────────────────────────────────────────────────
		"/api/health": {
			get: {
				tags: ["Health"], summary: "API health check",
				operationId: "getHealth",
				responses: { "200": ok("Health check completed.", "#/components/schemas/HealthResponse") },
			},
		},
		// ── Student ────────────────────────────────────────────────────────────
		"/api/student/create": {
			post: {
				tags: ["Student"], summary: "Create student profile",
				operationId: "createStudentProfile", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StudentProfile" } } } },
				responses: {
					"201": { description: "Profile created.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, student: { $ref: "#/components/schemas/StudentProfile" } } } } } },
					"400": err("Profile already exists or validation error."),
					"401": { description: "Not authenticated." }, "403": { description: "Role not STUDENT." },
				},
			},
		},
		"/api/student/profile": {
			get: {
				tags: ["Student"], summary: "Get my student profile",
				operationId: "getStudentProfile", security: bearer,
				responses: {
					"200": { description: "Profile returned.", content: { "application/json": { schema: { type: "object", properties: { student: { $ref: "#/components/schemas/StudentProfile" } } } } } },
					"400": err("Profile not found."), "401": { description: "Not authenticated." }, "403": { description: "Role not STUDENT." },
				},
			},
			put: {
				tags: ["Student"], summary: "Update my student profile",
				operationId: "updateStudentProfile", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StudentProfile" } } } },
				responses: {
					"200": { description: "Profile updated.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, student: { $ref: "#/components/schemas/StudentProfile" } } } } } },
					"400": err("Update failed."), "401": { description: "Not authenticated." }, "403": { description: "Role not STUDENT." },
				},
			},
		},
		// ── Student Dashboard ──────────────────────────────────────────────────
		"/api/student/dashboard": {
			get: { tags: ["Student Dashboard"], summary: "Student dashboard overview", operationId: "studentDashboard", security: bearer,
				responses: { "200": { description: "Stats: totalTeams, totalProjects, totalSubmissions, evaluations counts." }, "401": { description: "Not authenticated." }, "403": { description: "Role not STUDENT." } },
			},
		},
		"/api/student/my-teams": {
			get: { tags: ["Student Dashboard"], summary: "Get student's teams", operationId: "studentMyTeams", security: bearer,
				responses: { "200": { description: "Teams the student is part of." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/student/my-projects": {
			get: { tags: ["Student Dashboard"], summary: "Get student's projects", operationId: "studentMyProjects", security: bearer,
				responses: { "200": { description: "Projects from student's teams with latest submission and evaluation." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/student/my-submissions": {
			get: { tags: ["Student Dashboard"], summary: "Get student's submissions", operationId: "studentMySubmissions", security: bearer,
				responses: { "200": { description: "All submission versions across student's projects." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/student/my-evaluations": {
			get: { tags: ["Student Dashboard"], summary: "Get student's evaluations", operationId: "studentMyEvaluations", security: bearer,
				responses: { "200": { description: "Evaluations with scores, feedback and judge info." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/student/my-projects/{projectId}": {
			get: { tags: ["Student Dashboard"], summary: "Get full project detail", operationId: "studentProjectDetail", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Project with all submissions and evaluations." }, "400": err("Project not found or access denied.") as object, "401": { description: "Not authenticated." } },
			},
		},
		// ── Judge ──────────────────────────────────────────────────────────────
		"/api/judge": {
			post: { tags: ["Judge"], summary: "Create judge profile", operationId: "createJudgeProfile", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/JudgeProfile" } } } },
				responses: { "200": ok("Judge profile created.", "#/components/schemas/JudgeProfile"), "500": err("Already exists or server error.") as object, "401": { description: "Not authenticated." }, "403": { description: "Role not JUDGE." } },
			},
			get: { tags: ["Judge"], summary: "Get my judge profile", operationId: "getJudgeProfile", security: bearer,
				responses: { "200": ok("Judge profile.", "#/components/schemas/JudgeProfile"), "401": { description: "Not authenticated." }, "403": { description: "Role not JUDGE." } },
			},
			put: { tags: ["Judge"], summary: "Update my judge profile", operationId: "updateJudgeProfile", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/JudgeProfile" } } } },
				responses: { "200": ok("Profile updated.", "#/components/schemas/JudgeProfile"), "401": { description: "Not authenticated." }, "403": { description: "Role not JUDGE." } },
			},
		},
		// ── Judge Dashboard ────────────────────────────────────────────────────
		"/api/judge/dashboard": {
			get: { tags: ["Judge Dashboard"], summary: "Judge dashboard stats", operationId: "judgeDashboard", security: bearer,
				responses: { "200": { description: "assignedProjects, completedEvaluations, pendingEvaluations counts." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/judge/assigned-projects": {
			get: { tags: ["Judge Dashboard"], summary: "Compact list of assigned projects", operationId: "judgeAssignedProjectsSummary", security: bearer,
				responses: { "200": { description: "Flat list: projectId, title, team, evaluationId, status." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/judge/projects": {
			get: { tags: ["Judge Dashboard"], summary: "Full assigned projects", operationId: "judgeAssignedProjects", security: bearer,
				responses: { "200": { description: "Projects with team and submission info." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/judge/projects/{projectId}": {
			get: { tags: ["Judge Dashboard"], summary: "Get a specific assigned project", operationId: "judgeAssignedProjectById", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Project details." }, "403": { description: "Not assigned." }, "404": { description: "Not found." } },
			},
		},
		"/api/judge/projects/{projectId}/submissions": {
			get: { tags: ["Judge Dashboard"], summary: "Submissions for an assigned project", operationId: "judgeProjectSubmissions", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "List of submissions." }, "403": { description: "Not assigned." } },
			},
		},
		"/api/judge/projects/{projectId}/latest-submission": {
			get: { tags: ["Judge Dashboard"], summary: "Latest submission for an assigned project", operationId: "judgeLatestSubmission", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Latest submission." }, "403": { description: "Not assigned." }, "404": { description: "No submissions." } },
			},
		},
		"/api/judge/submissions/{submissionId}": {
			get: { tags: ["Judge Dashboard"], summary: "Get a specific submission", operationId: "judgeGetSubmission", security: bearer,
				parameters: [{ in: "path", name: "submissionId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Submission details." }, "403": { description: "Not assigned." }, "404": { description: "Not found." } },
			},
		},
		"/api/judge/evaluations": {
			get: { tags: ["Judge Dashboard"], summary: "All evaluations assigned to judge", operationId: "judgeEvaluations", security: bearer,
				responses: { "200": { description: "Evaluations with scores." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/judge/evaluations/{id}": {
			get: { tags: ["Judge Dashboard"], summary: "Get a specific evaluation", operationId: "judgeEvaluationById", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Evaluation detail." }, "403": { description: "Not assigned." }, "404": { description: "Not found." } },
			},
		},
		// ── Team ───────────────────────────────────────────────────────────────
		"/api/team": {
			get: { tags: ["Team"], summary: "Get all teams", operationId: "getAllTeams", security: bearer,
				responses: { "200": { description: "All teams.", content: { "application/json": { schema: { type: "object", properties: { teams: { type: "array", items: { $ref: "#/components/schemas/Team" } } } } } } }, "401": { description: "Not authenticated." } },
			},
			post: { tags: ["Team"], summary: "Create a team", operationId: "createTeam", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTeamRequest" } } } },
				responses: { "201": { description: "Team created." }, "400": err("Duplicate name.") as object, "401": { description: "Not authenticated." }, "403": { description: "Role not STUDENT." } },
			},
		},
		"/api/team/my": {
			get: { tags: ["Team"], summary: "Get my teams", operationId: "getMyTeams", security: bearer,
				responses: { "200": { description: "Teams the user created or belongs to." }, "401": { description: "Not authenticated." } },
			},
		},
		"/api/team/name/{name}": {
			get: { tags: ["Team"], summary: "Get team by name", operationId: "getTeamByName", security: bearer,
				parameters: [{ in: "path", name: "name", required: true, schema: { type: "string" }, example: "Alpha Squad" }],
				responses: { "200": { description: "Team found." }, "404": err("Team not found.") as object, "401": { description: "Not authenticated." } },
			},
		},
		"/api/team/{id}": {
			get: { tags: ["Team"], summary: "Get team by ID", operationId: "getTeamById", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Team found." }, "404": err("Team not found.") as object },
			},
			put: { tags: ["Team"], summary: "Update a team", operationId: "updateTeam", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateTeamRequest" } } } },
				responses: { "200": { description: "Team updated." }, "400": err("Not found or error.") as object, "403": { description: "Role not STUDENT." } },
			},
			delete: { tags: ["Team"], summary: "Delete a team", operationId: "deleteTeam", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Team deleted." }, "400": err("Not found.") as object, "403": { description: "Role not STUDENT." } },
			},
		},
		"/api/team/{id}/members": {
			post: { tags: ["Team"], summary: "Add a member", operationId: "addTeamMember", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, description: "Team ID", schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MemberRequest" } } } },
				responses: { "201": { description: "Member added." }, "400": err("Already a member.") as object, "403": { description: "Role not STUDENT." } },
			},
			delete: { tags: ["Team"], summary: "Remove a member", operationId: "removeTeamMember", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, description: "Team ID", schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MemberRequest" } } } },
				responses: { "200": { description: "Member removed." }, "400": err("Member not found.") as object, "403": { description: "Role not STUDENT." } },
			},
		},
		// ── Project ────────────────────────────────────────────────────────────
		"/api/project": {
			get: { tags: ["Project"], summary: "Get all projects", operationId: "getAllProjects", security: bearer,
				responses: { "200": { description: "All projects.", content: { "application/json": { schema: { type: "object", properties: { projects: { type: "array", items: { $ref: "#/components/schemas/Project" } } } } } } }, "401": { description: "Not authenticated." } },
			},
			post: { tags: ["Project"], summary: "Create a project", operationId: "createProject", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProjectRequest" } } } },
				responses: { "201": { description: "Project created.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, project: { $ref: "#/components/schemas/Project" } } } } } }, "400": err("Validation error.") as object, "403": { description: "Role not STUDENT." } },
			},
		},
		"/api/project/{id}": {
			get: { tags: ["Project"], summary: "Get project by ID", operationId: "getProjectById", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Project found." }, "404": err("Not found.") as object },
			},
			put: { tags: ["Project"], summary: "Update a project", operationId: "updateProject", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateProjectRequest" } } } },
				responses: { "200": { description: "Project updated." }, "400": err("Not found or permissions.") as object, "403": { description: "Role not STUDENT." } },
			},
			delete: { tags: ["Project"], summary: "Delete a project", operationId: "deleteProject", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Project deleted." }, "400": err("Not found or permissions.") as object, "403": { description: "Role not STUDENT." } },
			},
		},
		"/api/project/team/{teamId}": {
			get: { tags: ["Project"], summary: "Get projects by team", operationId: "getProjectsByTeam", security: bearer,
				parameters: [{ in: "path", name: "teamId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Projects for the team." }, "404": err("Team not found.") as object },
			},
		},
		// ── Submission ─────────────────────────────────────────────────────────
		"/api/submission": {
			post: { tags: ["Submission"], summary: "Submit a project", operationId: "createSubmission", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSubmissionRequest" } } } },
				responses: {
					"201": { description: "Submission created.", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, submission: { $ref: "#/components/schemas/Submission" } } } } } },
					"400": err("Validation error or insufficient permissions.") as object, "403": { description: "Role not STUDENT." },
				},
			},
		},
		"/api/submission/{id}": {
			get: { tags: ["Submission"], summary: "Get submission by ID", operationId: "getSubmissionById", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Submission found." }, "404": err("Not found.") as object },
			},
		},
		"/api/submission/{id}/status": {
			patch: { tags: ["Submission"], summary: "Update submission status", operationId: "updateSubmissionStatus", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["SUBMITTED", "EVALUATING", "EVALUATED", "REJECTED"] } } } } } },
				responses: { "200": { description: "Status updated." }, "400": err("Invalid status or not found.") as object, "403": { description: "Role not JUDGE." } },
			},
		},
		"/api/submission/project/{projectId}": {
			get: { tags: ["Submission"], summary: "Get all submissions for a project", operationId: "getSubmissionsByProject", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "All versions, newest first." }, "404": err("Project not found.") as object },
			},
		},
		"/api/submission/project/{projectId}/latest": {
			get: { tags: ["Submission"], summary: "Get latest submission for a project", operationId: "getLatestSubmission", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Latest submission." }, "404": err("Not found.") as object },
			},
		},
		// ── Evaluation ─────────────────────────────────────────────────────────
		"/api/evaluation": {
			post: { tags: ["Evaluation"], summary: "Create an evaluation (ADMIN)", operationId: "createEvaluation", security: bearer,
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["projectId", "submissionId"], properties: { projectId: { type: "string" }, submissionId: { type: "string" } } } } } },
				responses: { "201": { description: "Evaluation created." }, "400": err("Validation error or already exists.") as object, "403": { description: "Role not ADMIN." } },
			},
		},
		"/api/evaluation/{id}": {
			get: { tags: ["Evaluation"], summary: "Get evaluation by ID", operationId: "getEvaluationById", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": ok("Evaluation found.", "#/components/schemas/Evaluation"), "404": err("Not found.") as object },
			},
		},
		"/api/evaluation/project/{projectId}": {
			get: { tags: ["Evaluation"], summary: "Get evaluations for a project", operationId: "getEvaluationsByProject", security: bearer,
				parameters: [{ in: "path", name: "projectId", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "List of evaluations." }, "404": err("Project not found.") as object },
			},
		},
		"/api/evaluation/submission/{submissionId}": {
			get: { tags: ["Evaluation"], summary: "Get evaluation for a submission", operationId: "getEvaluationBySubmission", security: bearer,
				parameters: [{ in: "path", name: "submissionId", required: true, schema: { type: "string" } }],
				responses: { "200": ok("Evaluation found.", "#/components/schemas/Evaluation"), "404": err("Not found.") as object },
			},
		},
		"/api/evaluation/{id}/assign-judge": {
			patch: { tags: ["Evaluation"], summary: "Assign a judge (ADMIN)", operationId: "assignJudge", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["judgeId"], properties: { judgeId: { type: "string" } } } } } },
				responses: { "200": { description: "Judge assigned." }, "400": err("Not found.") as object, "403": { description: "Role not ADMIN." } },
			},
		},
		"/api/evaluation/{id}/ai-score": {
			patch: { tags: ["Evaluation"], summary: "Record AI score (ADMIN)", operationId: "setAiScore", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["aiScore"], properties: { aiScore: { type: "number", example: 86 }, feedback: { type: "string" } } } } } },
				responses: { "200": { description: "AI score recorded." }, "400": err("Not found.") as object, "403": { description: "Role not ADMIN." } },
			},
		},
		"/api/evaluation/{id}/judge-score": {
			patch: { tags: ["Evaluation"], summary: "Judge submits score", operationId: "setJudgeScore", security: bearer,
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["judgeScore"], properties: { judgeScore: { type: "number", example: 92 }, feedback: { type: "string" } } } } } },
				responses: { "200": { description: "Score recorded." }, "400": err("Not assigned or not found.") as object, "403": { description: "Role not JUDGE." } },
			},
		},
		"/api/evaluation/{id}/finalize": {
			patch: { tags: ["Evaluation"], summary: "Finalize evaluation (ADMIN)", operationId: "finalizeEvaluation", security: bearer,
				description: "Computes finalScore = (aiScore × 0.4) + (judgeScore × 0.6) and sets status to COMPLETED.",
				parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Evaluation finalized with finalScore." }, "400": err("Missing scores or not found.") as object, "403": { description: "Role not ADMIN." } },
			},
		},
		"/api/evaluation/pdf":{
			post:{
				tags:["Evaluation"],
				summary:"Get the response from the LLM regarding the PDF report",
				description:"Returns LLM generated response based on the given rubrics in prompt template",
				requestBody:{
					required:true,
					content:{
						"application/json":{
							schema:{
								type:"object",
								required:["reportText"],
								properties:{
									reportText:{
										type:"string",
										description:"Extracted text from the PDF report",
									},
								},
							},
						},
					},
				},
				operationId:"getEvaluation-PDF",
				responses:{
					"200":{
						description:"LLM response generation completed regarding PDF report.",
						content: {
							"application/json":{
								schema:{
									$ref: "#/components/schemas/PdfEvaluationResponse",	
								},
							},
						},
					},
				}
			},
		},
	},
};
