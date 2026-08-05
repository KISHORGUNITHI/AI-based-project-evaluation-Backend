import multer from "multer";
import path from "path";
import fs from "fs";
import { cloudinary } from "../config/cloudinary";
import { env } from "../config/env";
import type { Request } from "express";

// ── Local disk storage (development only) ────────────────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, UPLOADS_DIR);
	},
	filename: (_req, file, cb) => {
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		const ext = path.extname(file.originalname);
		cb(null, `${unique}${ext}`);
	},
});

// ── Cloudinary upload helper ──────────────────────────────────────────────────
/**
 * Upload a buffer to Cloudinary and return the secure URL.
 * Used in production where disk storage is ephemeral.
 */
export async function uploadToCloudinary(
	buffer: Buffer,
	originalName: string,
): Promise<string> {
	const ext = path.extname(originalName).toLowerCase();
	const resourceType = ext === ".pdf" ? "raw" : "auto";

	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: "ai-project-evaluation",
				resource_type: resourceType,
				public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
				use_filename: false,
			},
			(error, result) => {
				if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
				resolve(result.secure_url);
			},
		);
		stream.end(buffer);
	});
}

// ── Multer instance ───────────────────────────────────────────────────────────
// In production use memory storage so we can pipe the buffer to Cloudinary.
// In development use disk storage for simplicity.
const isProduction =
	env.NODE_ENV === "production" &&
	env.CLOUDINARY_CLOUD_NAME &&
	env.CLOUDINARY_API_KEY &&
	env.CLOUDINARY_API_SECRET;

export const upload = multer({
	storage: isProduction ? multer.memoryStorage() : diskStorage,
	limits: {
		fileSize: 20 * 1024 * 1024, // 20 MB
	},
});

/**
 * Get the public URL for a file.
 * In development returns the local /uploads path.
 * In production the file should already have been uploaded to Cloudinary
 * and the URL stored in the database — this is just a fallback.
 */
export function getFileUrl(req: Request, filename: string): string {
	if (isProduction) {
		// In production, file URL comes from Cloudinary after upload
		return filename; // filename is already the full Cloudinary URL
	}
	const protocol = req.protocol;
	const host = req.get("host");
	return `${protocol}://${host}/uploads/${filename}`;
}

export const UPLOADS_DIR_PATH = UPLOADS_DIR;
