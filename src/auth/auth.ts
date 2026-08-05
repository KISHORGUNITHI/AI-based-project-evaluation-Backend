import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, openAPI } from "better-auth/plugins";
import { env } from "../config/env";
import { prisma } from "../database";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: [
		env.BETTER_AUTH_URL,
		env.FRONTEND_URL,
		"http://localhost:3000",
		"http://localhost:5173",
		"http://localhost:5174",
		"http://localhost:5175",
		"http://localhost:5176",
		"http://localhost:4173",
		"https://www.postman.com",
		"https://web.postman.co",
		// Vercel — wildcard handled via CORS in app.ts; list known ones here
		"https://ai-project-evaluation.vercel.app",
		"https://ai-project-evaluation-git-main-mohan0621s-projects.vercel.app",
		// Correct production frontend URL
		"https://ai-based-project-evaluation.vercel.app",
	],
	emailAndPassword: {
		enabled: true,
	},
	user: {
		// expose the custom `role` and `username` columns so they are included in session.user
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "STUDENT",
				input: true,
			},
			username: {
				type: "string",
				required: false,
				input: true,
			},
			mustChangePassword: {
				type: "boolean",
				required: false,
				defaultValue: false,
				input: false, // only set by admin, not by the user themselves
			},
		},
	},
	plugins: [
		openAPI(),
		bearer(), // allows Authorization: Bearer <token> for getSession
	],
});
