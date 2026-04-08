import AuditLog from "../models/auditLog.model.js";

/**
 * Log security events to database with fallback to console
 * @param {string} event - Event name/type
 * @param {object} details - Event details
 * @param {object} req - Express request object
 */
async function logSecurityEvent(event, details = {}, req) {
  try {
    const entry = {
      userId: req?.user?.id || null,
      action: event,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress || "system",
      userAgent: req?.get ? (req.get("User-Agent") || "Unknown") : "System",
      severity: details?.severity || "LOW",
      status: details?.status || "SUCCESS",
      apiEndpoint: req?.originalUrl,
      httpMethod: req?.method
    };
    await AuditLog.createLog(entry);
  } catch (e) {
    // Only log to console if we're not in test mode or if it's a critical error
    if (process.env.NODE_ENV !== 'test' || event.includes('ERROR')) {
      const timestamp = new Date().toISOString();
      console.log(`[SECURITY] ${timestamp} - ${event}:`, details);
    }
  }
}

export { logSecurityEvent };
