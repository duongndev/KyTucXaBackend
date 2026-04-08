import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'URGENT'],
        default: 'INFO'
    },
    category: {
        type: String,
        required: true,
        enum: [
            'REGISTRATION',
            'PAYMENT', 
            'CONTRACT',
            'ROOM',
            'SYSTEM',
            'DOCUMENT',
            'CHECKIN',
            'ANNOUNCEMENT',
            'REMINDER'
        ]
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    priority: {
        type: String,
        required: true,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    relatedResource: {
        resourceType: {
            type: String,
            enum: ['Registration', 'Invoice', 'Contract', 'Room', 'User', 'KtxConfig', 'Document'],
            default: null
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        }
    },
    actionUrl: {
        type: String,
        default: null,
        validate: {
            validator: function(value) {
                return !value || /^https?:\/\/.+/.test(value);
            },
            message: 'Action URL phải là URL hợp lệ'
        }
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    isPushSent: {
        type: Boolean,
        default: false,
        index: true
    },
    isEmailSent: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: {
        type: Date,
        default: null
    },
    pushSentAt: {
        type: Date,
        default: null
    },
    emailSentAt: {
        type: Date,
        default: null
    },
    scheduledFor: {
        type: Date,
        default: null,
        index: true
    },
    expiresAt: {
        type: Date,
        default: null,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    retryCount: {
        type: Number,
        default: 0,
        max: 5
    },
    lastRetryAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound indexes
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isPushSent: 1, createdAt: -1 });
NotificationSchema.index({ category: 1, priority: 1, createdAt: -1 });
NotificationSchema.index({ scheduledFor: 1, isPushSent: 1 });
NotificationSchema.index({ expiresAt: 1, isRead: 1 });

// Virtual fields
NotificationSchema.virtual('isExpired').get(function() {
    return this.expiresAt && new Date() > this.expiresAt;
});

NotificationSchema.virtual('isOverdue').get(function() {
    return this.scheduledFor && new Date() > this.scheduledFor && !this.isPushSent;
});

NotificationSchema.virtual('canRetry').get(function() {
    return this.retryCount < 5 && !this.isPushSent;
});

// Pre-save middleware
NotificationSchema.pre('save', function(next) {
    // Auto-set expiration for certain notification types
    if (this.isNew && !this.expiresAt) {
        const now = new Date();
        switch (this.category) {
            case 'SYSTEM':
                this.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
                break;
            case 'ANNOUNCEMENT':
                this.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
                break;
            default:
                this.expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days
        }
    }

    // Auto-schedule for certain types
    if (this.isNew && !this.scheduledFor) {
        const now = new Date();
        switch (this.category) {
            case 'REMINDER':
                this.scheduledFor = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day later
                break;
            case 'PAYMENT':
                if (this.metadata.dueDate) {
                    const dueDate = new Date(this.metadata.dueDate);
                    this.scheduledFor = new Date(dueDate.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before due
                }
                break;
        }
    }

    next();
});

// Static methods
NotificationSchema.statics.findByRecipient = function(recipientId, options = {}) {
    const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        category = null,
        type = null
    } = options;

    const filter = { recipient: recipientId };
    if (unreadOnly) filter.isRead = false;
    if (category) filter.category = category;
    if (type) filter.type = type;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    return this.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum);
};

NotificationSchema.statics.findUnreadCount = function(recipientId) {
    return this.countDocuments({ 
        recipient: recipientId, 
        isRead: false,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

NotificationSchema.statics.findScheduledNotifications = function() {
    return this.find({
        scheduledFor: { $lte: new Date() },
        isPushSent: false,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    }).populate('recipient');
};

NotificationSchema.statics.findOverdueNotifications = function() {
    return this.find({
        scheduledFor: { $lte: new Date() },
        isPushSent: false,
        retryCount: { $lt: 5 },
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    }).populate('recipient');
};

NotificationSchema.statics.markAllAsRead = function(recipientId) {
    return this.updateMany(
        { recipient: recipientId, isRead: false },
        { 
            isRead: true, 
            readAt: new Date() 
        }
    );
};

NotificationSchema.statics.getNotificationStats = function(recipientId = null) {
    const matchStage = recipientId ? { recipient: new mongoose.Types.ObjectId(recipientId) } : {};
    
    return this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$category',
                total: { $sum: 1 },
                unread: {
                    $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
                },
                sent: {
                    $sum: { $cond: [{ $eq: ['$isPushSent', true] }, 1, 0] }
                }
            }
        },
        { $sort: { total: -1 } }
    ]);
};

NotificationSchema.statics.cleanupExpiredNotifications = function() {
    return this.deleteMany({
        expiresAt: { $lte: new Date() },
        isRead: true
    });
};

// Instance methods
NotificationSchema.methods.markAsRead = function() {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

NotificationSchema.methods.markPushSent = function() {
    this.isPushSent = true;
    this.pushSentAt = new Date();
    return this.save();
};

NotificationSchema.methods.markEmailSent = function() {
    this.isEmailSent = true;
    this.emailSentAt = new Date();
    return this.save();
};

NotificationSchema.methods.incrementRetry = function() {
    this.retryCount += 1;
    this.lastRetryAt = new Date();
    return this.save();
};

NotificationSchema.methods.isWithinQuietHours = function(userPreferences = {}) {
    if (!userPreferences.quietHoursEnabled) return true;
    
    const now = new Date();
    const currentHour = now.getHours();
    
    const quietStart = userPreferences.quietHoursStart || 22;
    const quietEnd = userPreferences.quietHoursEnd || 7;
    
    if (quietStart > quietEnd) {
        // Cross midnight (e.g., 22:00 - 07:00)
        return currentHour >= quietStart || currentHour < quietEnd;
    } else {
        // Same day (e.g., 01:00 - 06:00)
        return currentHour >= quietStart && currentHour < quietEnd;
    }
};

NotificationSchema.methods.getPushPayload = function() {
    return {
        title: this.title,
        body: this.content,
        data: {
            notificationId: this._id.toString(),
            category: this.category,
            type: this.type,
            relatedResource: this.relatedResource,
            actionUrl: this.actionUrl
        },
        priority: this.priority.toLowerCase(),
        sound: this.priority === 'URGENT' ? 'default' : 'default',
        badge: 1
    };
};

export default mongoose.model("Notification", NotificationSchema);
