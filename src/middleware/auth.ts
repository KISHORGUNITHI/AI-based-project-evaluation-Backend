import { auth } from "../auth/auth";

export async function requireLogin(
    req: any,
    res: any,
    next: Function
) {
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        req.user = session.user;
        next();
    } catch (error) {
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export async function requireUser(
    req: any,
    res: any,
    next: Function
) {
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        req.user = session.user;
        next();
    } catch (error) {
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export async function requireAdmin(
    req: any,
    res: any,
    next: Function
) {
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session || (session.user as any).role !== "ADMIN") {
            return res.status(403).json({ message: "Forbidden" });
        }
        req.user = session.user;
        next();
    } catch (error) {
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const requireRole = (
    role: "STUDENT" | "JUDGE" | "ADMIN"
) => {
    return async (
        req: any,
        res: any,
        next: Function
    ) => {
        try {
            const session = await auth.api.getSession({ headers: req.headers });
            if (!session) {
                return res.status(401).json({ message: "Not authenticated" });
            }
            if ((session.user as any).role !== role) {
                return res.status(403).json({ message: `Requires ${role} role` });
            }
            req.user = session.user;
            next();
        } catch (error) {
            return res.status(500).json({ message: "Internal Server Error" });
        }
    };
};