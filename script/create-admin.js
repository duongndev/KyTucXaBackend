import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';

// Load environment variables
dotenv.config();

// Script configuration
const ADMIN_DEFAULTS = {
  email: 'admin@gmail.com',
  password: 'Admin@123456',
  fullName: 'System Administrator'
};

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

// Create admin account
const createAdmin = async (adminData = {}) => {
  try {
    const { email, password, fullName } = { ...ADMIN_DEFAULTS, ...adminData };
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log(`Admin account with email "${email}" already exists`);
      
      if (existingAdmin.role === 'admin') {
        console.log('Existing account is already an admin');
        return existingAdmin;
      } else {
        // Update existing user to admin
        existingAdmin.role = 'admin';
        existingAdmin.status = 'active';
        existingAdmin.isEmailVerified = true;
        await existingAdmin.save();
        console.log('Updated existing user to admin role');
        return existingAdmin;
      }
    }
    
  
    // Create admin user
    const admin = await User.create({
      email,
      password,
      fullName,
      role: 'admin',
      status: 'active',
      isEmailVerified: true
    });
    
    console.log('Admin account created successfully');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role: admin`);
    console.log(`Status: active`);
    
    return admin;
    
  } catch (error) {
    console.error('Error creating admin account:', error.message);
    throw error;
  }
};

// Main function
const main = async () => {
  console.log('Starting admin account creation script...\n');
  
  // Get command line arguments
  const args = process.argv.slice(2);
  const customEmail = args.find(arg => arg.startsWith('--email='))?.split('=')[1];
  const customPassword = args.find(arg => arg.startsWith('--password='))?.split('=')[1];
  const customFullName = args.find(arg => arg.startsWith('--fullName='))?.split('=')[1];
  
  const adminData = {};
  if (customEmail) adminData.email = customEmail;
  if (customPassword) adminData.password = customPassword;
  if (customFullName) adminData.fullName = customFullName;
  
  try {
    // Connect to database
    const connected = await connectDB();
    if (!connected) {
      process.exit(1);
    }
    
    // Create admin account
    await createAdmin(adminData);
    
    console.log('\nAdmin account setup completed successfully!');
    console.log('\nLogin credentials:');
    console.log(`   Email: ${adminData.email || ADMIN_DEFAULTS.email}`);
    console.log(`   Password: ${adminData.password || ADMIN_DEFAULTS.password}`);
    console.log('\nPlease change the default password after first login!');
    
  } catch (error) {
    console.error('\nScript failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run script
main();


