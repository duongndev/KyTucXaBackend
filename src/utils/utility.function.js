import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Tạo access token
const generateAccessToken = async (user) => {
  return await jwt.sign(
    { 
      id: user._id, 
      role: user.role, 
      email: user.email,
      type: 'access'
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "1d",
    }
  );
};

// Tạo refresh token
const generateRefreshToken = async (user) => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
  }
  
  return await jwt.sign(
    { 
      id: user._id, 
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d", // 7 ngày
    }
  );
};

// Verify access token
const verifyAccessToken = async (token) => {
  return await jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

// Verify refresh token
const verifyRefreshToken = async (token) => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
  }
  return await jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(13);
  return await bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
  const result = await bcrypt.compare(password, hash);
  return result;
};


// Helper: Sanitize input để tránh XSS
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Loại bỏ < >
    .replace(/javascript:/gi, '') // Loại bỏ javascript:
    .replace(/on\w+=/gi, '') // Loại bỏ event handlers
    .trim();
}

// Helper: Generate secure random string
export function generateSecureToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate OTP
export function generateOTP(length = 6) {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper: Check if IP is in allowed range
function isIPAllowed(ip, allowedIPs = []) {
  if (allowedIPs.length === 0) return true;
  return allowedIPs.includes(ip);
}



export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  sanitizeInput,
  isIPAllowed,
};
