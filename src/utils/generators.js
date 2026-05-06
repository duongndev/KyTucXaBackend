import crypto from 'crypto';

// Generate payment code
export const generatePaymentCode = () => {
    const prefix = 'PAY';
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${year}${month}${day}${random}`;
};

// Generate contract code
export const generateContractCode = async () => {
    const prefix = 'CTR';
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${year}${month}${random}`;
};

// Generate invoice code
export const generateInvoiceCode = async () => {
    const prefix = 'INV';
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${year}${month}${random}`;
};

// Generate support request code
export const generateSupportRequestCode = () => {
    const prefix = 'SR';
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${year}${month}${random}`;
};

// Generate HMAC SHA256 signature
export const createHmacSignature = (data, secretKey) => {
    return crypto
        .createHmac('sha256', secretKey)
        .update(data)
        .digest('hex');
};

// Generate random string
export const generateRandomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Generate room code
export const generateRoomCode = (buildingCode, floor, roomNumber) => {
    return `${buildingCode}-${floor.toString().padStart(2, '0')}${roomNumber.toString().padStart(2, '0')}`;
};

// Generate building code
export const generateBuildingCode = (buildingName) => {
    const words = buildingName.split(' ');
    const code = words.map(word => word.charAt(0).toUpperCase()).join('');
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `${code}${random}`;
};

/**
 * Generate unique maintenance request code
 * Format: REP + timestamp + random (e.g., REP20260421001)
 */
export const generateMaintenanceCode = async () => {
  const prefix = "REP";
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  let code = `${prefix}${timestamp}${random}`;

  // Check uniqueness
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Dynamic import to avoid circular dependency
    const { default: MaintenanceRequest } = await import("../models/maintenance/maintenanceRequest.model.js");
    const existing = await MaintenanceRequest.findOne({ requestCode: code });

    if (!existing) {
      isUnique = true;
    } else {
      // Regenerate with new random
      const newRandom = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
      code = `${prefix}${timestamp}${newRandom}`;
      attempts++;
    }
  }

  return code;
};

// Generate registration code
export const generateRegistrationCode = () => {
  const prefix = 'REG';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
};

// Generate student code
export const generateStudentCode = () => {
  const prefix = 'STU';
  const year = new Date().getFullYear().toString().slice(2);
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${prefix}${year}${random}`;
};

// Generate OTP code
export const generateOTPCode = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

// Generate reference code
export const generateReferenceCode = () => {
  return 'REF' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
};
