import dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'
import { secureDBConnection } from "../middlewares/databaseSecurity.middleware.js";
import logger from "../utils/logger.util.js";

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 30000; // 30 seconds

// Calculate exponential backoff delay
const getRetryDelay = (attempt) => {
  const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
};

// Connect to MongoDB with retry logic
const connectDB = async () => {
  let lastError;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await mongoose.set("strictQuery", true);
      
      // Apply secure connection options
      const connectionOptions = {
        user: process.env.DB_USER,
        pass: process.env.DB_PASS,
        dbName: process.env.DB_NAME,
        // Connection resilience options
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      };
      
      await mongoose.connect(process.env.MONGO_URI, connectionOptions);
      
      // Setup connection monitoring
      secureDBConnection.setupConnectionMonitoring(mongoose);
      
      logger.info('MongoDB connection successful', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name
      });
      
      console.log("MongoDB connection successful");
      return; // Success, exit retry loop
      
    } catch (error) {
      lastError = error;
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = getRetryDelay(attempt);
        logger.warn(`MongoDB connection attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: error.message,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES
        });
        
        console.warn(`MongoDB connection attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  logger.error('MongoDB connection failed after all retries', {
    error: lastError.message,
    maxRetries: MAX_RETRIES
  });
  
  console.error("MongoDB connection failed after all retries");
  console.error(lastError);
  
  // In production, you might want to exit the process
  if (process.env.NODE_ENV === 'production') {
    logger.error('Exiting process due to database connection failure');
    process.exit(1);
  }
};



// Handle database connection events
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  // Only log in production or development, not in test mode
  if (process.env.NODE_ENV !== 'test') {
    logger.warn('MongoDB disconnected');
    console.warn('MongoDB disconnected');
    
    // Attempt to reconnect in production
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => {
        logger.info('Attempting to reconnect to MongoDB...');
        connectDB();
      }, 5000);
    }
  }
});

// Only setup graceful shutdown for production
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGINT', async () => {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    } catch (error) {
      logger.error('Error closing MongoDB connection', { error: error.message });
      process.exit(1);
    }
  });
}

export { connectDB,  };
