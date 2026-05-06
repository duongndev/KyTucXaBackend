import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';

// Load environment variables
dotenv.config();

// Import all models
import User from '../src/models/user/user.model.js';
import Student from '../src/models/user/student.model.js';
import Building from '../src/models/building/building.model.js';
import Room from '../src/models/building/room.model.js';
import RoomAssignment from '../src/models/building/roomAssignment.model.js';
import RegistrationForm from '../src/models/registration/registrationForm.model.js';
import RegistrationDocument from '../src/models/registration/registrationDocument.model.js';
import RegistrationMissingDocument from '../src/models/registration/registrationMissingDocument.model.js';
import Contract from '../src/models/contract/contract.model.js';
import Invoice from '../src/models/contract/invoice.model.js';
import Payment from '../src/models/contract/payment.model.js';
import ServiceRate from '../src/models/contract/serviceRate.model.js';
import UtilityRate from '../src/models/contract/utilityRate.model.js';
import MeterReading from '../src/models/contract/meterReading.model.js';
import RoomBillingSplit from '../src/models/contract/roomBillingSplit.model.js';
import StudentBill from '../src/models/contract/studentBill.model.js';
import MaintenanceRequest from '../src/models/maintenance/maintenanceRequest.model.js';
import FAQ from '../src/models/support/faq.model.js';
import SupportTicket from '../src/models/support/supportTicket.model.js';
import Feedback from '../src/models/support/feedback.model.js';
import ChatRoom from '../src/models/support/chatRoom.model.js';
import ChatMessage from '../src/models/support/chatMessage.model.js';
import Notification from '../src/models/notification/notification.model.js';
import NotificationPreference from '../src/models/notification/notificationPreference.model.js';
import AuditLog from '../src/models/auditLog.model.js';

// Import utils
import { generateRoomCode } from '../src/utils/generators.js';

// ============================================
// CONFIGURATION
// ============================================

const ADMIN_DEFAULTS = [
  {
    email: 'admin@gmail.com',
    password: 'Admin@123456',
    fullName: 'Nguyễn Văn Quản Trị',
    phoneNumber: '0912345678',
    identityCard: '001234567891',
    gender: 'male',
    dateOfBirth: '1990-01-01'
  },
  {
    email: 'manager@kytucxa.edu.vn',
    password: 'Admin@123456',
    fullName: 'Trần Thị Quản Lý',
    phoneNumber: '0923456789',
    identityCard: '002345678902',
    gender: 'female',
    dateOfBirth: '1985-05-15'
  },
  {
    email: 'tech@kytucxa.edu.vn',
    password: 'Admin@123456',
    fullName: 'Lê Văn Kỹ Thuật',
    phoneNumber: '0934567890',
    identityCard: '003456789013',
    gender: 'male',
    dateOfBirth: '1992-10-20'
  }
];

const STUDENT_DEFAULTS = {
  password: 'Student@123',
  count: 24
};

// Validation patterns
const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(0[0-9]{9,10})$/,
  identityCard: /^[0-9]{9,12}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
};

// Data configuration
const UNIVERSITIES = [
  'Đại học Bách Khoa Hà Nội',
  'Đại học Kinh tế Quốc dân',
  'Đại học Ngoại thương',
  'Đại học Quốc gia Hà Nội',
  'Học viện Công nghệ Bưu chính Viễn thông',
  'Đại học Thương mại',
  'Đại học Lao động Xã hội',
  'Đại học Sư phạm Hà Nội'
];

const MAJORS = [
  'Công nghệ thông tin', 'Kinh tế', 'Quản trị kinh doanh',
  'Kế toán', 'Marketing', 'Khoa học máy tính',
  'An toàn thông tin', 'Trí tuệ nhân tạo'
];

const ROOM_TYPES = [
  { type: '2-bed', capacity: 2, price: 1200000 },
  { type: '4-bed', capacity: 4, price: 800000 },
  { type: '6-bed', capacity: 6, price: 600000 },
  { type: '8-bed', capacity: 8, price: 500000 }
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);
const getCurrentYear = () => new Date().getFullYear();

