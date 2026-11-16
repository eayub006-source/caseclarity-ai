import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads the same DATABASE_URL as the app (from .env or the environment).
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
});
