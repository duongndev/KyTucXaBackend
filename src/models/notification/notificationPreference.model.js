import mongoose from "mongoose";

const NotificationPreferenceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Global preferences
    enabled: {
        type: Boolean,
        default: true
    },
    quietHoursEnabled: {
        type: Boolean,
        default: true
    },
    quietHoursStart: {
        type: Number,
        min: 0,
        max: 23,
        default: 22
    },
    quietHoursEnd: {
        type: Number,
        min: 0,
        max: 23,
        default: 7
    },
    // Channel preferences
    pushEnabled: {
        type: Boolean,
        default: true
    },
    emailEnabled: {
        type: Boolean,
        default: true
    },
    smsEnabled: {
        type: Boolean,
        default: false
    },
    // Category preferences
    categories: {
        supportRequest: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        payment: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        contract: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        room: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false }
        },
        system: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        maintenance: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false }
        },
        announcement: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        reminder: {
            enabled: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false }
        }
    },
    // Priority preferences
    priorityThreshold: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    // Frequency preferences
    maxNotificationsPerHour: {
        type: Number,
        min: 1,
        max: 50,
        default: 10
    },
    maxNotificationsPerDay: {
        type: Number,
        min: 1,
        max: 200,
        default: 100
    },
    // Email preferences
    emailDigest: {
        enabled: { type: Boolean, default: false },
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
            default: 'daily'
        },
        time: {
            type: String,
            default: '09:00'
        }
    },
    // Device preferences
    devices: [{
        deviceId: { type: String, required: true },
        deviceType: {
            type: String,
            enum: ['web', 'mobile', 'tablet'],
            required: true
        },
        fcmToken: { type: String, required: true },
        isActive: { type: Boolean, default: true },
        lastUsed: { type: Date, default: Date.now },
        platform: {
            type: String,
            enum: ['ios', 'android', 'web'],
            required: true
        }
    }]
}, {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
NotificationPreferenceSchema.index({ 'devices.fcmToken': 1 });
NotificationPreferenceSchema.index({ 'devices.isActive': 1 });

// Virtual fields
NotificationPreferenceSchema.virtual('activeDevices').get(function() {
    return this.devices.filter(device => device.isActive);
});

// Static methods
NotificationPreferenceSchema.statics.findByUser = function(userId) {
    return this.findOne({ user: userId }).populate('user', 'username email');
};

NotificationPreferenceSchema.statics.createDefaultPreferences = function(userId) {
    return this.create({ user: userId });
};

NotificationPreferenceSchema.statics.updateDeviceToken = function(userId, deviceData) {
    return this.findOneAndUpdate(
        { user: userId, 'devices.deviceId': deviceData.deviceId },
        { 
            $set: { 
                'devices.$': {
                    ...deviceData,
                    lastUsed: new Date(),
                    isActive: true
                }
            }
        },
        { new: true, upsert: false }
    );
};

NotificationPreferenceSchema.statics.addDevice = function(userId, deviceData) {
    return this.findOneAndUpdate(
        { user: userId },
        { 
            $push: { 
                devices: {
                    ...deviceData,
                    lastUsed: new Date(),
                    isActive: true
                }
            }
        },
        { new: true, upsert: true }
    );
};

NotificationPreferenceSchema.statics.removeDevice = function(userId, deviceId) {
    return this.findOneAndUpdate(
        { user: userId },
        { 
            $pull: { devices: { deviceId } }
        },
        { new: true }
    );
};

NotificationPreferenceSchema.statics.deactivateDevice = function(userId, deviceId) {
    return this.findOneAndUpdate(
        { user: userId, 'devices.deviceId': deviceId },
        { 
            $set: { 'devices.$.isActive': false }
        },
        { new: true }
    );
};

// Instance methods
NotificationPreferenceSchema.methods.shouldReceiveNotification = function(notification) {
    // Check global enabled
    if (!this.enabled) return false;
    
    // Check category enabled
    const categoryKey = notification.category.toLowerCase().replace('_', '');
    if (!this.categories[categoryKey]?.enabled) return false;
    
    // Check priority threshold
    const priorityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
    const notificationPriority = priorityLevels[notification.priority];
    const thresholdPriority = priorityLevels[this.priorityThreshold];
    
    if (notificationPriority < thresholdPriority) return false;
    
    return true;
};

NotificationPreferenceSchema.methods.getPreferredChannels = function(notification) {
    const categoryKey = notification.category.toLowerCase().replace('_', '');
    const categoryPrefs = this.categories[categoryKey] || {};
    
    const channels = [];
    if (categoryPrefs.push && this.pushEnabled) channels.push('push');
    if (categoryPrefs.email && this.emailEnabled) channels.push('email');
    if (categoryPrefs.sms && this.smsEnabled) channels.push('sms');
    
    return channels;
};

NotificationPreferenceSchema.methods.isWithinRateLimit = function() {
    // This would typically check against a rate limiting store like Redis
    // For now, return true (implementation would depend on your rate limiting strategy)
    return true;
};

NotificationPreferenceSchema.methods.getActiveFcmTokens = function() {
    return this.devices
        .filter(device => device.isActive && device.fcmToken)
        .map(device => device.fcmToken);
};

export default mongoose.model("NotificationPreference", NotificationPreferenceSchema);
