import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { dashboardsRouter } from "./routes/dashboards.js";
import { featuresRouter } from "./routes/features.js";
import { messagesRouter } from "./routes/messages.js";
import { notificationsRouter } from "./routes/notifications.js";
import { projectsRouter } from "./routes/projects.js";
import { surveysRouter } from "./routes/surveys.js";
import { globalErrorHandler } from "./middleware.js";
import { ensureSchema } from "./db.js";

const app = express();
const port = process.env.PORT || 4000;
const swaggerDocument = YAML.load("./src/swagger.yaml");
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((origin) => origin.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "20mb" }));
app.use("/uploads", express.static("uploads"));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/auth", authRouter);
app.use("/api/dashboards", dashboardsRouter);
app.use("/api/features", featuresRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/surveys", surveysRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (_, res) => res.json({ status: "ok", service: "capstonehub-api" }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "لم يتم العثور على المسار" });
});

// Global error handler (must be last)
app.use(globalErrorHandler);

await ensureSchema();

app.listen(port, () => {
  console.log(`CapstoneHub API running on ${port}`);
});
