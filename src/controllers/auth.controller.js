import User from "../models/user/user.model.js";
import Student from "../models//user/student.model.js";
import mongoose from "mongoose";
import {
  hashPassword,
  comparePassword,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  generateOTP,
  generateSecureToken,
} from "../utils/utility.function.js";
import { logSecurityEvent } from "../utils/security.logger.js";
import {
  validateEmail,
  validatePhoneNumber,
  validatePassword,
  validateConfirmPassword,
  validateCCCD,
} from "../utils/validate.function.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  createdResponse,
} from "../utils/response.js";
import { sendRegistrationOTPEmail } from "../services/email.service.js";
import expressAsyncHandler from "express-async-handler";

// Register user
export const register = expressAsyncHandler(async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      confirmPassword,
      role = "student",
    } = req.body;

    // Validate input
    if (!fullName || !email || !password || !confirmPassword) {
      return badRequestResponse(res, "Vui lòng nhập đầy đủ thông tin");
    }

    // Validate email format
    if (!validateEmail(email)) {
      return badRequestResponse(res, "Email không hợp lệ");
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return badRequestResponse(res, passwordValidation.message);
    }

    // Validate password confirmation
    const confirmPasswordValidation = validateConfirmPassword(
      password,
      confirmPassword,
    );
    if (!confirmPasswordValidation.valid) {
      return badRequestResponse(res, confirmPasswordValidation.message);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return badRequestResponse(res, "Email đã được sử dụng");
    }

    // Create user
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
    const now = new Date();

    const user = await User.create({
      fullName,
      email,
      password,
      role,
      status: role === "admin" ? "active" : "inactive", // Student status is inactive by default
      isEmailVerified: role === "admin", // Admin emails are pre-verified
      emailVerificationOTP: role === "student" ? otp : null,
      emailVerificationOTPExpires: role === "student" ? otpExpires : null,
      lastOTPRequestAt: role === "student" ? now : null,
      otpRequestCount: role === "student" ? 1 : 0,
    });

    await user.save();

    // Log registration event
    await logSecurityEvent("REGISTRATION_SUCCESS", {
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    if (role === "student") {
      // Send OTP email for verification
      try {
        await sendRegistrationOTPEmail(email, fullName, otp);
      } catch (emailError) {
        console.error("Failed to send OTP email:", emailError);
        // Don't fail registration if email fails, but log it
        await logSecurityEvent("OTP_SEND_FAILED", {
          userId: user._id,
          email: user.email,
          error: emailError.message,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });
      }
    }

    createdResponse(res, "Đăng ký thành công", {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        isAccountVerified: user.isAccountVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      message:
        role === "student"
          ? "Tài khoản đã được tạo. Vui lòng kiểm tra email để xác thực OTP. Mã OTP có hiệu lực trong 2 phút."
          : "Tài khoản admin đã được tạo. Bạn có thể đăng nhập ngay.",
    });
  } catch (error) {
    console.error("Register error:", error);
    await logSecurityEvent("REGISTRATION_FAILED", {
      email: req.body.email,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Đăng ký thất bại", error.message);
  }
});

// Login user
export const login = expressAsyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return badRequestResponse(res, "Vui lòng điền email và mật khẩu");
    }

    // Validate email format
    if (!validateEmail(email)) {
      return badRequestResponse(res, "Email không hợp lệ");
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      await logSecurityEvent("LOGIN_FAILED", {
        email,
        reason: "User not found",
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return unauthorizedResponse(res, "Email hoặc mật khẩu không chính xác");
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      await logSecurityEvent("LOGIN_FAILED", {
        userId: user._id,
        email,
        reason: "Invalid password",
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return unauthorizedResponse(res, "Email hoặc mật khẩu không chính xác");
    }

    // Check if user is email verified (only for non-admin users)
    if (user.role !== "admin" && !user.isEmailVerified) {
      await logSecurityEvent("LOGIN_FAILED", {
        userId: user._id,
        email,
        reason: "Email not verified",
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return forbiddenResponse(
        res,
        "Tài khoản của bạn chưa được xác thực. Vui lòng kiểm tra email và xác thực tài khoản trước khi đăng nhập.",
        {
          isEmailVerified: false,
        },
      );
    }

    // Generate new session ID to invalidate old sessions (single device login)
    const sessionId = generateSecureToken(32);

    // Generate tokens with session ID
    const accessToken = await generateAccessToken(user, sessionId);
    const refreshToken = await generateRefreshToken(user, sessionId);

    // Update user with new session and refresh token
    user.refreshToken = refreshToken;
    user.currentSessionId = sessionId;
    user.lastLoginAt = new Date();
    await user.save();

    // Get student info and determine next action
    const student = await Student.findOne({ userId: user._id });
    const studentInfo = student
      ? {
          studentId: student.studentId,
          university: student.university,
          major: student.major,
          class: student.class,
          academicYear: student.academicYear,
          status: student.status,
          ktxStatus: student.ktxStatus,
        }
      : null;

    // Determine next action based on profile status
    let responseMessage = "Đăng nhập thành công";
    let nextAction = null;
    let requiresProfileUpdate = false;

    // Admin users skip student profile checks
    if (user.role === "admin") {
      nextAction = "ADMIN_DASHBOARD_ACCESS";
      responseMessage = "Đăng nhập thành công. Chào mừng Admin!";
    } else if (!student) {
      nextAction = "CREATE_STUDENT_PROFILE";
      responseMessage =
        "Đăng nhập thành công. Vui lòng hoàn tất hồ sơ sinh viên.";
      requiresProfileUpdate = true;
    } else if (!user.isAccountVerified) {
      nextAction = "COMPLETE_STUDENT_PROFILE";
      responseMessage =
        "Đăng nhập thành công. Vui lòng hoàn tất thông tin hồ sơ.";
      requiresProfileUpdate = true;
    } else if (user.status === "inactive") {
      nextAction = "ACCOUNT_INACTIVE";
      responseMessage = "Đăng nhập thành công. Tài khoản đang chờ kích hoạt.";
    } else {
      nextAction = "DASHBOARD_ACCESS";
      responseMessage = "Đăng nhập thành công. Chào mừng bạn trở lại!";
    }

    // Log successful login with session info
    await logSecurityEvent("LOGIN_SUCCESS", {
      userId: user._id,
      email,
      role: user.role,
      sessionId,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      nextAction: nextAction,
    });

    successResponse(res, responseMessage, {
      tokens: {
        accessToken,
        refreshToken,
      },
      session: {
        sessionId,
        isNewSession: true,
      },
      user: {
        _id: user._id,
        fullName: user.fullName,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        isAccountVerified: user.isAccountVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      student: studentInfo,
      // nextAction,
      // requiresProfileUpdate,
      // accountStatus: user.status,
      // canAccessRegistration: user.status === 'active' && student && user.isAccountVerified
    });
  } catch (error) {
    console.error("Login error:", error);
    await logSecurityEvent("LOGIN_FAILED", {
      email: req.body.email,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Đăng nhập thất bại", error.message);
  }
});

// logout
export const logout = expressAsyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear refresh token and session ID
    const user = await User.findByIdAndUpdate(userId, { 
      refreshToken: "",
      currentSessionId: null
    });

    // Log logout event
    await logSecurityEvent("LOGOUT_SUCCESS", {
      userId,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    successResponse(res, "Đăng xuất thành công", {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Logout error:", error);
    errorResponse(res, "Đăng xuất thất bại", error.message);
  }
});

// refresh token
export const refreshToken = expressAsyncHandler(async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return unauthorizedResponse(res, "Refresh token không được cung cấp");
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = await verifyRefreshToken(token);
    } catch (error) {
      return unauthorizedResponse(res, "Refresh token không hợp lệ");
    }

    if (!decoded) {
      return unauthorizedResponse(res, "Refresh token không hợp lệ");
    }

    // Find user
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== token) {
      return unauthorizedResponse(res, "Refresh token không hợp lệ");
    }

    // Check if session is still valid (single device login)
    if (decoded.sessionId && user.currentSessionId && decoded.sessionId !== user.currentSessionId) {
      return unauthorizedResponse(res, "Phiên đăng nhập không hợp lệ. Tài khoản đã được đăng nhập trên thiết bị khác.");
    }

    // Generate new tokens with same session ID
    const sessionId = decoded.sessionId || user.currentSessionId;
    const newAccessToken = await generateAccessToken(user, sessionId);
    const newRefreshToken = await generateRefreshToken(user, sessionId);

    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    successResponse(res, "Làm mới token thành công", {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    errorResponse(res, "Làm mới token thất bại", error.message);
  }
});

// get current user
export const getCurrentUser = expressAsyncHandler(async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return unauthorizedResponse(res, "Token không hợp lệ");
    }

    const userId = req.user.id;

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return unauthorizedResponse(res, "Không tìm thấy người dùng");
    }

    // Get student info if applicable
    const student = await Student.findOne({ userId: user._id });
    const studentInfo = student
      ? {
          studentId: student.studentId,
          university: student.university,
          major: student.major,
          className: student.className,
          academicYear: student.academicYear,
          status: student.studentStatus,
          ktxStatus: student.ktxStatus,
        }
      : null;

    // Determine profile status and next steps theo luồng mới
    let profileStatus = "NOT_STARTED";
    let nextSteps = [];
    let completionPercentage = 0;
    let statusMessage = "";
    let canProceedToNext = false;

    // Admin users skip student profile checks
    if (user.role === "admin") {
      profileStatus = "COMPLETE";
      nextSteps = ["accessAdminDashboard"];
      completionPercentage = 100;
      statusMessage = "Tài khoản Admin đã sẵn sàng sử dụng.";
      canProceedToNext = true;
    } else if (!user.isEmailVerified) {
      profileStatus = "EMAIL_NOT_VERIFIED";
      nextSteps = ["verifyEmail"];
      completionPercentage = 0;
      statusMessage =
        "Tài khoản chưa xác thực email. Vui lòng kiểm tra email và xác thực OTP.";
      canProceedToNext = false;
    } else if (!student) {
      profileStatus = "NOT_STARTED";
      nextSteps = ["createStudentProfile"];
      completionPercentage = 25;
      statusMessage =
        "Email đã xác thực. Vui lòng hoàn tất thông tin sinh viên.";
      canProceedToNext = true;
    } else {
      // Kiểm tra các trường bắt buộc của profile
      const requiredUserFields = {
        fullName: !!user.fullName,
        phoneNumber: !!user.phoneNumber,
        dateOfBirth: !!user.dateOfBirth,
        gender: !!user.gender,
        identityCard: !!user.identityCard,
      };

      const requiredStudentFields = {
        studentId: !!student.studentId,
        university: !!student.university,
        major: !!student.major,
        className: !!student.className,
      };

      const allUserFieldsComplete =
        Object.values(requiredUserFields).every(Boolean);
      const allStudentFieldsComplete = Object.values(
        requiredStudentFields,
      ).every(Boolean);
      const allFieldsComplete =
        allUserFieldsComplete && allStudentFieldsComplete;

      if (!allFieldsComplete) {
        profileStatus = "INCOMPLETE";
        nextSteps = ["completeStudentProfile"];
        completionPercentage = 50;

        // Xác định các trường còn thiếu
        const missingFields = [];
        if (!requiredUserFields.fullName) missingFields.push("họ tên");
        if (!requiredUserFields.phoneNumber)
          missingFields.push("số điện thoại");
        if (!requiredUserFields.dateOfBirth) missingFields.push("ngày sinh");
        if (!requiredUserFields.gender) missingFields.push("giới tính");
        if (!requiredUserFields.identityCard)
          missingFields.push("số căn cước công dân");
        if (!requiredStudentFields.studentId)
          missingFields.push("mã số sinh viên");
        if (!requiredStudentFields.university)
          missingFields.push("cơ sở đào tạo");
        if (!requiredStudentFields.major) missingFields.push("khoa");
        if (!requiredStudentFields.class) missingFields.push("lớp");

        statusMessage = `Thông tin cá nhân chưa hoàn tất. Vui lòng bổ sung: ${missingFields.join(", ")}.`;
        canProceedToNext = true;
      } else if (!user.isAccountVerified) {
        profileStatus = "PENDING_VERIFICATION";
        nextSteps = ["waitForAccountVerification"];
        completionPercentage = 75;
        statusMessage =
          "Thông tin cá nhân đã hoàn tất. Tài khoản đang chờ kích hoạt.";
        canProceedToNext = false;
      } else if (user.status === "inactive") {
        profileStatus = "INACTIVE";
        nextSteps = ["waitForAdminActivation"];
        completionPercentage = 75;
        statusMessage =
          "Hồ sơ đã hoàn tất. Tài khoản đang chờ quản trị viên kích hoạt.";
        canProceedToNext = false;
      } else {
        profileStatus = "COMPLETE";
        nextSteps = ["accessDashboard", "startRegistration"];
        completionPercentage = 100;
        statusMessage = "Hồ sơ đã hoàn tất. Tài khoản đã sẵn sàng sử dụng.";
        canProceedToNext = true;
      }
    }

    // Xác định các quyền truy cập
    const isAdmin = user.role === "admin";
    const accessPermissions = {
      canAccessDashboard: user.isEmailVerified || isAdmin,
      canEditProfile: true,
      canAccessRegistration: isAdmin ||
        (user.status === "active" && student && user.isAccountVerified),
      canViewRegistrationStatus: isAdmin || !!student,
      canStartNewRegistration: isAdmin ||
        (user.status === "active" && user.isAccountVerified),
      canManageAccount: true,
      canAccessAdminDashboard: isAdmin,
    };

    // Xác định trạng thái account
    const accountState = {
      hasStudentProfile: isAdmin || !!student,
      isEmailVerified: user.isEmailVerified,
      isProfileComplete: isAdmin || user.isAccountVerified,
      isAccountActive: isAdmin || user.status === "active",
      isRegistrationEligible: isAdmin ||
        (user.status === "active" && user.isAccountVerified),
      needsAttention: !isAdmin && (
        !user.isEmailVerified ||
        !user.isAccountVerified ||
        user.status !== "active"
      ),
      isAdmin: isAdmin,
    };

    // Return user info without sensitive data
    const userResponse = {
      _id: user._id,
      fullName: user.fullName,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      email: user.email,
      phoneNumber: user.phoneNumber,
      identityCard: user.identityCard,
      role: user.role,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      isAccountVerified: user.isAccountVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Admin chỉ trả về user data, không cần các phần khác
    if (isAdmin) {
      return successResponse(res, "Lấy thông tin admin thành công", {
        user: userResponse,
      });
    }

    successResponse(res, "Lấy thông tin người dùng thành công", {
      user: userResponse,
      student: studentInfo,
      profile: {
        status: profileStatus,
        completionPercentage,
        statusMessage,
        nextSteps,
        canProceedToNext,
      },
      permissions: accessPermissions,
      accountState,
      workflow: {
        currentStep: profileStatus,
        totalSteps: 4,
        completedSteps: Math.floor(completionPercentage / 25),
        remainingSteps: 4 - Math.floor(completionPercentage / 25),
      },
      statusInfo: {
        currentStatus:
          profileStatus === "COMPLETE"
            ? user.status === "active"
              ? "ACTIVE"
              : "PENDING_ACTIVATION"
            : "INCOMPLETE_PROFILE",
        description:
          profileStatus === "COMPLETE"
            ? user.status === "active"
              ? "Tài khoản đã được kích hoạt và sẵn sàng sử dụng"
              : "Hồ sơ đã hoàn chỉnh, đang chờ quản trị viên kích hoạt"
            : "Hồ sơ chưa hoàn chỉnh, cần bổ sung thông tin",
        missingFields:
          profileStatus === "INCOMPLETE"
            ? Object.entries({
                "Họ tên": !!user.fullName,
                "Số điện thoại": !!user.phoneNumber,
                "Ngày sinh": !!user.dateOfBirth,
                "Giới tính": !!user.gender,
                CCCD: !!user.identityCard,
                "Mã SV": studentInfo ? !!studentInfo.studentId : false,
                "Cơ sở đào tạo": studentInfo ? !!studentInfo.university : false,
                Lớp: studentInfo ? !!studentInfo.className : false,
              })
                .filter(([_, complete]) => !complete)
                .map(([name]) => name)
            : [],
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    errorResponse(res, "Lấy thông tin người dùng thất bại", error.message);
  }
});

// Cập nhật hồ sơ (bước sau đăng nhập — chuẩn bị nộp đơn KTX / xét duyệt)
export const updateProfile = expressAsyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return unauthorizedResponse(res, "Không tìm thấy người dùng");
    }

    const {
      fullName,
      phoneNumber,
      dateOfBirth,
      gender,
      identityCard,
      studentId,
      university,
      major,
      className,
      academicYear,
    } = req.body;

    // Validation cho User fields
    if (fullName != null) {
      const trimmedName = String(fullName).trim();
      if (trimmedName.length < 2 || trimmedName.length > 100) {
        return badRequestResponse(res, "Họ tên phải từ 2 đến 100 ký tự");
      }
      // if (!/^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂÊÔƠƯăâêôơư\s]+$/.test(trimmedName)) {
      //   return badRequestResponse(res, "Họ tên chỉ được chứa chữ cái và khoảng trắng");
      // }
      user.fullName = trimmedName;
    }

    if (phoneNumber != null) {
      const trimmedPhone = String(phoneNumber).trim();
      if (trimmedPhone === "") {
        user.phoneNumber = undefined;
      } else {
        const phoneValidation = validatePhoneNumber(trimmedPhone);
        if (!phoneValidation.valid) {
          return badRequestResponse(res, phoneValidation.message);
        }
        user.phoneNumber = trimmedPhone;
      }
    }

    if (dateOfBirth != null && dateOfBirth !== "") {
      const birthDate = new Date(dateOfBirth);
      if (isNaN(birthDate.getTime())) {
        return badRequestResponse(res, "Ngày sinh không hợp lệ");
      }

      const now = new Date();
      const minDate = new Date(
        now.getFullYear() - 100,
        now.getMonth(),
        now.getDate(),
      );
      const maxDate = new Date(
        now.getFullYear() - 16,
        now.getMonth(),
        now.getDate(),
      );

      if (birthDate < minDate || birthDate > maxDate) {
        return badRequestResponse(
          res,
          "Ngày sinh phải trong khoảng 16 đến 100 tuổi",
        );
      }
      user.dateOfBirth = birthDate;
    }

    if (gender != null) {
      const normalizedGender = String(gender).toLowerCase().trim();
      if (!["male", "female", "other"].includes(normalizedGender)) {
        return badRequestResponse(
          res,
          "Giới tính phải là 'male', 'female' hoặc 'other'",
        );
      }
      user.gender = normalizedGender;
    }

    // Validate và update identityCard
    if (identityCard != null) {
      const trimmedCCCD = String(identityCard).trim();
      if (trimmedCCCD === "") {
        user.identityCard = undefined;
      } else {
        // Validate format CCCD  sử dụng hàm
        // const cccdValidation = validateCCCD(trimmedCCCD);
        // if (!cccdValidation.valid) {
        //   return badRequestResponse(res, cccdValidation.message);
        // }

        // Kiểm tra trùng lặp với user khác
        const existingUser = await User.findOne({
          identityCard: trimmedCCCD,
          _id: { $ne: userId },
        });
        if (existingUser) {
          return badRequestResponse(
            res,
            "Số CCCD đã được sử dụng bởi tài khoản khác",
          );
        }

        user.identityCard = trimmedCCCD;
      }
    }

    // Validation cho Student fields
    let student = null;
    if (user.role === "student") {
      student = await Student.findOne({ userId: user._id });

      // Create student profile if not exists
      if (!student) {
        student = await Student.create({
          userId: user._id,
          studentId: `STU${new Date().getFullYear()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          university: university || "",
          major: "",
          className: "",
          academicYear: "",
          studentStatus: "studying",
          ktxStatus: "not_registered",
        });
      }

      // Validate và update studentId
      if (studentId != null) {
        const trimmedStudentId = String(studentId).trim();
        if (trimmedStudentId === "") {
          return badRequestResponse(res, "Mã số sinh viên không được để trống");
        } else {
          // Validate format mã số sinh viên (chữ và số, không chứa ký tự đặc biệt)
          const studentIdPattern = /^[a-zA-Z0-9]+$/;
          if (!studentIdPattern.test(trimmedStudentId)) {
            return badRequestResponse(
              res,
              "Mã số sinh viên chỉ được chứa chữ cái và số, không chứa ký tự đặc biệt hoặc khoảng trắng",
            );
          }

          if (trimmedStudentId.length < 5 || trimmedStudentId.length > 20) {
            return badRequestResponse(
              res,
              "Mã số sinh viên phải từ 5 đến 20 ký tự",
            );
          }

          // Kiểm tra trùng lặp với sinh viên khác
          const existingStudent = await Student.findOne({
            studentId: trimmedStudentId.toUpperCase(),
            userId: { $ne: userId },
          });
          if (existingStudent) {
            return badRequestResponse(
              res,
              "Mã số sinh viên đã được sử dụng bởi sinh viên khác",
            );
          }

          student.studentId = trimmedStudentId.toUpperCase();
        }
      }

      // Validate và update university
      if (university != null) {
        const trimmedUniversity = String(university).trim();
        if (trimmedUniversity === "") {
          return badRequestResponse(res, "Cơ sở đào tạo không được để trống");
        }
        if (trimmedUniversity.length < 3 || trimmedUniversity.length > 200) {
          return badRequestResponse(
            res,
            "Cơ sở đào tạo phải từ 3 đến 200 ký tự",
          );
        }
        student.university = trimmedUniversity;
      }

      // Validate và update major
      if (major != null) {
        const trimmedMajor = String(major).trim();
        if (trimmedMajor === "") {
          student.major = undefined;
        } else if (trimmedMajor.length > 100) {
          return badRequestResponse(res, "Khoa không được vượt quá 100 ký tự");
        } else {
          student.major = trimmedMajor;
        }
      }

      // Validate và update className
      if (className != null) {
        const trimmedClass = String(className).trim();
        if (trimmedClass === "") {
          student.className = undefined;
        } else if (trimmedClass.length > 50) {
          return badRequestResponse(res, "Lớp không được vượt quá 50 ký tự");
        } else {
          student.className = trimmedClass;
        }
      }

      // Validate và update academicYear
      if (academicYear != null) {
        const trimmedYear = String(academicYear).trim();
        if (trimmedYear === "") {
          student.academicYear = undefined;
        } else {
          // Validate format: 2023-2024 hoặc 2023
          const yearPattern = /^(\d{4})(-\d{4})?$/;
          if (!yearPattern.test(trimmedYear)) {
            return badRequestResponse(
              res,
              "Năm học phải có định dạng '2023' hoặc '2023-2024'",
            );
          }

          const startYear = parseInt(trimmedYear.substring(0, 4));
          const currentYear = new Date().getFullYear();
          if (startYear < 2000 || startYear > currentYear + 1) {
            return badRequestResponse(res, "Năm học không hợp lệ");
          }
          student.academicYear = trimmedYear;
        }
      }
    }

    // Sử dụng session để đảm bảo transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Lưu cả user và student trong transaction
      await user.save({ session });
      if (student) {
        await student.save({ session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // Log profile update event
    await logSecurityEvent("PROFILE_UPDATED", {
      userId: user._id,
      email: user.email,
      updatedFields: {
        fullName: !!fullName,
        phoneNumber: !!phoneNumber,
        dateOfBirth: !!dateOfBirth,
        gender: !!gender,
        identityCard: !!identityCard,
        studentId: !!studentId,
        university: !!university,
        major: !!major,
        className: !!className,
        academicYear: !!academicYear,
      },
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Lấy thông tin student đã cập nhật
    const updatedStudent = await Student.findOne({ userId: user._id });
    const studentInfo = updatedStudent
      ? {
          studentId: updatedStudent.studentId,
          university: updatedStudent.university,
          major: updatedStudent.major,
          className: updatedStudent.className,
          academicYear: updatedStudent.academicYear,
          studentStatus: updatedStudent.studentStatus,
          ktxStatus: updatedStudent.ktxStatus,
        }
      : null;

    // Kiểm tra profile completeness
    const isProfileComplete =
      user.fullName &&
      user.phoneNumber &&
      user.dateOfBirth &&
      user.gender &&
      user.identityCard &&
      updatedStudent &&
      updatedStudent.university &&
      updatedStudent.className &&
      updatedStudent.major &&
      updatedStudent.academicYear &&
      updatedStudent.studentId;

    // Determine response message và next action
    let nextAction = "PROFILE_UPDATED";
    let message = "Cập nhật thông tin cá nhân thành công";
    let accountStatus = "INCOMPLETE_PROFILE";

    if (user.isAccountVerified && user.status === "active") {
      nextAction = "DASHBOARD_ACCESS";
      message =
        "Thông tin cá nhân đã cập nhật. Tài khoản đã được kích hoạt. Bạn có thể bắt đầu sử dụng dịch vụ.";
      accountStatus = "ACTIVE";
    } else if (isProfileComplete) {
      nextAction = "WAITING_ACTIVATION";
      message =
        "Thông tin cá nhân đã hoàn tất. Vui lòng hoàn tất hồ sơ đăng ký ký xá để kích hoạt tài khoản.";
      accountStatus = "PENDING_ACTIVATION";
    } else {
      nextAction = "COMPLETE_PROFILE";
      message = "Cập nhật thông tin cá nhân thành công.";
      accountStatus = "INCOMPLETE_PROFILE";
    }

    successResponse(res, message, {
      user: {
        _id: user._id,
        fullName: user.fullName,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        email: user.email,
        phoneNumber: user.phoneNumber,
        identityCard: user.identityCard,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        isAccountVerified: user.isAccountVerified,
        updatedAt: user.updatedAt,
      },
      student: studentInfo,
      nextAction,
      accountStatus,
      profileComplete: user.isAccountVerified,
      accountActive: user.status === "active",
      canAccessRegistration:
        user.status === "active" && studentInfo && user.isAccountVerified,
      validation: {
        requiredFields: {
          fullName: !!user.fullName,
          phoneNumber: !!user.phoneNumber,
          dateOfBirth: !!user.dateOfBirth,
          gender: !!user.gender,
          identityCard: !!user.identityCard,
          studentId: studentInfo ? !!studentInfo.studentId : false,
          university: studentInfo ? !!studentInfo.university : false,
          major: studentInfo ? !!studentInfo.major : false,
          className: studentInfo ? !!studentInfo.className : false,
          academicYear: studentInfo ? !!studentInfo.academicYear : false,
        },
        isComplete: isProfileComplete,
      },
      statusInfo: {
        currentStatus: accountStatus,
        description:
          accountStatus === "ACTIVE"
            ? "Tài khoản đã được kích hoạt và sẵn sàng sử dụng"
            : accountStatus === "PENDING_ACTIVATION"
              ? "Thông tin cá nhân đã hoàn chỉnh, vui lòng nộp hồ sơ đăng ký ký túc xá để kích hoạt tài khoản"
              : "Thông tin cá nhân chưa hoàn chỉnh, cần bổ sung thông tin",
        missingFields:
          accountStatus === "INCOMPLETE_PROFILE"
            ? Object.entries({
                "Họ tên": !!user.fullName,
                "Số điện thoại": !!user.phoneNumber,
                "Ngày sinh": !!user.dateOfBirth,
                "Giới tính": !!user.gender,
                CCCD: !!user.identityCard,
                "Mã SV": studentInfo ? !!studentInfo.studentId : false,
                "Cơ sở đào tạo": studentInfo ? !!studentInfo.university : false,
                Lớp: studentInfo ? !!studentInfo.className : false,
              })
                .filter(([_, complete]) => !complete)
                .map(([name]) => name)
            : [],
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    await logSecurityEvent("PROFILE_UPDATE_FAILED", {
      userId: req.user?.id,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Cập nhật thông tin cá nhân thất bại", error.message);
  }
});

// Verify email OTP
export const verifyEmailOTP = expressAsyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email || !otp) {
      return badRequestResponse(res, "Vui lòng cung cấp email và mã OTP");
    }

    // Validate email format
    if (!validateEmail(email)) {
      return badRequestResponse(res, "Email không hợp lệ");
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return badRequestResponse(res, "Không tìm thấy người dùng với email này");
    }

    // Check if user is already verified
    if (user.isEmailVerified) {
      return badRequestResponse(res, "Email đã được xác thực");
    }

    // Check if OTP exists and is valid
    if (!user.emailVerificationOTP || !user.emailVerificationOTPExpires) {
      return badRequestResponse(
        res,
        "Không có mã OTP nào được gửi cho tài khoản này",
      );
    }

    // Verify OTP
    if (user.emailVerificationOTP !== otp) {
      await logSecurityEvent("OTP_VERIFICATION_FAILED", {
        userId: user._id,
        email: user.email,
        reason: "Invalid OTP",
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return badRequestResponse(res, "Mã OTP không chính xác");
    }

    // Check if OTP has expired
    if (Date.now() > user.emailVerificationOTPExpires) {
      return badRequestResponse(
        res,
        "Mã OTP đã hết hạn. Vui lòng yêu cầu OTP mới.",
        {
          otpExpired: true,
          canRequestNewOTP: true,
        },
      );
    }

    // Clear OTP and mark email as verified
    user.emailVerificationOTP = null;
    user.emailVerificationOTPExpires = null;
    user.isEmailVerified = true;
    await user.save();

    // Log successful verification
    await logSecurityEvent("OTP_VERIFICATION_SUCCESS", {
      userId: user._id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    successResponse(res, "Tài khoản đã được xác thực thành công.");
  } catch (error) {
    console.error("Verify OTP error:", error);
    // Log security event for failed verification
    await logSecurityEvent("OTP_VERIFICATION_FAILED", {
      email: req.body.email,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Xác thực OTP thất bại", error.message);
  }
});

// Resend OTP với rate limiting 2 phút và OTP expires 2 phút
export const resendOTP = expressAsyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return badRequestResponse(res, "Vui lòng cung cấp email");
    }

    // Validate email format
    if (!validateEmail(email)) {
      return badRequestResponse(res, "Email không hợp lệ");
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return badRequestResponse(res, "Không tìm thấy người dùng với email này");
    }

    // Check if user is already verified
    if (user.isEmailVerified) {
      return badRequestResponse(
        res,
        "Email đã được xác thực. Không cần gửi lại OTP.",
      );
    }

    // Rate limiting: Check if user can request new OTP (2 minutes cooldown)
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    // Check if there was a recent OTP request
    if (user.lastOTPRequestAt && user.lastOTPRequestAt > twoMinutesAgo) {
      const timeUntilNextRequest = Math.ceil(
        (user.lastOTPRequestAt.getTime() + 2 * 60 * 1000 - now.getTime()) /
          1000,
      );
      const minutes = Math.floor(timeUntilNextRequest / 60);
      const seconds = timeUntilNextRequest % 60;

      await logSecurityEvent("OTP_RATE_LIMITED", {
        userId: user._id,
        email: user.email,
        timeUntilNextRequest,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      return badRequestResponse(
        res,
        `Vui lòng đợi ${minutes} phút ${seconds} giây trước khi yêu cầu OTP mới`,
        {
          canResendAt: new Date(
            user.lastOTPRequestAt.getTime() + 2 * 60 * 1000,
          ),
          waitTimeSeconds: timeUntilNextRequest,
        },
      );
    }

    // Check if there's an existing OTP that's still valid
    const existingOTPValid =
      user.emailVerificationOTP &&
      user.emailVerificationOTPExpires &&
      now < user.emailVerificationOTPExpires;

    if (existingOTPValid) {
      const timeUntilExpiry = Math.ceil(
        (user.emailVerificationOTPExpires.getTime() - now.getTime()) / 1000,
      );
      const minutes = Math.floor(timeUntilExpiry / 60);
      const seconds = timeUntilExpiry % 60;

      return badRequestResponse(
        res,
        `OTP hiện tại vẫn còn hiệu lực trong ${minutes} phút ${seconds} giây. Vui lòng kiểm tra email hoặc đợi hết hạn.`,
        {
          currentOTPExpiresAt: user.emailVerificationOTPExpires,
          timeUntilExpirySeconds: timeUntilExpiry,
          canResendAt: user.emailVerificationOTPExpires,
        },
      );
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes expiry

    // Update user with new OTP and track request time
    user.emailVerificationOTP = otp;
    user.emailVerificationOTPExpires = otpExpires;
    user.lastOTPRequestAt = now;
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    await user.save();

    // Send OTP email
    try {
      await sendRegistrationOTPEmail(email, user.fullName, otp);
    } catch (emailError) {
      console.error("Failed to resend OTP email:", emailError);

      // Reset OTP request time on email failure to allow retry
      user.lastOTPRequestAt = null;
      await user.save();

      await logSecurityEvent("OTP_RESEND_FAILED", {
        userId: user._id,
        email: user.email,
        error: emailError.message,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return errorResponse(
        res,
        "Gửi lại OTP thất bại. Vui lòng thử lại sau.",
        emailError.message,
      );
    }

    // Log successful resend
    await logSecurityEvent("OTP_RESEND_SUCCESS", {
      userId: user._id,
      email: user.email,
      otpRequestCount: user.otpRequestCount,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    successResponse(res, "Gửi lại OTP thành công", {
      message:
        "Mã OTP mới đã được gửi đến email của bạn. Mã OTP có hiệu lực trong 2 phút.",
      otpExpiresIn: 120, // seconds
      canResendAt: new Date(now.getTime() + 2 * 60 * 1000),
      nextResendWaitTime: 120, // seconds
      requestCount: user.otpRequestCount,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    await logSecurityEvent("OTP_RESEND_FAILED", {
      email: req.body.email,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Gửi lại OTP thất bại", error.message);
  }
});

export const updateFCMToken = expressAsyncHandler(async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user._id;

    if (!fcmToken) {
      return badRequestResponse(res, "Vui lòng nhập FCM token");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true },
    ).select("-password");

    if (!user) {
      return unauthorizedResponse(res, "Người dùng không tồn tại");
    }

    await logSecurityEvent("FCM_TOKEN_UPDATED", {
      userId: user._id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    return successResponse(res, "Cập nhật FCM token thành công", {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        fcmToken: user.fcmToken,
      },
    });
  } catch (error) {
    console.error("Update FCM token error:", error);
    await logSecurityEvent("FCM_TOKEN_UPDATE_FAILED", {
      userId: req.user?.id,
      error: error.message,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    errorResponse(res, "Cập nhật FCM token thất bại", error.message);
  }
});