// Generate unique uppercase code
const generateUniqueCode = (prefix) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}${timestamp}${random}`.toUpperCase();
};

// Generate student ID (uppercase)
const generateStudentId = () => {
  const year = new Date().getFullYear().toString().slice(2);
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `STU${year}${random}`.toUpperCase();
};

// Validation functions
const validateEmail = (email) => VALIDATION_PATTERNS.email.test(email);
const validatePassword = (password) => VALIDATION_PATTERNS.password.test(password);

// Connect to database (similar to create-admin.js)
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

// ============================================
// DATA CREATION FUNCTIONS
// ============================================

// Create admin users
const createAdminUsers = async () => {
  console.log('\n👤 Step 1: Creating Admin Users...');
  
  const admins = [];
  const users = [];
  
  for (const adminConfig of ADMIN_DEFAULTS) {
    try {
      const existingAdmin = await User.findOne({ email: adminConfig.email });
      
      if (existingAdmin) {
        console.log(`   ✓ Admin exists: ${adminConfig.email}`);
        if (existingAdmin.role !== 'admin') {
          existingAdmin.role = 'admin';
          existingAdmin.status = 'active';
          existingAdmin.isEmailVerified = true;
          existingAdmin.isAccountVerified = true;
          await existingAdmin.save();
          console.log(`   ✓ Updated to admin: ${adminConfig.email}`);
        }
        admins.push(existingAdmin);
        users.push(existingAdmin);
        continue;
      }
      
      const admin = await User.create({
        email: adminConfig.email,
        password: adminConfig.password,
        fullName: adminConfig.fullName,
        phoneNumber: adminConfig.phoneNumber,
        identityCard: adminConfig.identityCard,
        gender: adminConfig.gender,
        dateOfBirth: new Date(adminConfig.dateOfBirth),
        role: 'admin',
        status: 'active',
        isEmailVerified: true,
        isAccountVerified: true,
        lastLoginAt: new Date()
      });
      
      console.log(`   ✓ Admin created: ${admin.email}`);
      admins.push(admin);
      users.push(admin);
      
    } catch (error) {
      console.error(`   ✗ Error creating admin ${adminConfig.email}:`, error.message);
    }
  }
  
  return { admins, users, primaryAdmin: admins[0] };
};

// Create service rates
const createServiceRates = async (primaryAdmin) => {
  console.log('\n💼 Step 2: Creating Service Rates...');
  
  try {
    const servicesResult = await ServiceRate.createDefaultServices(primaryAdmin._id);
    const serviceRates = [...servicesResult.created, ...servicesResult.existing];
    console.log(`   ✓ ${serviceRates.length} services ready`);
    return serviceRates;
  } catch (error) {
    console.error(`   ✗ Error creating service rates:`, error.message);
    return [];
  }
};

// Create utility rates
const createUtilityRates = async (primaryAdmin) => {
  console.log('\n⚡ Step 3: Creating Utility Rates...');
  
  try {
    const utilityResult = await UtilityRate.createDefaultRates(primaryAdmin._id);
    const utilityRates = [];
    if (utilityResult.electricity) utilityRates.push(utilityResult.electricity);
    if (utilityResult.water) utilityRates.push(utilityResult.water);
    console.log(`   ✓ ${utilityRates.length} utility rates ready`);
    return utilityRates;
  } catch (error) {
    console.error(`   ✗ Error creating utility rates:`, error.message);
    return [];
  }
};

// Create buildings
const createBuildings = async () => {
  console.log('\n🏢 Step 4: Creating Buildings...');
  
  const buildingConfigs = [
    { code: 'A', name: 'Tòa nhà A (Nam)', type: 'male', floors: 5 },
    { code: 'B', name: 'Tòa nhà B (Nữ)', type: 'female', floors: 5 },
    { code: 'C', name: 'Tòa nhà C (Nam)', type: 'male', floors: 6 },
    { code: 'D', name: 'Tòa nhà D (Nữ)', type: 'female', floors: 6 }
  ];
  
  const buildings = [];
  
  for (const config of buildingConfigs) {
    try {
      let building = await Building.findOne({ buildingCode: config.code });
      
      if (!building) {
        building = await Building.create({
          buildingCode: config.code,
          buildingName: config.name,
          buildingType: config.type,
          totalFloors: config.floors,
          address: `Khu KTX - ${config.name}`,
          description: `${config.name} - Phòng cho sinh viên ${config.type === 'male' ? 'nam' : 'nữ'}`,
          status: 'active',
          amenities: ['wifi', 'parking', 'laundry', 'security'],
          stats: { totalRooms: 0, availableRooms: 0, occupiedRooms: 0, totalCapacity: 0, currentOccupancy: 0 }
        });
      }
      
      buildings.push(building);
      console.log(`   ✓ ${building.buildingName}`);
      
    } catch (error) {
      console.error(`   ✗ Error creating building ${config.code}:`, error.message);
    }
  }
  
  return buildings;
};

// Create rooms
const createRooms = async (buildings) => {
  console.log('\n🚪 Step 5: Creating Rooms...');
  
  const rooms = [];
  
  for (const building of buildings) {
    for (let floor = 1; floor <= building.totalFloors; floor++) {
      for (let roomNum = 1; roomNum <= 4; roomNum++) {
        try {
          const roomType = faker.helpers.arrayElement(ROOM_TYPES);
          const roomCode = generateRoomCode(building.buildingCode, floor, roomNum);
          
          let room = await Room.findOne({ roomCode });
          
          if (!room) {
            room = await Room.create({
              buildingId: building._id,
              roomNumber: `${floor}0${roomNum}`,
              floor: floor,
              roomCode: roomCode,
              roomType: roomType.type,
              capacity: roomType.capacity,
              currentOccupancy: 0,
              roomStatus: 'available',
              gender: building.buildingType,
              area: faker.number.int({ min: 20, max: 40 }),
              pricePerMonth: roomType.price,
              facilities: [
                { name: 'Giường', quantity: roomType.capacity, status: 'good' },
                { name: 'Tủ quần áo', quantity: roomType.capacity, status: 'good' },
                { name: 'Bàn học', quantity: roomType.capacity, status: 'good' },
                { name: 'Quạt trần', quantity: 1, status: 'good' },
                ...(roomType.type === '2-bed' || roomType.type === '4-bed' ? 
                  [{ name: 'Điều hòa', quantity: 1, status: 'good' }] : [])
              ],
              assignedStudents: [],
              notes: null
            });
          }
          
          rooms.push(room);
          
        } catch (error) {
          console.error(`   ✗ Error creating room:`, error.message);
        }
      }
    }
    
    // Update building stats
    const buildingRooms = rooms.filter(r => r.buildingId.toString() === building._id.toString());
    const totalCapacity = buildingRooms.reduce((sum, r) => sum + r.capacity, 0);
    await Building.findByIdAndUpdate(building._id, {
      'stats.totalRooms': buildingRooms.length,
      'stats.availableRooms': buildingRooms.length,
      'stats.totalCapacity': totalCapacity
    });
  }
  
  console.log(`   ✓ ${rooms.length} rooms created`);
  return rooms;
};

// Create students
const createStudents = async () => {
  console.log('\n👨‍🎓 Step 6: Creating Students...');
  
  const students = [];
  const users = [];
  const studentPassword = STUDENT_DEFAULTS.password;
  
  for (let i = 0; i < STUDENT_DEFAULTS.count; i++) {
    try {
      const gender = i < 12 ? 'male' : 'female';
      const firstName = gender === 'female' ? faker.person.firstName('female') : faker.person.firstName('male');
      const lastName = faker.person.lastName();
      const fullName = `${lastName} ${firstName}`;
      
      // Create User
      let user = await User.findOne({ email: `student${i + 1}@student.edu.vn` });
      
      if (!user) {
        user = await User.create({
          fullName: fullName,
          email: `student${i + 1}@student.edu.vn`,
          password: studentPassword,
          role: 'student',
          identityCard: faker.string.numeric(12),
          dateOfBirth: faker.date.birthdate({ min: 18, max: 25, mode: 'age' }),
          gender: gender,
          phoneNumber: `0${faker.string.numeric(9)}`,
          status: 'active',
          isEmailVerified: true,
          isAccountVerified: true
        });
      }
      
      users.push(user);
      
      // Create Student Profile
      let student = await Student.findOne({ userId: user._id });
      
      if (!student) {
        student = await Student.create({
          userId: user._id,
          studentId: generateStudentId(),
          university: faker.helpers.arrayElement(UNIVERSITIES),
          major: faker.helpers.arrayElement(MAJORS),
          className: `K${faker.number.int({ min: 65, max: 70 })}${faker.helpers.arrayElement(['A', 'B', 'C', 'D'])}`,
          academicYear: `202${faker.number.int({ min: 0, max: 4 })}-202${faker.number.int({ min: 4, max: 8 })}`,
          currentRoom: null,
          currentContract: null,
          studentStatus: 'studying',
          ktxStatus: 'not_registered'
        });
      }
      
      students.push(student);
      
    } catch (error) {
      console.error(`   ✗ Error creating student ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${students.length} students created`);
  return { students, users };
};

// Create registration forms
const createRegistrationForms = async (students, users) => {
  console.log('\n📝 Step 7: Creating Registration Forms...');
  
  const registrationForms = [];
  
  const generateFormData = (user, student) => ({
    residence: {
      academicYear: student.academicYear,
      cccd: user.identityCard,
      cccdIdIssueDate: faker.date.past({ years: 5 }).toLocaleDateString('en-GB'),
      cccdIdIssuePlace: 'CA Hà Nội',
      className: student.className,
      dateOfBirth: user.dateOfBirth.toISOString().split('T')[0],
      department: student.major.substring(0, 5).toUpperCase(),
      dormName: 'KTX Trường',
      duration: '12',
      email: user.email,
      emergencyContact: `0${faker.string.numeric(9)}`,
      fullName: user.fullName,
      gender: user.gender,
      major: student.major,
      permanentAddress: faker.helpers.arrayElement(['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'TP.HCM', 'Nghệ An']),
      phoneNumber: user.phoneNumber,
      schoolName: student.university.substring(0, 15),
      studentId: student.studentId
    },
    temporary: {
      cccd: user.identityCard,
      dateOfBirth: user.dateOfBirth.toISOString().split('T')[0],
      email: user.email,
      fullName: user.fullName,
      gender: user.gender,
      ownerCccd: '',
      ownerName: '',
      ownerRelation: '',
      phoneNumber: user.phoneNumber,
      receiver: 'Ban Quản Lý Ký Túc Xá',
      requestContent: 'Đăng ký ở KTX năm học ' + student.academicYear
    }
  });
  
  for (let i = 0; i < students.length; i++) {
    try {
      const student = students[i];
      const user = users.find(u => u._id.toString() === student.userId.toString());
      
      const statuses = ['draft', 'submitted', 'approved', 'rejected', 'pending'];
      const status = i < 2 ? 'draft' : i < 4 ? 'submitted' : i < 16 ? 'approved' : i < 20 ? 'rejected' : 'pending';
      
      let form = await RegistrationForm.findOne({ userId: user._id });
      
      if (!form) {
        form = await RegistrationForm.create({
          registrationFormCode: generateUniqueCode('REG'),
          userId: user._id,
          submissionType: i % 3 === 0 ? 'offline' : 'online',
          status: status,
          formData: generateFormData(user, student),
          isMissingDocuments: false,
          resubmitCount: 0,
          hasDraft: status === 'draft',
          progressPercent: status === 'approved' ? 100 : status === 'submitted' ? 75 : status === 'draft' ? 50 : 0,
          currentStep: status === 'approved' ? null : status === 'submitted' ? 4 : 2,
          completedSteps: status === 'approved' ? [1, 2, 3, 4] : status === 'submitted' ? [1, 2, 3] : [1],
          requiredDocuments: {
            cccdFront: true,
            cccdBack: true,
            studentCard: true,
            priorityDoc: i % 5 === 0,
            stampedForm: status !== 'draft'
          },
          submittedAt: status !== 'draft' ? faker.date.recent({ days: 30 }) : null,
          approvedAt: status === 'approved' ? faker.date.recent({ days: 15 }) : null,
          rejectedAt: status === 'rejected' ? faker.date.recent({ days: 20 }) : null
        });
        
        if (status === 'approved') {
          await Student.findByIdAndUpdate(student._id, { ktxStatus: 'waiting_room' });
          student.ktxStatus = 'waiting_room';
        }
      }
      
      registrationForms.push(form);
      
    } catch (error) {
      console.error(`   ✗ Error creating registration form ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${registrationForms.length} registration forms`);
  return registrationForms;
};

// Create room assignments and contracts
const createRoomAssignmentsAndContracts = async (students, users, rooms, buildings, primaryAdmin) => {
  console.log('\n🔑 Step 8: Creating Room Assignments...');
  
  const roomAssignments = [];
  const contracts = [];
  
  // Reload students from database to get updated ktxStatus
  const updatedStudents = await Student.find({});
  const approvedStudents = updatedStudents.filter(s => s.ktxStatus === 'waiting_room');
  
  for (let i = 0; i < approvedStudents.length; i++) {
    try {
      const student = approvedStudents[i];
      const user = users.find(u => u._id.toString() === student.userId.toString());
      
      const availableRooms = rooms.filter(r => 
        r.gender === user.gender && r.roomStatus === 'available'
      );
      
      if (availableRooms.length === 0) continue;
      
      const room = availableRooms[i % availableRooms.length];
      const building = buildings.find(b => b._id.toString() === room.buildingId.toString());
      
      const checkInDate = faker.date.recent({ days: 20 });
      const endDate = new Date(checkInDate);
      endDate.setMonth(endDate.getMonth() + 6);
      
      // Create Room Assignment First
      const assignment = await RoomAssignment.create({
        studentId: student._id,
        roomId: room._id,
        buildingId: building._id,
        contractId: null,
        assignmentType: 'new',
        assignedBy: primaryAdmin._id,
        assignedAt: checkInDate,
        checkInDate: checkInDate,
        checkOutDate: null,
        status: 'active',
        notes: null
      });
      roomAssignments.push(assignment);
      
      // Create Contract with roomAssignmentId
      const contract = await Contract.create({
        contractCode: generateUniqueCode('CTR'),
        studentId: student._id,
        roomId: room._id,
        roomAssignmentId: assignment._id,
        startDate: checkInDate,
        endDate: endDate,
        duration: 6,
        depositAmount: room.pricePerMonth,
        monthlyRent: room.pricePerMonth,
        terms: [
          { title: 'Điều 1: Thời hạn', content: 'Hợp đồng có thời hạn 6 tháng', order: 1 },
          { title: 'Điều 2: Tiền thuê', content: `Tiền thuê phòng hàng tháng: ${room.pricePerMonth.toLocaleString('vi-VN')}đ`, order: 2 },
          { title: 'Điều 3: Nội quy', content: 'Tuân thủ nội quy KTX', order: 3 }
        ],
        status: 'active',
        signatures: {
          student: { signedAt: checkInDate },
          admin: { signedAt: checkInDate, signedBy: primaryAdmin._id }
        },
        activatedAt: checkInDate
      });
      contracts.push(contract);
      
      // Update assignment with contractId
      await RoomAssignment.findByIdAndUpdate(assignment._id, { contractId: contract._id });
      
      // Update Room
      await Room.findByIdAndUpdate(room._id, {
        $push: { assignedStudents: { studentId: student._id, assignedAt: checkInDate, contractId: contract._id } },
        $inc: { currentOccupancy: 1 },
        roomStatus: room.currentOccupancy + 1 >= room.capacity - 1 ? 'full' : 'occupied'
      });
      
      // Update Student
      await Student.findByIdAndUpdate(student._id, {
        currentRoom: room._id,
        currentContract: contract._id,
        ktxStatus: 'checked_in'
      });
      
      // Update Building stats
      await Building.findByIdAndUpdate(building._id, {
        $inc: { 
          'stats.occupiedRooms': 1, 
          'stats.currentOccupancy': 1,
          'stats.availableRooms': -1
        }
      });
      
      if (i < 3) console.log(`   ✓ Assignment: ${student.studentId} → ${room.roomCode}`);
      
    } catch (error) {
      console.error(`   ✗ Error creating assignment ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${roomAssignments.length} room assignments`);
  console.log(`   ✓ ${contracts.length} contracts`);
  
  return { roomAssignments, contracts };
};

// Create invoices and payments
const createInvoicesAndPayments = async (contracts, students, rooms, utilityRates, primaryAdmin) => {
  console.log('\n💰 Step 9: Creating Invoices...');
  
  const invoices = [];
  const payments = [];
  
  const currentMonth = getCurrentMonth();
  const electricityRate = utilityRates.find(r => r.type === 'electricity');
  const waterRate = utilityRates.find(r => r.type === 'water');
  
  for (let i = 0; i < contracts.length; i++) {
    try {
      const contract = contracts[i];
      const student = students.find(s => s._id.toString() === contract.studentId.toString());
      const room = rooms.find(r => r._id.toString() === contract.roomId.toString());
      
      const elecUsage = faker.number.int({ min: 80, max: 300 });
      const waterUsage = faker.number.int({ min: 8, max: 25 });
      const elecCost = electricityRate ? electricityRate.calculateElectricityCost(elecUsage) : elecUsage * 2500;
      const waterCost = waterRate ? waterRate.calculateWaterCost(waterUsage) : waterUsage * 12000;
      
      const services = [
        { type: 'internet', amount: 50000 },
        { type: 'cleaning', amount: 30000 },
        { type: 'security', amount: 20000 },
        { type: 'waste', amount: 10000 }
      ];
      const servicesTotal = services.reduce((sum, s) => sum + s.amount, 0);
      const subTotal = room.pricePerMonth + elecCost + waterCost + servicesTotal;
      
      const invoice = await Invoice.create({
        invoiceCode: generateUniqueCode('INV'),
        contractId: contract._id,
        studentId: student._id,
        roomId: room._id,
        month: currentMonth,
        period: {
          start: new Date(),
          end: new Date(new Date().setMonth(new Date().getMonth() + 1))
        },
        items: [
          { type: 'room_rent', amount: room.pricePerMonth, quantity: 1, unitPrice: room.pricePerMonth },
          { type: 'electricity', amount: elecCost, quantity: 1, unitPrice: elecCost, usage: elecUsage },
          { type: 'water', amount: waterCost, quantity: 1, unitPrice: waterCost, usage: waterUsage },
          ...services.map(s => ({ type: s.type, amount: s.amount, quantity: 1, unitPrice: s.amount }))
        ],
        subTotal: subTotal,
        discount: 0,
        totalAmount: subTotal,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 15)),
        paidAmount: i % 3 === 0 ? 0 : subTotal,
        status: i % 3 === 0 ? 'pending' : 'paid',
        generatedBy: primaryAdmin._id,
        generatedAt: new Date()
      });
      invoices.push(invoice);
      
      if (invoice.status === 'paid') {
        const payment = await Payment.create({
          paymentCode: generateUniqueCode('PAY'),
          invoiceId: invoice._id,
          invoiceCode: invoice.invoiceCode,
          contractId: contract._id,
          studentId: student._id,
          amount: invoice.totalAmount,
          paymentMethod: faker.helpers.arrayElement(['bank_transfer', 'momo', 'vnpay']),
          status: 'completed',
          paidAt: faker.date.recent({ days: 10 }),
          verifiedBy: primaryAdmin._id,
          verifiedAt: new Date(),
          completedAt: new Date()
        });
        payments.push(payment);
      }
      
    } catch (error) {
      console.error(`   ✗ Error creating invoice ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${invoices.length} invoices (${invoices.filter(inv => inv.status === 'pending').length} pending)`);
  console.log(`   ✓ ${payments.length} payments`);
  
  return { invoices, payments };
};

// Create meter readings
const createMeterReadings = async (roomAssignments, rooms, primaryAdmin) => {
  console.log('\n⚡ Step 10: Creating Meter Readings...');
  
  const meterReadings = [];
  const currentMonth = getCurrentMonth();
  
  const assignedRooms = [...new Set(roomAssignments.map(a => a.roomId.toString()))]
    .map(id => rooms.find(r => r._id.toString() === id))
    .filter(Boolean);
  
  for (let i = 0; i < Math.min(assignedRooms.length, 12); i++) {
    try {
      const room = assignedRooms[i];
      const prevElec = faker.number.int({ min: 1000, max: 5000 });
      const currElec = prevElec + faker.number.int({ min: 100, max: 400 });
      const prevWater = faker.number.int({ min: 100, max: 500 });
      const currWater = prevWater + faker.number.int({ min: 10, max: 50 });
      
      const reading = await MeterReading.create({
        roomId: room._id,
        month: currentMonth,
        year: getCurrentYear(),
        electricity: {
          previous: prevElec,
          current: currElec,
          usage: currElec - prevElec,
          meterNumber: `ELEC-${room.roomCode}`,
          isEstimated: false
        },
        water: {
          previous: prevWater,
          current: currWater,
          usage: currWater - prevWater,
          meterNumber: `WATER-${room.roomCode}`,
          isEstimated: false
        },
        readBy: primaryAdmin._id,
        readAt: new Date(),
        verifiedBy: faker.datatype.boolean(0.7) ? primaryAdmin._id : null,
        verifiedAt: faker.datatype.boolean(0.7) ? new Date() : null,
        status: faker.datatype.boolean(0.7) ? 'verified' : 'pending',
        isAutoRead: false
      });
      meterReadings.push(reading);
      
    } catch (error) {
      console.error(`   ✗ Error creating meter reading ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${meterReadings.length} meter readings`);
  return meterReadings;
};

// Create maintenance requests
const createMaintenanceRequests = async (students, rooms, buildings, primaryAdmin) => {
  console.log('\n🔧 Step 11: Creating Maintenance Requests...');
  
  const maintenanceRequests = [];
  
  const maintenanceCategories = ['electrical', 'plumbing', 'furniture', 'door_window', 'ac', 'network', 'cleaning'];
  // Reload students from database to get updated ktxStatus
  const updatedStudents = await Student.find({});
  const checkedInStudents = updatedStudents.filter(s => s.ktxStatus === 'checked_in');
  
  for (let i = 0; i < 15; i++) {
    try {
      const student = faker.helpers.arrayElement(checkedInStudents);
      const room = rooms.find(r => r._id.toString() === student.currentRoom?.toString()) || 
                  faker.helpers.arrayElement(rooms);
      const building = buildings.find(b => b._id.toString() === room.buildingId.toString());
      
      const category = faker.helpers.arrayElement(maintenanceCategories);
      const status = faker.helpers.arrayElement(['pending', 'reviewing', 'assigned', 'in_progress', 'completed']);
      
      const titles = {
        electrical: ['Đèn phòng bị chập chờn', 'Ổ cắm điện không hoạt động', 'Công tắc điện bị lỏng'],
        plumbing: ['Vòi nước bị rò rỉ', 'Bồn cầu bị tắc', 'Nước chảy yếu'],
        furniture: ['Giường bị kêu', 'Tủ quần áo bị hỏng khóa', 'Bàn học bị lung lay'],
        door_window: ['Cửa phòng không khóa được', 'Cửa sổ bị kẹt', 'Bản lề cửa bị gỉ'],
        ac: ['Điều hòa không mát', 'Điều hòa bị rò nước', 'Remote điều hòa bị hỏng'],
        network: ['WiFi chậm', 'Không kết nối được mạng', 'Mạng hay bị ngắt'],
        cleaning: ['Phòng cần dọn vệ sinh', 'Khu vực chung bẩn', 'Thùng rác cần đổ']
      };
      
      const request = await MaintenanceRequest.create({
        requestCode: generateUniqueCode('REP'),
        studentId: student._id,
        roomId: room._id,
        buildingId: building._id,
        category: category,
        priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'urgent']),
        title: faker.helpers.arrayElement(titles[category]),
        description: faker.lorem.paragraph(),
        images: [],
        status: status,
        statusHistory: [{
          status: 'pending',
          changedBy: student.userId,
          changedAt: new Date(),
          note: 'Tạo yêu cầu mới'
        }],
        assignment: status !== 'pending' ? {
          assignedTo: primaryAdmin._id,
          assignedBy: primaryAdmin._id,
          assignedAt: new Date()
        } : null,
        scheduledDate: faker.datatype.boolean(0.5) ? faker.date.future({ days: 7 }) : null,
        completedDate: status === 'completed' ? faker.date.recent({ days: 5 }) : null,
        cost: status === 'completed' ? {
          materialCost: faker.number.int({ min: 50000, max: 300000 }),
          laborCost: faker.number.int({ min: 50000, max: 150000 }),
          totalCost: 0
        } : { materialCost: 0, laborCost: 0, totalCost: 0 },
        rating: status === 'completed' && faker.datatype.boolean(0.7) ? {
          score: faker.number.int({ min: 3, max: 5 }),
          comment: faker.lorem.sentence(),
          ratedAt: new Date()
        } : { score: null, comment: null, ratedAt: null },
        isUrgent: category === 'ac' || category === 'plumbing'
      });
      
      if (request.cost) {
        request.cost.totalCost = request.cost.materialCost + request.cost.laborCost;
        await request.save();
      }
      
      maintenanceRequests.push(request);
      
    } catch (error) {
      console.error(`   ✗ Error creating maintenance request ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${maintenanceRequests.length} maintenance requests`);
  return maintenanceRequests;
};

// Create FAQs
const createFAQs = async (primaryAdmin) => {
  console.log('\n❓ Step 12: Creating FAQ...');
  
  const faqs = [];
  
  const faqData = [
    { q: 'Làm thế nào để đăng ký ở KTX?', a: 'Đăng nhập hệ thống → Đăng ký KTX → Điền form → Upload CCCD và thẻ SV.', cat: 'registration', keywords: ['đăng ký', 'thủ tục', 'hồ sơ'] },
    { q: 'Giá phòng KTX bao nhiêu?', a: '2 giường: 1.2tr/tháng, 4 giường: 800k, 6 giường: 600k, 8 giường: 500k.', cat: 'billing', keywords: ['giá phòng', 'tiền thuê'] },
    { q: 'Hạn đóng tiền là ngày nào?', a: 'Ngày 10 hàng tháng. Quá hạn phạt 5%/tháng.', cat: 'billing', keywords: ['hạn đóng', 'thanh toán'] },
    { q: 'Có được nấu ăn trong phòng không?', a: 'Không. Có khu bếp chung cho sinh viên.', cat: 'rules', keywords: ['nấu ăn', 'nội quy'] },
    { q: 'Giờ giới nghiêm là mấy giờ?', a: '22h30 hàng ngày. Cổng KTX sẽ đóng sau giờ này.', cat: 'rules', keywords: ['giới nghiêm', 'về khuya'] },
    { q: 'Làm sao báo sửa chữa?', a: 'Vào mục "Bảo trì" → Tạo yêu cầu mới → Mô tả chi tiết.', cat: 'maintenance', keywords: ['sửa chữa', 'bảo trì'] },
    { q: 'Có được nuôi thú cưng không?', a: 'Không được nuôi để đảm bảo vệ sinh chung.', cat: 'rules', keywords: ['thú cưng', 'nuôi chó'] },
    { q: 'Phòng có máy lạnh không?', a: 'Phòng 2-4 giường có điều hòa. Phí 50k/tháng.', cat: 'room', keywords: ['máy lạnh', 'điều hòa'] },
    { q: 'Có chỗ để xe không?', a: 'Có bãi giữ xe. Xe máy 50k/tháng, xe đạp miễn phí.', cat: 'facilities', keywords: ['để xe', 'bãi xe'] },
    { q: 'Hợp đồng thuê có thời hạn bao lâu?', a: 'Tối thiểu 6 tháng. Có thể gia hạn.', cat: 'contract', keywords: ['hợp đồng', 'thời hạn'] }
  ];
  
  for (let i = 0; i < faqData.length; i++) {
    try {
      const faq = faqData[i];
      let existing = await FAQ.findOne({ question: faq.q });
      
      if (!existing) {
        const newFaq = await FAQ.create({
          question: faq.q,
          answer: faq.a,
          category: faq.cat,
          keywords: faq.keywords,
          isActive: true,
          viewCount: faker.number.int({ min: 20, max: 500 }),
          helpfulCount: faker.number.int({ min: 10, max: 200 }),
          notHelpfulCount: faker.number.int({ min: 0, max: 15 }),
          order: i + 1,
          createdBy: primaryAdmin._id
        });
        faqs.push(newFaq);
      }
    } catch (error) {
      console.error(`   ✗ Error creating FAQ ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${faqs.length} FAQs`);
  return faqs;
};

// Create support tickets
const createSupportTickets = async (students, users, rooms, primaryAdmin) => {
  console.log('\n🎫 Step 13: Creating Support Tickets...');
  
  const supportTickets = [];
  
  const ticketCategories = ['room_issue', 'billing', 'maintenance', 'security', 'noise_complaint', 'facility', 'internet', 'other'];
  // Reload students from database to get updated ktxStatus
  const updatedStudents = await Student.find({});
  const checkedInStudents = updatedStudents.filter(s => s.ktxStatus === 'checked_in');
  
  for (let i = 0; i < 12; i++) {
    try {
      const student = faker.helpers.arrayElement(checkedInStudents);
      const user = users.find(u => u._id.toString() === student.userId.toString());
      const room = rooms.find(r => r._id.toString() === student.currentRoom?.toString());
      
      const status = faker.helpers.arrayElement(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']);
      
      const ticket = await SupportTicket.create({
        ticketCode: generateUniqueCode('TK'),
        title: faker.helpers.arrayElement(['Yêu cầu đổi phòng', 'Khiếu nại tiếng ồn', 'Hỏi về hóa đơn', 'Báo mất đồ', 'Yêu cầu gấp']),
        description: faker.lorem.paragraph(),
        category: faker.helpers.arrayElement(ticketCategories),
        priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'urgent']),
        status: status,
        createdBy: user._id,
        studentId: student._id,
        assignedTo: status !== 'open' ? primaryAdmin._id : null,
        assignedAt: status !== 'open' ? new Date() : null,
        relatedRoomId: room?._id || null,
        relatedContractId: student.currentContract || null,
        history: [{
          action: 'created',
          performedBy: user._id,
          performedAt: new Date(),
          details: { message: 'Ticket created by student' }
        }],
        satisfactionRating: status === 'closed' && faker.datatype.boolean(0.7) ? faker.number.int({ min: 3, max: 5 }) : null,
        resolvedAt: status === 'resolved' || status === 'closed' ? faker.date.recent({ days: 5 }) : null,
        closedAt: status === 'closed' ? faker.date.recent({ days: 3 }) : null
      });
      supportTickets.push(ticket);
      
    } catch (error) {
      console.error(`   ✗ Error creating support ticket ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${supportTickets.length} support tickets`);
  return supportTickets;
};

// Create feedback
const createFeedback = async (students, users, rooms) => {
  console.log('\n💬 Step 14: Creating Feedback...');
  
  const feedbacks = [];
  
  const feedbackTypes = ['room_service', 'maintenance', 'security', 'cleaning', 'staff_attitude', 'facility', 'billing', 'general'];
  // Reload students from database to get updated ktxStatus
  const updatedStudents = await Student.find({});
  const checkedInStudents = updatedStudents.filter(s => s.ktxStatus === 'checked_in');
  
  for (let i = 0; i < 10; i++) {
    try {
      const student = faker.helpers.arrayElement(checkedInStudents);
      const user = users.find(u => u._id.toString() === student.userId.toString());
      const room = rooms.find(r => r._id.toString() === student.currentRoom?.toString());
      
      const rating = faker.number.int({ min: 2, max: 5 });
      
      const feedback = await Feedback.create({
        feedbackType: faker.helpers.arrayElement(feedbackTypes),
        studentId: student._id,
        userId: user._id,
        relatedRoomId: room?._id || null,
        rating: rating,
        title: rating >= 4 ? 'Rất hài lòng' : rating >= 3 ? 'Tạm được' : 'Cần cải thiện',
        comment: faker.lorem.paragraph(),
        aspects: {
          cleanliness: faker.number.int({ min: 2, max: 5 }),
          staff_service: faker.number.int({ min: 2, max: 5 }),
          facilities: faker.number.int({ min: 2, max: 5 }),
          value_for_money: faker.number.int({ min: 2, max: 5 }),
          responsiveness: faker.number.int({ min: 2, max: 5 })
        },
        isAnonymous: faker.datatype.boolean(0.15),
        isResolved: faker.datatype.boolean(0.6),
        sentiment: rating >= 4 ? 'positive' : rating >= 3 ? 'neutral' : 'negative'
      });
      feedbacks.push(feedback);
      
    } catch (error) {
      console.error(`   ✗ Error creating feedback ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${feedbacks.length} feedbacks`);
  return feedbacks;
};

// Create chat rooms and messages
const createChatRooms = async (students, users, primaryAdmin) => {
  console.log('\n💭 Step 15: Creating Chat Rooms...');
  
  const chatRooms = [];
  // Reload students from database to get updated ktxStatus
  const updatedStudents = await Student.find({});
  const checkedInStudents = updatedStudents.filter(s => s.ktxStatus === 'checked_in');
  
  for (let i = 0; i < 8; i++) {
    try {
      const student = faker.helpers.arrayElement(checkedInStudents);
      const user = users.find(u => u._id.toString() === student.userId.toString());
      
      const chatRoom = await ChatRoom.create({
        roomType: 'student_admin',
        title: `Hỗ trợ: ${user.fullName}`,
        participants: [
          { userId: user._id, role: 'student', joinedAt: new Date(), lastReadAt: new Date() },
          { userId: primaryAdmin._id, role: 'admin', joinedAt: new Date(), lastReadAt: new Date() }
        ],
        assignedAdminId: primaryAdmin._id,
        status: faker.datatype.boolean(0.3) ? 'closed' : 'active',
        lastMessage: { content: 'Cảm ơn bạn đã liên hệ', senderId: primaryAdmin._id, sentAt: new Date() },
        unreadCount: new Map([[user._id.toString(), 0], [primaryAdmin._id.toString(), 0]]),
        closedAt: faker.datatype.boolean(0.3) ? new Date() : null,
        closedBy: faker.datatype.boolean(0.3) ? primaryAdmin._id : null
      });
      chatRooms.push(chatRoom);
      
      const messages = [
        { senderId: user._id, role: 'student', content: 'Xin chào, tôi cần hỗ trợ' },
        { senderId: primaryAdmin._id, role: 'admin', content: 'Chào bạn, tôi có thể giúp gì?' },
        { senderId: user._id, role: 'student', content: faker.lorem.sentence() },
        { senderId: primaryAdmin._id, role: 'admin', content: 'Dạ vâng, tôi sẽ hỗ trợ ngay' }
      ];
      
      for (const msg of messages) {
        await ChatMessage.create({
          roomId: chatRoom._id,
          senderId: msg.senderId,
          senderRole: msg.role,
          content: msg.content,
          messageType: 'text',
          isRead: true,
          readAt: new Date()
        });
      }
      
    } catch (error) {
      console.error(`   ✗ Error creating chat room ${i + 1}:`, error.message);
    }
  }
  
  console.log(`   ✓ ${chatRooms.length} chat rooms`);
  return chatRooms;
};

// Create notifications
const createNotifications = async (users) => {
  console.log('\n🔔 Step 16: Creating Notifications...');
  
  const notifCategories = ['REGISTRATION', 'PAYMENT', 'CONTRACT', 'ROOM', 'SYSTEM', 'DOCUMENT', 'CHECKIN', 'ANNOUNCEMENT', 'REMINDER'];
  const notifTypes = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];
  const notifTitles = {
    'REGISTRATION': ['Đơn đăng ký đã được phê duyệt', 'Yêu cầu bổ sung tài liệu', 'Đăng ký thành công'],
    'PAYMENT': ['Nhắc nhở thanh toán', 'Thanh toán thành công', 'Hóa đơn quá hạn'],
    'CONTRACT': ['Hợp đồng sắp hết hạn', 'Hợp đồng đã được ký'],
    'ROOM': ['Thông báo chuyển phòng', 'Cập nhật trạng thái phòng'],
    'SYSTEM': ['Thông báo hệ thống', 'Cập nhật hệ thống'],
    'ANNOUNCEMENT': ['Thông báo từ Ban quản lý', 'Thông báo quan trọng']
  };
  
  for (const user of users) {
    try {
      const numNotifications = faker.number.int({ min: 2, max: 5 });
      
      for (let i = 0; i < numNotifications; i++) {
        const category = faker.helpers.arrayElement(notifCategories);
        const isRead = faker.datatype.boolean(0.6);
        
        await Notification.create({
          recipient: user._id,
          type: faker.helpers.arrayElement(notifTypes),
          category: category,
          title: faker.helpers.arrayElement(notifTitles[category] || ['Thông báo hệ thống']),
          content: faker.lorem.paragraph(2),
          priority: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'NORMAL']),
          isRead: isRead,
          readAt: isRead ? faker.date.recent({ days: 7 }) : null,
          actionUrl: faker.datatype.boolean(0.5) ? `http://localhost:5173/app/${category.toLowerCase()}` : null
        });
      }
    } catch (error) {
      console.error(`   ✗ Error creating notifications for user ${user.email}:`, error.message);
    }
  }
  
  const totalNotifs = await Notification.countDocuments();
  console.log(`   ✓ ${totalNotifs} notifications`);
  return totalNotifs;
};

