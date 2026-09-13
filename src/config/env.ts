import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(8000),
    HOST: z.string().min(1).default("0.0.0.0"),
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment variables:");
    console.error(parsed.error.issues);
    process.exit(1);
}

export const env = parsed.data;