// Building models
export { default as Building } from './building/building.model.js';
export { default as Room } from './building/room.model.js';
export { default as RoomAssignment } from './building/roomAssignment.model.js';

// User models
export { default as User } from './user/user.model.js';
export { default as Student } from './user/student.model.js';

// Registration models
export { default as RegistrationForm } from './registration/registrationForm.model.js';
export { default as RegistrationDocument } from './registration/registrationDocument.model.js';
export { default as RegistrationMissingDocument } from './registration/registrationMissingDocument.model.js';

// Maintenance models
export { default as MaintenanceRequest } from './maintenance/maintenanceRequest.model.js';

// Notification models
export { default as Notification } from './notification/notification.model.js';
export { default as NotificationPreference } from './notification/notificationPreference.model.js';

// Audit log
export { default as AuditLog } from './auditLog.model.js';

// Contract models (re-export from contract/index.js)
export * from './contract/index.js';

// Support models (Chat, Ticket, FAQ, Feedback)
export * from './support/index.js';
