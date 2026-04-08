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
