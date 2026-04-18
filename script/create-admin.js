import dotenv from 'dotenv';
import mongoose from 'mongoose';
import readline from 'readline';
import User from '../src/models/user/user.model.js';

// Load environment variables
dotenv.config();

// Admin account configuration with all required fields
const ADMIN_DEFAULTS = {
  email: 'admin@gmail.com',
  password: 'Admin@123456',
  fullName: 'System Administrator',
  phoneNumber: '0123456789',
  identityCard: '123456789',
  gender: 'male',
  dateOfBirth: '1990-01-01'
};

// Validation patterns
const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(0[0-9]{9,10})$/,
  identityCard: /^[0-9]{9,12}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
};

// Create readline interface for interactive input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user input
const prompt = (question) => new Promise((resolve) => {
  rl.question(question, (answer) => resolve(answer.trim()));
});

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.set("strictQuery", true);
    
    const connectionOptions = {
      user: process.env.DB_USER,
      pass: process.env.DB_PASS,
      dbName: process.env.DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };
    
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);
    console.log('Connected to MongoDB successfully');
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    return false;
  }
};

// Validation functions
const validateEmail = (email) => VALIDATION_PATTERNS.email.test(email);
const validatePassword = (password) => VALIDATION_PATTERNS.password.test(password);
const validatePhone = (phone) => !phone || VALIDATION_PATTERNS.phone.test(phone);
// const validateIdentityCard = (id) => !id || VALIDATION_PATTERNS.identityCard.test(id);
const validateGender = (gender) => !gender || ['male', 'female', 'other'].includes(gender.toLowerCase());

// Collect admin information interactively
const collectAdminInfo = async () => {
  console.log('\n=== TẠO TÀI KHOẢN ADMIN ===\n');
  console.log('Nhập thông tin admin (bỏ trống để sử dụng giá trị mặc định):\n');

  const adminData = {};

  // Full Name (required)
  let fullName = await prompt('Họ và tên [System Administrator]: ');
  adminData.fullName = fullName || ADMIN_DEFAULTS.fullName;

  // Email (required)
  let email = await prompt('Email [admin@gmail.com]: ');
  email = email || ADMIN_DEFAULTS.email;
  while (email && !validateEmail(email)) {
    console.log('Email không hợp lệ!');
    email = await prompt('Email [admin@gmail.com]: ') || ADMIN_DEFAULTS.email;
  }
  adminData.email = email;

  // Password (required)
  let password = await prompt('Mật khẩu [Admin@123456]: ');
  password = password || ADMIN_DEFAULTS.password;
  while (password && !validatePassword(password)) {
    console.log('Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số!');
    password = await prompt('Mật khẩu [Admin@123456]: ') || ADMIN_DEFAULTS.password;
  }
  adminData.password = password;

  // Phone Number (optional)
  let phoneNumber = await prompt('Số điện thoại (tùy chọn): ');
  while (phoneNumber && !validatePhone(phoneNumber)) {
    console.log('Số điện thoại không hợp lệ (phải có 10-11 số, bắt đầu bằng 0)!');
    phoneNumber = await prompt('Số điện thoại (tùy chọn): ');
  }
  if (phoneNumber) adminData.phoneNumber = phoneNumber;

  // Identity Card (optional)
  let identityCard = await prompt('Số CMND/CCCD (tùy chọn): ');
  // while (identityCard && !validateIdentityCard(identityCard)) {
  //   console.log('Số CMND/CCCD không hợp lệ (phải có 9-12 số)!');
  //   identityCard = await prompt('Số CMND/CCCD (tùy chọn): ');
  // }
  if (identityCard) adminData.identityCard = identityCard;

  // Gender (optional)
  let gender = await prompt('Giới tính (male/female/other, tùy chọn): ');
  while (gender && !validateGender(gender)) {
    console.log('Giới tính không hợp lệ! Chọn: male, female, hoặc other');
    gender = await prompt('Giới tính (male/female/other, tùy chọn): ');
  }
  if (gender) adminData.gender = gender.toLowerCase();

  // Date of Birth (optional)
  let dateOfBirth = await prompt('Ngày sinh (YYYY-MM-DD, tùy chọn): ');
  if (dateOfBirth) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    while (dateOfBirth && !dateRegex.test(dateOfBirth)) {
      console.log('Định dạng ngày không hợp lệ! Sử dụng YYYY-MM-DD');
      dateOfBirth = await prompt('Ngày sinh (YYYY-MM-DD, tùy chọn): ');
    }
    if (dateOfBirth) adminData.dateOfBirth = new Date(dateOfBirth);
  }

  return adminData;
};

