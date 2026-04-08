import mongoose from "mongoose";
/**
 * Kiểm tra định dạng email
 * @param {string} email
 * @returns {boolean}
 */
export const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
  
  // Additional checks for edge cases
  if (!email || typeof email !== 'string') return false;
  if (email.includes('..')) return false; // No consecutive dots
  if (email.startsWith('.') || email.endsWith('.')) return false; // No leading/trailing dots
  if (email.includes('@.') || email.includes('.@')) return false; // No dots adjacent to @
  
  return emailRegex.test(email);
};

/**
 * Kiểm tra độ mạnh của mật khẩu
 * Mật khẩu phải có ít nhất 8 ký tự, bao gồm ít nhất một chữ cái và một chữ số
 * @param {string} password
 * @returns {Object} { valid: boolean, message: string }
 */
export const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasUpperCase) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất một chữ hoa' };
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất một chữ thường' };
  }
  if (!hasNumbers) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất một số' };
  }
  if (!hasSpecialChar) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt' };
  }
  
  return { valid: true, message: 'Mật khẩu hợp lệ' };
};

/**
 * Kiểm tra mật khẩu xác nhận
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {Object} { valid: boolean, message: string }
 */
export const validateConfirmPassword = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return { valid: false, message: "Mật khẩu xác nhận không khớp" };
  }
  return { valid: true, message: "" };
};

/**
 * Kiểm tra định dạng số điện thoại Việt Nam
 * @param {string} phoneNumber
 * @returns {Object} { valid: boolean, message: string }
 */
export const validatePhoneNumber = (phoneNumber) => {
  // Định dạng số điện thoại Việt Nam (10 số, bắt đầu bằng 0 hoặc +84)
  const re = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
  if (!re.test(phoneNumber)) {
    return { valid: false, message: "Số điện thoại không đúng định dạng." };
  }
  return { valid: true, message: "" };
};

/**
 * Kiểm tra định dạng CCCD/CMND
 * @param {string} cccd
 * @returns {Object} { valid: boolean, message: string }
 */
export const validateCCCD = (cccd) => {
  // Kiểm tra đầu vào
  if (!cccd || typeof cccd !== 'string') {
    return { valid: false, message: "Số CCCD không được để trống" };
  }

  // Xóa khoảng trắng và ký tự đặc biệt
  const cleanedCCCD = cccd.replace(/\s+/g, '').replace(/[-_]/g, '');
  
  // Kiểm tra độ dài (9 số cho CMND, 12 số cho CCCD)
  if (cleanedCCCD.length !== 9 && cleanedCCCD.length !== 12) {
    return { valid: false, message: "Số CCCD phải gồm 9 số (CMND) hoặc 12 số (CCCD)" };
  }

  // Kiểm tra chỉ chứa số
  if (!/^\d+$/.test(cleanedCCCD)) {
    return { valid: false, message: "Số CCCD chỉ được chứa chữ số" };
  }

  // Validate theo độ dài
  if (cleanedCCCD.length === 9) {
    // Validate CMND (9 số)
    // Kiểm tra các prefix hợp lệ cho CMND cũ
    const validCMNDCodes = ['0', '1', '2', '3'];
    const firstDigit = cleanedCCCD[0];
    if (!validCMNDCodes.includes(firstDigit)) {
      return { valid: false, message: "Số CMND không hợp lệ" };
    }
  } else {
    // Validate CCCD (12 số)
    // Kiểm tra tỉnh thành hợp lệ (3 số đầu)
    const provinceCode = cleanedCCCD.substring(0, 3);
    const validProvinceCodes = [
      '001', '002', '004', '006', '008', '010', '011', '012', '014', '015', '016', '017', '018', '019', '020',
      '021', '022', '024', '025', '026', '027', '028', '029', '030', '031', '032', '033', '034', '035', '036',
      '037', '038', '040', '042', '044', '045', '046', '048', '049', '050', '052', '054', '056', '058', '060',
      '062', '064', '066', '067', '068', '070', '072', '074', '076', '078', '080', '082', '084', '086', '088', '089',
      '091', '092', '093', '094', '095', '096', '097', '098', '099'
    ];
    
    if (!validProvinceCodes.includes(provinceCode)) {
      return { valid: false, message: "Mã tỉnh thành trong số CCCD không hợp lệ" };
    }

    // Kiểm tra giới tính (số thứ 3)
    const genderDigit = cleanedCCCD[3];
    if (!['0', '1', '2', '3'].includes(genderDigit)) {
      return { valid: false, message: "Số CCCD không hợp lệ" };
    }

    // Kiểm tra năm sinh (số 4-6)
    const birthYear = parseInt(cleanedCCCD.substring(3, 6));
    const currentYear = new Date().getFullYear();
    const currentCentury = Math.floor(currentYear / 100) * 100;
    
    // Xác định thế kỷ dựa trên số giới tính
    let century;
    if (['0', '1'].includes(genderDigit)) {
      century = currentCentury; // 1900s hoặc 2000s
    } else if (['2', '3'].includes(genderDigit)) {
      century = currentCentury + 100; // 2000s hoặc 2100s
    }
    
    const fullYear = century + birthYear;
    if (fullYear < 1900 || fullYear > currentYear) {
      return { valid: false, message: "Năm sinh trong số CCCD không hợp lệ" };
    }
  }

  return { valid: true, message: "Số CCCD hợp lệ" };
};

/**
 * Kiểm tra ObjectId hợp lệ
 * @param {string} id
 * @returns {boolean}
 */
export const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

