/**
 * Bridge: re-exports the Prisma singleton as a default export so that
 * services and tests can import from "@/db/prisma" or "../../db/prisma.js".
 */
import { prisma } from "../database";

export default prisma;
