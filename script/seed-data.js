import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import { connectDB } from '../src/config/db.config.js';

// Import models
import User from '../src/models/user/user.model.js';
import Student from '../src/models/user/student.model.js';
import RegistrationForm from '../src/models/registration/registrationForm.model.js';
import RegistrationDocument from '../src/models/registration/registrationDocument.model.js';
import RegistrationMissingDocument from '../src/models/registration/registrationMissingDocument.model.js';
import Notification from '../src/models/notification/notification.model.js';
import NotificationPreference from '../src/models/notification/notificationPreference.model.js';
import AuditLog from '../src/models/auditLog.model.js';

// Helper functions
const generateStudentId = (index) => {
    const year = faker.number.int({ min: 20, max: 25 });
    const randomNum = String(index + 1).padStart(4, '0');
    return `${year}IT${randomNum}`;
};

const generateRegistrationCode = (index) => {
    const year = new Date().getFullYear();
    const randomNum = String(index + 1).padStart(4, '0');
    return `REG${year}${randomNum}`;
};

const universities = [
    'Đại học Bách Khoa Hà Nội',
    'Đại học Kinh tế Quốc dân',
    'Đại học Ngoại thương',
    'Đại học Quốc gia Hà Nội',
    'Học viện Công nghệ Bưu chính Viễn thông',
    'Đại học Thương mại',
    'Đại học Lao động Xã hội',
    'Đại học Sư phạm Hà Nội'
];

const majors = [
    'Công nghệ thông tin',
    'Kinh tế',
    'Quản trị kinh doanh',
    'Kế toán',
    'Marketing',
    'Khoa học máy tính',
    'An toàn thông tin',
    'Trí tuệ nhân tạo'
];

const documentTypes = ['cccd_front', 'cccd_back', 'student_card', 'priority_proof', 'stamped_form'];

// Helper tạo progress data theo logic tiến độ
const generateProgressData = () => {
    const states = [
        { hasDraft: false, currentStep: null, completedSteps: [], progressPercent: 0 }, // Chưa làm gì
        { hasDraft: true, currentStep: 0, completedSteps: [], progressPercent: 0 },        // Mới tạo offline
        { hasDraft: true, currentStep: 1, completedSteps: [], progressPercent: 0 },        // Đang làm nội trú
        { hasDraft: true, currentStep: 2, completedSteps: [1], progressPercent: 25 },      // Xong nội trú
        { hasDraft: true, currentStep: 3, completedSteps: [1, 2], progressPercent: 50 },   // Xong tạm trú, chờ upload
        { hasDraft: true, currentStep: 4, completedSteps: [1, 2, 3], progressPercent: 75 } // Đủ tài liệu, có thể submit
    ];
    return faker.helpers.arrayElement(states);
};

