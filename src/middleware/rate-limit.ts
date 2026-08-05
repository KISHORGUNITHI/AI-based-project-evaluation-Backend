import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../lib/redis.js";

export interface RateLimitOptions {
    /** Max requests allowed in the window */
    limit: number;
    /** Window duration in seconds */
    windowSec: number;
    /** Human-readable label shown in the 429 message */
    label?: string;
}

/**
 * Redis sliding-window rate limiter middleware.
 *
 * Uses Redis INCR + EXPIRE to count requests per IP per window.
 * If Redis is unavailable, the middleware is a no-op (fail open) so a Redis
 * outage never takes down the API.
 *
 * Rate limit info is returned in standard headers:
 *   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 */
export function rateLimit(options: RateLimitOptions) {
    const { limit, windowSec, label = "API" } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        const redis = await getRedisClient();

        // Fail open — if Redis is down, let the request through
        if (!redis) return next();

        // Key by IP. For authenticated routes you could also key by userId.
        const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.socket.remoteAddress ||
            "unknown";

        const key = `rl:${label}:${ip}`;

        try {
            // Increment the counter atomically
            const current = await redis.incr(key);

            // Set expiry only on the first request in the window
            if (current === 1) {
                await redis.expire(key, windowSec);
            }

            // Calculate TTL for reset header
            const ttl = await redis.ttl(key);
            const resetTime = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSec);

            res.setHeader("X-RateLimit-Limit", limit);
            res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - current));
            res.setHeader("X-RateLimit-Reset", resetTime);

            if (current > limit) {
                res.setHeader("Retry-After", ttl > 0 ? ttl : windowSec);
                res.status(429).json({
                    error: "Too Many Requests",
                    message: `${label} rate limit exceeded. Try again in ${ttl > 0 ? ttl : windowSec} seconds.`,
                    retryAfter: ttl > 0 ? ttl : windowSec,
                });
                return;
            }

            next();
        } catch (err) {
            // Redis error during a request — fail open, log and continue
            console.error("[rateLimit] Redis error during rate check:", (err as Error).message);
            next();
        }
    };
}

// ─── Pre-configured limiters for common use cases ────────────────────────────

/** Auth endpoints — login/signup: 10 attempts per minute */
export const authRateLimit = rateLimit({
    limit: 10,
    windowSec: 60,
    label: "auth",
});

/** General API endpoints: 100 requests per minute */
export const apiRateLimit = rateLimit({
    limit: 100,
    windowSec: 60,
    label: "api",
});

/** Evaluation trigger endpoints (heavy AI pipeline): 5 per minute */
export const evaluationRateLimit = rateLimit({
    limit: 5,
    windowSec: 60,
    label: "evaluation",
});

/** File upload endpoints: 20 per minute */
export const uploadRateLimit = rateLimit({
    limit: 20,
    windowSec: 60,
    label: "upload",
});