// Create notification preferences
const createNotificationPreferences = async (users) => {
  console.log('\n⚙️ Step 17: Creating Notification Preferences...');
  
  for (const user of users) {
    try {
      const existing = await NotificationPreference.findOne({ user: user._id });
      
      if (!existing) {
        await NotificationPreference.create({
          user: user._id,
          enabled: true,
          quietHoursEnabled: true,
          quietHoursStart: 22,
          quietHoursEnd: 7,
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          priorityThreshold: 'MEDIUM',
          maxNotificationsPerHour: 10,
          maxNotificationsPerDay: 50
        });
      }
    } catch (error) {
      console.error(`   ✗ Error creating notification preferences for user ${user.email}:`, error.message);
    }
  }
  
  const totalPrefs = await NotificationPreference.countDocuments();
  console.log(`   ✓ ${totalPrefs} notification preferences`);
  return totalPrefs;
};

// Create audit logs
const createAuditLogs = async (users) => {
  console.log('\n📊 Step 18: Creating Audit Logs...');
  
  const actions = ['LOGIN', 'LOGOUT', 'CREATE_REGISTRATION', 'UPDATE_PROFILE', 'UPLOAD_DOCUMENT', 
                  'SUBMIT_FORM', 'APPROVE_REGISTRATION', 'VIEW_CONTRACT', 'PAYMENT', 'CREATE_MAINTENANCE'];
  const resources = ['User', 'Registration', 'Document', 'Contract', 'Payment', 'Room', 'Maintenance', 'System'];
  
  for (const user of users) {
    try {
      const numLogs = faker.number.int({ min: 3, max: 6 });
      
      for (let i = 0; i < numLogs; i++) {
        await AuditLog.create({
          userId: user._id,
          action: faker.helpers.arrayElement(actions),
          resource: faker.helpers.arrayElement(resources),
          resourceId: new mongoose.Types.ObjectId(),
          details: { description: faker.lorem.sentence() },
          ipAddress: faker.internet.ip(),
          userAgent: faker.internet.userAgent(),
          severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']),
          status: faker.helpers.arrayElement(['SUCCESS', 'FAILED']),
          apiEndpoint: `/api/${faker.helpers.arrayElement(resources).toLowerCase()}/${faker.helpers.arrayElement(actions).toLowerCase()}`,
          httpMethod: faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE']),
          responseTime: faker.number.int({ min: 50, max: 500 })
        });
      }
    } catch (error) {
      console.error(`   ✗ Error creating audit logs for user ${user.email}:`, error.message);
    }
  }
  
  const totalLogs = await AuditLog.countDocuments();
  console.log(`   ✓ ${totalLogs} audit logs`);
  return totalLogs;
};