// Helper tạo formData theo đúng cấu trúc
const generateFormData = (user, student) => {
    const fullName = user.fullName;
    const email = user.email;
    const phoneNumber = user.phoneNumber;
    const cccd = user.identityCard || faker.string.numeric(12);
    const gender = user.gender;
    const dateOfBirth = user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : faker.date.birthdate({ min: 18, max: 25, mode: 'age' });
    
    return {
        residence: {
            academicYear: student?.academicYear || `${faker.number.int({ min: 2020, max: 2024 })}-${faker.number.int({ min: 2024, max: 2028 })}`,
            cccd: cccd,
            cccdIdIssueDate: faker.date.past({ years: 5 }).toLocaleDateString('en-GB'),
            cccdIdIssuePlace: faker.helpers.arrayElement(['Bo Cong An', 'CA Ha Noi', 'CA TP HCM', 'CA Da Nang', 'CA Hai Phong']),
            className: student?.className || `K${faker.number.int({ min: 60, max: 70 })}${faker.helpers.arrayElement(['A', 'B', 'C', 'D'])}`,
            dateOfBirth: dateOfBirth,
            department: student?.major?.substring(0, 5).toUpperCase() || 'CNTT',
            dormName: faker.helpers.arrayElement(['KTX A', 'KTX B', 'KTX C', 'KTX D']),
            duration: String(faker.number.int({ min: 6, max: 24 })),
            email: email,
            emergencyContact: `0${faker.string.numeric(9)}`,
            fullName: fullName,
            gender: gender,
            major: student?.major || faker.helpers.arrayElement(['CNTT', 'Kinh te', 'QTKD', 'Ke toan', 'Marketing']),
            permanentAddress: faker.helpers.arrayElement(['Ha Noi', 'Hai Phong', 'Da Nang', 'TP HCM', 'Can Tho', 'Nghe An', 'Thanh Hoa']),
            phoneNumber: phoneNumber,
            schoolName: student?.university?.substring(0, 10).toUpperCase() || 'HUST',
            studentId: student?.studentId || faker.string.alphanumeric(10).toUpperCase()
        },
        temporary: {
            cccd: cccd,
            dateOfBirth: dateOfBirth,
            email: email,
            fullName: fullName,
            gender: gender,
            ownerCccd: '',
            ownerName: '',
            ownerRelation: '',
            phoneNumber: phoneNumber,
            receiver: 'Ban Quan Ly Ky Tuc Xa',
            requestContent: faker.helpers.arrayElement([
                'Dang ky de o',
                'Dang ky tam tru',
                'Gia han tam tru',
                'Cap lai giay tam tru'
            ])
        }
    };
};

const notificationCategories = ['REGISTRATION', 'PAYMENT', 'CONTRACT', 'ROOM', 'SYSTEM', 'DOCUMENT', 'CHECKIN', 'ANNOUNCEMENT', 'REMINDER'];

const notificationTypes = ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'URGENT'];

