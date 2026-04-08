import express from "express";
const app = express();
import {
  securityMiddleware,
  cookieSecurityMiddleware,
  clearInsecureCookies,
} from "./middlewares/securityHeaders.middleware.js";
import {
  sanitizeInputs,
  detectSQLInjection,
} from "./middlewares/inputValidation.middleware.js";
import {
  noSQLSanitizer,
  detectNoSQLInjection,
  validateMongoQueries,
  logDatabaseQueries,
  preventEnumeration,
} from "./middlewares/databaseSecurity.middleware.js";
import {
  generalRateLimit,
  progressiveSlowDown,
  adaptiveRateLimit,
  trackFailedAttempts,
  ddosProtection,
} from "./middlewares/rateLimiting.middleware.js";
import logger from "morgan";
import cookieParser from "cookie-parser";
import {
  handleNotFound,
  globalErrorHandler,
} from "./middlewares/errorHandler.middleware.js";

import dotenv from "dotenv";
dotenv.config();

// Apply security middleware first
app.set("trust proxy", 1);
app.use(securityMiddleware);

// Session and cookie security
app.use(clearInsecureCookies);
app.use(cookieParser());
app.use(cookieSecurityMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Input validation and sanitization
app.use(sanitizeInputs);
app.use(detectSQLInjection);

// Database security
app.use(noSQLSanitizer);
app.use(detectNoSQLInjection);
app.use(validateMongoQueries);
app.use(logDatabaseQueries);
app.use(preventEnumeration);

// Rate limiting and DDoS protection - disable in test environment
if (process.env.NODE_ENV !== "test") {
  app.use(ddosProtection);
  app.use(generalRateLimit);
  app.use(progressiveSlowDown);
  app.use(adaptiveRateLimit);
  app.use(trackFailedAttempts);
}

app.use(logger("dev"));

// Routes
import authRoutes from './routes/auth.routes.js';
import registrationRoutes from './routes/registration.routes.js';

app.use('/api/auth', authRoutes);
app.use('/api/registrations', registrationRoutes);



app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Chào mừng bạn đến với hệ thống quản lý ký túc xá thông minh!",
  });
});

// 404 handler
app.use(handleNotFound);

// Global error handler
app.use(globalErrorHandler);

export default app;
