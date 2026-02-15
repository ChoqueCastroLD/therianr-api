import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

import { authRoutes } from "./routes/auth";
import { profileRoutes } from "./routes/profile";
import { discoverRoutes } from "./routes/discover";
import { matchRoutes } from "./routes/matches";
import { reportRoutes } from "./routes/reports";
import { blockRoutes } from "./routes/blocks";

// Validate required environment variables at startup
const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "RESEND_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || "3000");

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://localhost:5173",
  "https://therianr.com",
  "https://www.therianr.com",
];

const app = new Elysia()
  .use(
    cors({
      origin: (request) => {
        const origin = request.headers.get("origin");
        if (origin && allowedOrigins.includes(origin)) return true;
        return false;
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Validation failed", details: error.message };
    }

    const authErrors = ["Unauthorized", "Invalid token", "User not found", "Token expired"];
    if (authErrors.includes(error.message)) {
      set.status = 401;
      return { error: error.message };
    }

    console.error("Unhandled error:", error);
    set.status = 500;
    return { error: "Internal server error" };
  })
  .group("/api", (app) =>
    app
      .use(authRoutes)
      .use(profileRoutes)
      .use(discoverRoutes)
      .use(matchRoutes)
      .use(reportRoutes)
      .use(blockRoutes)
      .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  )
  .listen(PORT);

console.log(`Therianr API running at http://localhost:${app.server?.port}`);