// Create admin account
const createAdmin = async (adminData = {}) => {
  try {
    const {
      email,
      password,
      fullName,
      phoneNumber,
      identityCard,
      gender,
      dateOfBirth
    } = adminData;

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log(`\nTài khoản với email "${email}" đã tồn tại`);

      if (existingAdmin.role === 'admin') {
        console.log('Tài khoản này đã là admin');
        return existingAdmin;
      } else {
        existingAdmin.role = 'admin';
        existingAdmin.status = 'active';
        existingAdmin.isEmailVerified = true;
        await existingAdmin.save();
        console.log('Đã cập nhật tài khoản thành admin');
        return existingAdmin;
      }
    }

    // Create admin user with full information
    const admin = await User.create({
      email,
      password,
      fullName,
      phoneNumber: phoneNumber || undefined,
      identityCard: identityCard || undefined,
      gender: gender || undefined,
      dateOfBirth: dateOfBirth || undefined,
      role: 'admin',
      status: 'active',
      isEmailVerified: true,
      isAccountVerified: true
    });

    console.log('\n=== TÀI KHOẢN ADMIN ĐÃ TẠO THÀNH CÔNG ===');
    console.log(`Email: ${email}`);
    console.log(`Họ tên: ${fullName}`);
    console.log(`Vai trò: admin`);
    console.log(`Trạng thái: active`);
    if (phoneNumber) console.log(`SĐT: ${phoneNumber}`);
    if (identityCard) console.log(`CMND/CCCD: ${identityCard}`);
    if (gender) console.log(`Giới tính: ${gender}`);
    if (dateOfBirth) console.log(`Ngày sinh: ${dateOfBirth.toISOString().split('T')[0]}`);

    return admin;

  } catch (error) {
    console.error('Lỗi khi tạo tài khoản admin:', error.message);
    throw error;
  }
};

// Main function
const main = async () => {
  try {
    // Check for quick mode (command line args)
    const args = process.argv.slice(2);
    const quickMode = args.includes('--quick');

    let adminData = {};

    if (quickMode) {
      // Quick mode: parse all arguments from command line
      console.log('Quick mode: Parsing command line arguments\n');

      const getArg = (name) => args.find(arg => arg.startsWith(`${name}=`))?.split('=')[1];

      adminData = {
        email: getArg('--email') || ADMIN_DEFAULTS.email,
        password: getArg('--password') || ADMIN_DEFAULTS.password,
        fullName: getArg('--fullName') || ADMIN_DEFAULTS.fullName,
        phoneNumber: getArg('--phone') || '',
        identityCard: getArg('--identity') || '',
        gender: getArg('--gender') || '',
        dateOfBirth: getArg('--dob') || ''
      };

      // Validate email
      if (!validateEmail(adminData.email)) {
        console.error(`Email không hợp lệ: ${adminData.email}`);
        rl.close();
        process.exit(1);
      }

      // Validate password
      if (!validatePassword(adminData.password)) {
        console.error(`Mật khẩu không hợp lệ: phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số`);
        rl.close();
        process.exit(1);
      }

      // Validate phone if provided
      if (adminData.phoneNumber && !validatePhone(adminData.phoneNumber)) {
        console.error(`Số điện thoại không hợp lệ: ${adminData.phoneNumber}`);
        rl.close();
        process.exit(1);
      }

      // Validate identity card if provided
      if (adminData.identityCard && !validateIdentityCard(adminData.identityCard)) {
        console.error(`Số CMND/CCCD không hợp lệ: ${adminData.identityCard}`);
        rl.close();
        process.exit(1);
      }

      // Validate gender if provided
      if (adminData.gender && !validateGender(adminData.gender)) {
        console.error(`Giới tính không hợp lệ: ${adminData.gender} (chọn: male, female, other)`);
        rl.close();
        process.exit(1);
      }

      // Validate date of birth if provided
      if (adminData.dateOfBirth) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(adminData.dateOfBirth)) {
          console.error(`Ngày sinh không hợp lệ: ${adminData.dateOfBirth} (dùng định dạng YYYY-MM-DD)`);
          rl.close();
          process.exit(1);
        }
        adminData.dateOfBirth = new Date(adminData.dateOfBirth);
      }

      console.log('Thông tin admin sẽ tạo:');
      console.log(`  Email: ${adminData.email}`);
      console.log(`  Họ tên: ${adminData.fullName}`);
      console.log(`  SĐT: ${adminData.phoneNumber || '(không có)'}`);
      console.log(`  CMND/CCCD: ${adminData.identityCard || '(không có)'}`);
      console.log(`  Giới tính: ${adminData.gender || '(không có)'}`);
      console.log(`  Ngày sinh: ${adminData.dateOfBirth ? adminData.dateOfBirth.toISOString().split('T')[0] : '(không có)'}`);
      console.log('');

    } else {
      // Interactive mode: collect full information
      adminData = await collectAdminInfo();
    }

    // Connect to database
    const connected = await connectDB();
    if (!connected) {
      rl.close();
      process.exit(1);
    }

    // Create admin account
    await createAdmin(adminData);

    console.log('\n=== THÔNG TIN ĐĂNG NHẬP ===');
    console.log(`Email: ${adminData.email}`);
    console.log(`Mật khẩu: ${adminData.password}`);
    console.log('\nLưu ý: Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu!');

  } catch (error) {
    console.error('\nScript thất bại:', error.message);
    process.exit(1);
  } finally {
    // Close interfaces
    rl.close();
    await mongoose.connection.close();
    console.log('\nKết nối database đã đóng');
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run script
main();


