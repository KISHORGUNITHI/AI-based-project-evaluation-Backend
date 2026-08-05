/**
 * Bridge: re-exports auth middleware so that routes and tests can import
 * from "../middlewares/auth.js" (keeping feature-folder structure intact).
 */
export { requireLogin, requireRole, requireUser, requireAdmin } from "../middleware/auth";
