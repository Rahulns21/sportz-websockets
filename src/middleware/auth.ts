import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.ts";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const key = req.headers["x-api-key"];

    if (typeof key !== "string") {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const keyBuf = Buffer.from(key);
    const adminBuf = Buffer.from(env.ADMIN_API_KEY);

    if (keyBuf.length !== adminBuf.length || !timingSafeEqual(keyBuf, adminBuf)) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}