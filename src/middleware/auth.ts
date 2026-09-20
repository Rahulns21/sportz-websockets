import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.ts";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const key = req.headers["x-api-key"];

    if (typeof key !== "string" || key !== env.ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}