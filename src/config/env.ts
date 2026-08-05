import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.string().min(1),
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.string().url(),
	FRONTEND_URL: z.string().url().default("http://localhost:5173"),
	NVIDIA_API_KEY: z.string().min(1),
	NIM_MODEL: z.string().default("meta/llama-3.3-70b-instruct"),
	AMQP_URL: z.string().min(1),
	GITHUB_TOKEN: z.string().optional(),
	BACKEND_URL: z.string().url().optional(),
	LANGFUSE_PUBLIC_KEY: z.string().optional(),
	LANGFUSE_SECRET_KEY: z.string().optional(),
	LANGFUSE_BASE_URL: z.string().optional(),
	// Redis — optional, rate limiting is disabled if not set
	REDIS_URL: z.string().url().optional(),
	REDIS_HOST: z.string().optional(),
	REDIS_PORT: z.coerce.number().optional(),
	REDIS_USERNAME: z.string().optional(),
	REDIS_PASSWORD: z.string().optional(),
	// Cloudinary — optional, falls back to local disk in development
	CLOUDINARY_CLOUD_NAME: z.string().optional(),
	CLOUDINARY_API_KEY: z.string().optional(),
	CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
