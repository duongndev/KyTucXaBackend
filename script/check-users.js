import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from '../src/models/user/user.model.js';

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');
    
    const users = await User.find({ role: 'admin' }).select('email role status isEmailVerified');
    console.log('\nAdmin users in database:');
    users.forEach(u => {
      console.log(`- Email: ${u.email}, Role: ${u.role}, Status: ${u.status}, Verified: ${u.isEmailVerified}`);
    });
    
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkUsers();
