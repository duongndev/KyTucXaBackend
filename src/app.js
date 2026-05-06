import express from "express";
import logger from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

// Middlewares - barrel export
import {
  securityMiddleware,
  cookieSecurityMiddleware,
  clearInsecureCookies,
  sanitizeInputs,
  detectSQLInjection,
  noSQLSanitizer,
  detectNoSQLInjection,
  validateMongoQueries,
  logDatabaseQueries,
  preventEnumeration,
  generalRateLimit,
  progressiveSlowDown,
  adaptiveRateLimit,
  trackFailedAttempts,
  ddosProtection,
  handleNotFound,
  globalErrorHandler,
} from "./middlewares/index.js";

// Routes - barrel export
import {
  authRoutes,
  registrationRoutes,
  uploadRoutes,
  notificationRoutes,
  buildingRoutes,
  roomRoutes,
  roomAssignmentRoutes,
  studentRoutes,
  contractRoutes,
  invoiceRoutes,
  paymentRoutes,
  utilityRoutes,
  serviceRoutes,
  billingSplitRoutes,
  semesterInvoiceRoutes,
  maintenanceRoutes,
  auditLogRoutes,
  supportRoutes,
} from "./routes/index.js";

dotenv.config();
const app = express();

// ===== SECURITY MIDDLEWARES =====
app.set("trust proxy", 1);
app.use(securityMiddleware);
app.use(clearInsecureCookies);
app.use(cookieParser());
app.use(cookieSecurityMiddleware);

// ===== BODY PARSING =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== INPUT VALIDATION =====
app.use(sanitizeInputs);
app.use(detectSQLInjection);

// ===== DATABASE SECURITY =====
app.use(noSQLSanitizer);
app.use(detectNoSQLInjection);
app.use(validateMongoQueries);
app.use(logDatabaseQueries);
app.use(preventEnumeration);

// ===== RATE LIMITING (disable in test) =====
if (process.env.NODE_ENV !== "test") {
  app.use(ddosProtection);
  app.use(generalRateLimit);
  app.use(progressiveSlowDown);
  app.use(adaptiveRateLimit);
  app.use(trackFailedAttempts);
}

app.use(logger("dev"));

// ===== API ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/room-assignments', roomAssignmentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/utilities', utilityRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/billing-splits', billingSplitRoutes);
app.use('/api/semester-invoices', semesterInvoiceRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/support', supportRoutes);

// ===== HEALTH CHECK =====
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
