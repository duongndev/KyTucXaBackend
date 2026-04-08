import fs from 'fs/promises';
import path from 'path';

// Simple approach for Jest compatibility
const __dirname = path.resolve();

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');

class Logger {
  constructor() {
    this.logDir = logsDir;
    this.ensureLogDirectory();
  }

  async ensureLogDirectory() {
    try {
      await fs.access(this.logDir);
    } catch {
      await fs.mkdir(this.logDir, { recursive: true });
    }
  }

  async writeLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    const logFile = path.join(this.logDir, `${level.toLowerCase()}.log`);

    try {
      await fs.appendFile(logFile, logLine);
    } catch (error) {
      console.error(`Failed to write to ${level} log:`, error);
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level}] ${timestamp}: ${message}`, meta);
    }
  }

  async info(message, meta = {}) {
    await this.writeLog('INFO', message, meta);
  }

  async warn(message, meta = {}) {
    await this.writeLog('WARN', message, meta);
  }

  async error(message, meta = {}) {
    await this.writeLog('ERROR', message, meta);
    console.error(`[ERROR] ${message}`, meta);
  }

  async debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      await this.writeLog('DEBUG', message, meta);
    }
  }

  // Log rotation utility (can be called by cron job)
  async rotateLogs(maxFiles = 10) {
    const logLevels = ['error', 'warn', 'info', 'debug'];
    
    for (const level of logLevels) {
      const logFile = path.join(this.logDir, `${level}.log`);
      
      try {
        const stats = await fs.stat(logFile);
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (stats.size > maxSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = path.join(this.logDir, `${level}-${timestamp}.log`);
          
          await fs.rename(logFile, rotatedFile);
          
          // Clean up old log files
          await this.cleanupOldLogs(level, maxFiles);
        }
      } catch (error) {
        // Log file doesn't exist or other error
        continue;
      }
    }
  }

  async cleanupOldLogs(level, maxFiles) {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(file => file.startsWith(`${level}-`) && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file)
        }));

      if (logFiles.length > maxFiles) {
        // Sort by creation time (oldest first)
        const fileStats = await Promise.all(
          logFiles.map(async file => {
            const stats = await fs.stat(file.path);
            return { ...file, ctime: stats.ctime };
          })
        );

        fileStats.sort((a, b) => a.ctime - b.ctime);
        
        // Delete oldest files
        const filesToDelete = fileStats.slice(0, fileStats.length - maxFiles);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

// Export singleton instance
const logger = new Logger();

// Auto-rotate logs daily only in production (not test mode)
let logRotationInterval;
if (process.env.NODE_ENV !== 'test') {
  logRotationInterval = setInterval(async () => {
    await logger.rotateLogs();
  }, 24 * 60 * 60 * 1000); // 24 hours
}

export default logger;

// Cleanup function for test environment
if (process.env.NODE_ENV === 'test') {
  // Add cleanup to clear interval when process exits
  process.on('exit', () => {
    if (logRotationInterval) {
      clearInterval(logRotationInterval);
    }
  });
}