// ============================================
// SUMMARY FUNCTION
// ============================================

const printSummary = (data, totalNotifs, totalPrefs, totalLogs) => {
  console.log('\n' + '='.repeat(70));
  console.log('🎉 SEED DATA CREATION COMPLETED - FULLY LINKED DATA');
  console.log('='.repeat(70));
  console.log('');
  console.log('📊 DATA LINKAGE MAP:');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('Building → Rooms (1:n)        : 4 buildings → 80 rooms');
  console.log('Room → Assignments (1:n)      : Rooms → Assignments');
  console.log('Student → Assignment (1:1)    : Student assigned to 1 room');
  console.log('Assignment → Contract (1:1)   : Each assignment has 1 contract');
  console.log('Contract → Invoices (1:n)     : Contracts have monthly invoices');
  console.log('Invoice → Payments (1:n)      : Invoices linked to payments');
  console.log('Room → Meter Readings (1:n)   : Monthly readings per room');
  console.log('Student → Maintenance (1:n)   : Students can create requests');
  console.log('Student → Tickets (1:n)       : Students can create tickets');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('📈 QUANTITIES:');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`  👤 Users:              ${data.users.length} (3 admins + 24 students)`);
  console.log(`  👨‍🎓 Students:           ${data.students.length}`);
  console.log(`  🏢 Buildings:          ${data.buildings.length}`);
  console.log(`  🚪 Rooms:              ${data.rooms.length}`);
  console.log(`  🔑 Room Assignments:  ${data.roomAssignments.length}`);
  console.log(`  📜 Contracts:          ${data.contracts.length}`);
  console.log(`  💰 Invoices:           ${data.invoices.length}`);
  console.log(`  💳 Payments:           ${data.payments.length}`);
  console.log(`  ⚡ Meter Readings:     ${data.meterReadings.length}`);
  console.log(`  🔧 Maintenance:        ${data.maintenanceRequests.length}`);
  console.log(`  ❓ FAQs:               ${data.faqs.length}`);
  console.log(`  🎫 Support Tickets:   ${data.supportTickets.length}`);
  console.log(`  💬 Feedback:           ${data.feedbacks.length}`);
  console.log(`  💭 Chat Rooms:         ${data.chatRooms.length}`);
  console.log(`  🔔 Notifications:      ${totalNotifs}`);
  console.log(`  ⚙️  Notif Prefs:        ${totalPrefs}`);
  console.log(`  📊 Audit Logs:         ${totalLogs}`);
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('🔑 LOGIN CREDENTIALS:');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('  Admin:    admin@gmail.com          / Admin@123456');
  console.log('  Admin:    manager@kytucxa.edu.vn   / Admin@123456');
  console.log('  Staff:    tech@kytucxa.edu.vn      / Admin@123456');
  console.log('  Student:  student1@student.edu.vn  / Student@123');
  console.log('  Student:  student2@student.edu.vn  / Student@123');
  console.log('  ...');
  console.log('  Student:  student24@student.edu.vn / Student@123');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('✅ All data is properly linked and ready for testing!');
  console.log('='.repeat(70));
};

