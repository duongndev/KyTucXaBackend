import mongoose from "mongoose";
import { hashPassword } from '../../utils/utility.function.js';

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ["admin", "student"],
        default: "student"
    },
    identityCard: {
        type: String,
        sparse: true
    },
    dateOfBirth: {
        type: Date,
        required: false
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"],
        required: false
    },
    phoneNumber: {
        type: String,
        required: false,
        trim: true
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "inactive"
    },
    refreshToken: {
        type: String,
        default: null
    },
    currentSessionId: {
        type: String,
        default: null
    },
    fcmToken: {
        type: String,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    isAccountVerified: {
        type: Boolean,
        default: false
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    emailVerificationOTP: {
        type: String,
        default: null
    },
    emailVerificationOTPExpires: {
        type: Date,
        default: null
    },
    registrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Registration",
        default: null
    },
}, {
    timestamps: true,
    versionKey: false
});


// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        this.password = await hashPassword(this.password);
        next();
    } catch (error) {
        next(error);
    }
});

export default mongoose.model("User", userSchema);