const seedData = async () => {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Database connected!\n');

        console.log('Starting seed data creation...\n');

        const createdData = {
            users: [],
            students: [],
            registrationForms: [],
            registrationDocuments: [],
            notifications: [],
            notificationPreferences: [],
            auditLogs: []
        };

        // 1. Create 10 Users (mix of students and some potential admins)
        console.log('Creating 10 Users...');
        for (let i = 0; i < 10; i++) {
            const isStudent = i < 8; // 8 students, 2 potential staff/admin
            const gender = faker.helpers.arrayElement(['male', 'female', 'other']);
            const firstName = gender === 'female' ? faker.person.firstName('female') : faker.person.firstName('male');
            const lastName = faker.person.lastName();
            const fullName = `${lastName} ${firstName}`;

            const userData = {
                fullName: fullName,
                email: `student${i + 1}@example.com`, // Unique predictable emails
                password: 'Password123!',
                role: isStudent ? 'student' : 'admin',
                identityCard: faker.string.numeric(12),
                dateOfBirth: faker.date.birthdate({ min: 18, max: 25, mode: 'age' }),
                gender: gender,
                phoneNumber: `0${faker.string.numeric(9)}`,
                status: faker.helpers.arrayElement(['active', 'inactive']),
                isEmailVerified: faker.datatype.boolean(0.8),
                isAccountVerified: faker.datatype.boolean(0.6),
                lastLoginAt: faker.datatype.boolean(0.7) ? faker.date.recent({ days: 30 }) : null
            };

            // Check if user exists
            let user = await User.findOne({ email: userData.email });
            if (!user) {
                user = await User.create(userData);
                console.log(`  Created User: ${user.email} (${user.role})`);
            } else {
                console.log(`  User already exists: ${user.email}`);
            }
            createdData.users.push(user);
        }

        // 2. Create 8 Students (linked to student users)
        console.log('\nCreating 8 Students...');
        const studentUsers = createdData.users.filter(u => u.role === 'student');
        for (let i = 0; i < studentUsers.length; i++) {
            const user = studentUsers[i];

            // Check if student exists
            let student = await Student.findOne({ userId: user._id });
            if (!student) {
                const studentData = {
                    userId: user._id,
                    studentId: generateStudentId(i),
                    university: faker.helpers.arrayElement(universities),
                    major: faker.helpers.arrayElement(majors),
                    className: `K${faker.number.int({ min: 60, max: 70 })}${faker.helpers.arrayElement(['A', 'B', 'C', 'D'])}`,
                    academicYear: `${faker.number.int({ min: 2020, max: 2024 })}-${faker.number.int({ min: 2024, max: 2028 })}`,
                    currentRoom: null, // Will be set when room assignment feature is implemented
                    currentContract: null,
                    studentStatus: faker.helpers.arrayElement(['studying', 'graduated', 'suspended']),
                    ktxStatus: faker.helpers.arrayElement(['not_registered', 'waiting_room', 'checked_in', 'checked_out', 'banned'])
                };
                student = await Student.create(studentData);
                console.log(`  Created Student: ${student.studentId} - ${user.fullName}`);
            } else {
                console.log(`  Student already exists: ${student.studentId}`);
            }
            createdData.students.push(student);
        }

        // 3. Create 10 Registration Forms (linked to users)
        console.log('\nCreating 10 Registration Forms...');
        for (let i = 0; i < createdData.users.length; i++) {
            const user = createdData.users[i];

            // Check if registration form exists for this user
            let regForm = await RegistrationForm.findOne({ userId: user._id });
            if (!regForm) {
                const status = faker.helpers.arrayElement([
                    'draft', 'submitted', 'missing_document', 'resubmitted',
                    'pending', 'approved', 'rejected', 'pending_offline',
                    'received_offline', 'processing'
                ]);

                // Lấy student tương ứng với user (nếu có)
                const student = createdData.students.find(s => s.userId.toString() === user._id.toString());
                
                // Tạo progress data theo logic tiến độ
                const progressData = generateProgressData();
                
                const regFormData = {
                    registrationFormCode: generateRegistrationCode(i),
                    userId: user._id,
                    submissionType: faker.helpers.arrayElement(['online', 'offline']),
                    status: status,
                    formData: generateFormData(user, student),
                    isMissingDocuments: status === 'missing_document',
                    resubmitCount: faker.number.int({ min: 0, max: 2 }),
                    hasDraft: progressData.hasDraft,
                    progressPercent: progressData.progressPercent,
                    currentStep: progressData.currentStep,
                    completedSteps: progressData.completedSteps,
                    source: faker.helpers.arrayElement(['user', 'admin']),
                    requiredDocuments: {
                        cccdFront: faker.datatype.boolean(0.7),
                        cccdBack: faker.datatype.boolean(0.7),
                        studentCard: faker.datatype.boolean(0.6),
                        priorityDoc: faker.datatype.boolean(0.3),
                        stampedForm: faker.datatype.boolean(0.5)
                    },
                    canSubmitWithoutStamp: true,
                    submittedAt: status !== 'draft' ? faker.date.recent({ days: 60 }) : null,
                    approvedAt: status === 'approved' ? faker.date.recent({ days: 30 }) : null,
                    rejectedAt: status === 'rejected' ? faker.date.recent({ days: 30 }) : null
                };

                regForm = await RegistrationForm.create(regFormData);
                console.log(`  Created RegistrationForm: ${regForm.registrationFormCode} - Status: ${status}`);

                // Update user's registrationId
                user.registrationId = regForm._id;
                await user.save();
            } else {
                console.log(`  RegistrationForm already exists for user: ${user.email}`);
            }
            createdData.registrationForms.push(regForm);
        }

        // 4. Create Registration Documents (linked to registration forms)
        console.log('\nCreating Registration Documents...');
        for (const regForm of createdData.registrationForms) {
            const numDocs = faker.number.int({ min: 2, max: 5 });
            const shuffledTypes = faker.helpers.shuffle([...documentTypes]);
            const selectedTypes = shuffledTypes.slice(0, numDocs);

            for (const docType of selectedTypes) {
                // Check if document already exists
                const existingDoc = await RegistrationDocument.findOne({
                    registrationForm: regForm._id,
                    type: docType
                });

                if (!existingDoc) {
                    const docData = {
                        registrationForm: regForm._id,
                        type: docType,
                        fileUrl: faker.image.url(),
                        publicId: `uploads/${regForm._id}_${docType}`,
                        status: faker.helpers.arrayElement(['pending', 'approved', 'rejected', 'verified']),
                        uploadedBy: faker.helpers.arrayElement(['student', 'admin']),
                        note: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : null
                    };
                    const doc = await RegistrationDocument.create(docData);
                    createdData.registrationDocuments.push(doc);
                }
            }
        }
        console.log(`  Created ${createdData.registrationDocuments.length} RegistrationDocuments`);

        // 5. Create Registration Missing Documents for forms with missing_document status
        console.log('\nCreating Registration Missing Documents...');
        const missingDocForms = createdData.registrationForms.filter(f => f.status === 'missing_document');
        let missingDocCount = 0;
        for (const regForm of missingDocForms) {
            const missingTypes = documentTypes.filter(t => {
                const fieldName = t.replace(/_([a-z])/g, (g) => g[1].toUpperCase()); // Convert to camelCase
                return !regForm.requiredDocuments[fieldName];
            });

            for (const missingType of missingTypes.slice(0, 2)) {
                const existingMissing = await RegistrationMissingDocument.findOne({
                    registrationForm: regForm._id,
                    documentType: missingType
                });

                if (!existingMissing) {
                    const missingDocData = {
                        registrationForm: regForm._id,
                        documentType: missingType,
                        note: faker.lorem.sentence(),
                        isResolved: faker.datatype.boolean(0.3),
                        resolvedAt: faker.datatype.boolean(0.3) ? faker.date.recent({ days: 7 }) : null
                    };
                    await RegistrationMissingDocument.create(missingDocData);
                    missingDocCount++;
                }
            }
        }
        console.log(`  Created ${missingDocCount} RegistrationMissingDocuments`);

        // 6. Create Notifications (linked to users)
        console.log('\nCreating Notifications...');
        for (const user of createdData.users) {
            const numNotifications = faker.number.int({ min: 2, max: 5 });

            for (let i = 0; i < numNotifications; i++) {
                const category = faker.helpers.arrayElement(notificationCategories);
                const type = faker.helpers.arrayElement(notificationTypes);
                const isRead = faker.datatype.boolean(0.6);

                const notificationData = {
                    recipient: user._id,
                    type: type,
                    category: category,
                    title: faker.helpers.arrayElement([
                        'Đơn đăng ký đã được phê duyệt',
                        'Yêu cầu bổ sung tài liệu',
                        'Nhắc nhở thanh toán',
                        'Thông báo hệ thống',
                        'Cập nhật trạng thái phòng',
                        'Thông báo quan trọng',
                        'Xác nhận đăng ký thành công',
                        'Nhắc nhở hạn chót nộp hồ sơ'
                    ]),
                    content: faker.lorem.paragraph(2),
                    priority: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
                    isRead: isRead,
                    isPushSent: faker.datatype.boolean(0.5),
                    isEmailSent: faker.datatype.boolean(0.4),
                    readAt: isRead ? faker.date.recent({ days: 7 }) : null,
                    actionUrl: faker.datatype.boolean(0.5) ? faker.internet.url() : null,
                    metadata: {
                        relatedId: faker.string.uuid(),
                        extraInfo: faker.lorem.sentence()
                    }
                };

                const notification = await Notification.create(notificationData);
                createdData.notifications.push(notification);
            }
        }
        console.log(`  Created ${createdData.notifications.length} Notifications`);

        // 7. Create Notification Preferences (linked to users)
        console.log('\nCreating Notification Preferences...');
        for (const user of createdData.users) {
            const existingPref = await NotificationPreference.findOne({ user: user._id });
            if (!existingPref) {
                const prefData = {
                    user: user._id,
                    enabled: faker.datatype.boolean(0.9),
                    quietHoursEnabled: faker.datatype.boolean(0.7),
                    quietHoursStart: faker.number.int({ min: 21, max: 23 }),
                    quietHoursEnd: faker.number.int({ min: 6, max: 9 }),
                    pushEnabled: faker.datatype.boolean(0.8),
                    emailEnabled: faker.datatype.boolean(0.9),
                    smsEnabled: faker.datatype.boolean(0.2),
                    priorityThreshold: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
                    maxNotificationsPerHour: faker.number.int({ min: 5, max: 20 }),
                    maxNotificationsPerDay: faker.number.int({ min: 50, max: 150 }),
                    devices: faker.datatype.boolean(0.8) ? [
                        {
                            deviceId: faker.string.uuid(),
                            deviceType: faker.helpers.arrayElement(['web', 'mobile', 'tablet']),
                            fcmToken: faker.string.alphanumeric(140),
                            isActive: true,
                            lastUsed: faker.date.recent({ days: 7 }),
                            platform: faker.helpers.arrayElement(['ios', 'android', 'web'])
                        }
                    ] : []
                };
                const pref = await NotificationPreference.create(prefData);
                createdData.notificationPreferences.push(pref);
            }
        }
        console.log(`  Created ${createdData.notificationPreferences.length} NotificationPreferences`);

        // 8. Create Audit Logs (linked to users)
        console.log('\nCreating Audit Logs...');
        const actions = ['LOGIN', 'LOGOUT', 'CREATE_REGISTRATION', 'UPDATE_PROFILE', 'UPLOAD_DOCUMENT', 'SUBMIT_FORM', 'APPROVE_REGISTRATION', 'REJECT_REGISTRATION', 'VIEW_CONTRACT', 'PAYMENT'];
        const resources = ['User', 'Registration', 'Document', 'Contract', 'Payment', 'Room', 'System'];
        const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        const statuses = ['SUCCESS', 'FAILED', 'BLOCKED'];

        for (const user of createdData.users) {
            const numLogs = faker.number.int({ min: 3, max: 8 });

            for (let i = 0; i < numLogs; i++) {
                const action = faker.helpers.arrayElement(actions);
                const resource = faker.helpers.arrayElement(resources);
                const status = faker.helpers.arrayElement(statuses);

                const logData = {
                    userId: user._id,
                    action: action,
                    resource: resource,
                    resourceId: faker.string.uuid(),
                    details: {
                        description: faker.lorem.sentence(),
                        metadata: { ip: faker.internet.ip(), userAgent: faker.internet.userAgent() }
                    },
                    ipAddress: faker.internet.ip(),
                    userAgent: faker.internet.userAgent(),
                    location: {
                        country: 'Vietnam',
                        city: faker.helpers.arrayElement(['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hai Phong']),
                        coordinates: {
                            lat: faker.location.latitude(),
                            lng: faker.location.longitude()
                        }
                    },
                    severity: status === 'FAILED' ? 'HIGH' : faker.helpers.arrayElement(severities),
                    status: status,
                    sessionId: faker.string.alphanumeric(32),
                    apiEndpoint: `/api/${resource.toLowerCase()}/${action.toLowerCase()}`,
                    httpMethod: faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE']),
                    responseTime: faker.number.int({ min: 50, max: 2000 }),
                    errorMessage: status === 'FAILED' ? faker.lorem.sentence() : null
                };

                const auditLog = await AuditLog.create(logData);
                createdData.auditLogs.push(auditLog);
            }
        }
        console.log(`  Created ${createdData.auditLogs.length} AuditLogs`);

        // Summary
        console.log('\n========================================');
        console.log('SEED DATA SUMMARY');
        console.log('========================================');
        console.log(`Users:                    ${createdData.users.length}`);
        console.log(`Students:                 ${createdData.students.length}`);
        console.log(`Registration Forms:       ${createdData.registrationForms.length}`);
        console.log(`Registration Documents:   ${createdData.registrationDocuments.length}`);
        console.log(`Missing Documents:        ${missingDocCount}`);
        console.log(`Notifications:            ${createdData.notifications.length}`);
        console.log(`Notification Preferences: ${createdData.notificationPreferences.length}`);
        console.log(`Audit Logs:               ${createdData.auditLogs.length}`);
        console.log('========================================');
        console.log('\nSeed data created successfully!');
        console.log('Data was appended to existing data (no deletion).');

    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\nDatabase connection closed.');
        process.exit(0);
    }
};

// Run seed
seedData();