// ============================================
// MAIN SEED FUNCTION
// ============================================

const seedData = async () => {
  try {
    console.log('🔌 Connecting to database...');
    const connected = await connectDB();
    
    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }
    
    console.log('✅ Database connected!\n');
    console.log('🌱 Starting COMPLETE SEED with FULL DATA LINKAGE...\n');
    
    const data = {
      admins: [],
      students: [],
      users: [],
      buildings: [],
      rooms: [],
      roomAssignments: [],
      contracts: [],
      invoices: [],
      payments: [],
      serviceRates: [],
      utilityRates: [],
      meterReadings: [],
      maintenanceRequests: [],
      registrationForms: [],
      faqs: [],
      supportTickets: [],
      feedbacks: [],
      chatRooms: []
    };
    
    // Step 1: Create Admin Users
    const adminResult = await createAdminUsers();
    data.admins = adminResult.admins;
    data.users.push(...adminResult.users);
    const primaryAdmin = adminResult.primaryAdmin;
    
    // Step 2: Create Service Rates
    data.serviceRates = await createServiceRates(primaryAdmin);
    
    // Step 3: Create Utility Rates
    data.utilityRates = await createUtilityRates(primaryAdmin);
    
    // Step 4: Create Buildings
    data.buildings = await createBuildings();
    
    // Step 5: Create Rooms
    data.rooms = await createRooms(data.buildings);
    
    // Step 6: Create Students
    const studentResult = await createStudents();
    data.students = studentResult.students;
    data.users.push(...studentResult.users);
    
    // Step 7: Create Registration Forms
    data.registrationForms = await createRegistrationForms(data.students, data.users);
    
    // Step 8: Create Room Assignments and Contracts
    const assignmentResult = await createRoomAssignmentsAndContracts(
      data.students, 
      data.users, 
      data.rooms, 
      data.buildings, 
      primaryAdmin
    );
    data.roomAssignments = assignmentResult.roomAssignments;
    data.contracts = assignmentResult.contracts;
    
    // Step 9: Create Invoices and Payments
    const invoiceResult = await createInvoicesAndPayments(
      data.contracts, 
      data.students, 
      data.rooms, 
      data.utilityRates, 
      primaryAdmin
    );
    data.invoices = invoiceResult.invoices;
    data.payments = invoiceResult.payments;
    
    // Step 10: Create Meter Readings
    data.meterReadings = await createMeterReadings(data.roomAssignments, data.rooms, primaryAdmin);
    
    // Step 11: Create Maintenance Requests
    data.maintenanceRequests = await createMaintenanceRequests(data.students, data.rooms, data.buildings, primaryAdmin);
    
    // Step 12: Create FAQs
    data.faqs = await createFAQs(primaryAdmin);
    
    // Step 13: Create Support Tickets
    data.supportTickets = await createSupportTickets(data.students, data.users, data.rooms, primaryAdmin);
    
    // Step 14: Create Feedback
    data.feedbacks = await createFeedback(data.students, data.users, data.rooms);
    
    // Step 15: Create Chat Rooms
    data.chatRooms = await createChatRooms(data.students, data.users, primaryAdmin);
    
    // Step 16: Create Notifications
    const totalNotifs = await createNotifications(data.users);
    
    // Step 17: Create Notification Preferences
    const totalPrefs = await createNotificationPreferences(data.users);
    
    // Step 18: Create Audit Logs
    const totalLogs = await createAuditLogs(data.users);
    
    // Print Summary
    printSummary(data, totalNotifs, totalPrefs, totalLogs);
    
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
    process.exit(0);
  }
};

// ============================================
// ERROR HANDLING
// ============================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// ============================================
// RUN SEED
// ============================================

seedData();
