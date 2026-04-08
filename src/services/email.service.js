import nodemailer from "nodemailer";
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Cấu hình transporter cho Nodemailer (dùng Gmail)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Helper function to read and replace template variables
const loadTemplate = async (templatePath, replacements = {}) => {
  try {
    console.log('Loading template from:', templatePath);
    let template = await fs.readFile(templatePath, "utf-8");

    // Replace all {{variable}} placeholders
    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, replacements[key]);
    });

    return template;
  } catch (error) {
    console.error(`Error loading template from ${templatePath}:`, error);
    // Return a basic HTML template as fallback
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Xác thực OTP</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; }
          .otp { font-size: 24px; font-weight: bold; color: #007bff; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Xác thực tài khoản</h2>
          <p>Mã OTP của bạn là: <span class="otp">${replacements.otp || 'XXXXXX'}</span></p>
          <p>Mã có hiệu lực trong 2 phút.</p>
        </div>
      </body>
      </html>
    `;
  }
};

const sendOTPEmail = async (email, otp) => {
  try {
    const templatePath = path.join(__dirname, "../view/otp_view.html");

    const htmlContent = await loadTemplate(templatePath, {
      otp: otp,
      email: email
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: "OTP Đặt lại mật khẩu",
      html: htmlContent,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return reject(error);
        }
        resolve(info);
      });
    });
  } catch (error) {
    console.error('Error in sendOTPEmail:', error);
    throw error;
  }
};

const sendMessageEmail = (to, subject, message) => {
  const mailOptions = {
    from: process.env.MAIL_USER,
    to,
    subject,
    text: message,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return reject(error);
      }
      resolve(info);
    });
  });
};

const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:8080/api/auth'}/verify-email/${verificationToken}`;
    const templatePath = path.join(__dirname, "../templates/emails/verify-account.html");

    const htmlContent = await loadTemplate(templatePath, {
      verificationLink: verificationUrl
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: "Xác thực email của bạn",
      html: htmlContent,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return reject(error);
        }
        resolve(info);
      });
    });
  } catch (error) {
    console.error('Error in sendVerificationEmail:', error);
    throw error;
  }
};

const sendRegistrationOTPEmail = async (email, fullName, otp) => {
  try {
    // Use path from project root
    const templatePath = path.join(process.cwd(), "src/templates/emails/register-otp.html");

    const htmlContent = await loadTemplate(templatePath, {
      otp: otp,
      fullName: fullName,
      email: email
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: "Xác thực đăng ký tài khoản KTX",
      html: htmlContent,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return reject(error);
        }
        resolve(info);
      });
    });
  } catch (error) {
    console.error('Error in sendRegistrationOTPEmail:', error);
    throw error;
  }
};

const sendResetPasswordEmail = async (email, resetToken) => {
  try {
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:8080/api/auth'}/reset-password/${resetToken}`;
    const templatePath = path.join(__dirname, "../templates/emails/reset-password.html");

    const htmlContent = await loadTemplate(templatePath, {
      resetLink: resetUrl
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: "Đặt lại mật khẩu",
      html: htmlContent,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return reject(error);
        }
        resolve(info);
      });
    });
  } catch (error) {
    console.error('Error in sendResetPasswordEmail:', error);
    throw error;
  }
};

const sendRegistrationReviewEmail = async (email, fullName, approved, payload = {}) => {
  const subject = approved
    ? '[KTX] Đơn đăng ký nội trú được duyệt'
    : '[KTX] Đơn đăng ký nội trú không được duyệt';
  const greeting = fullName ? `Xin chào ${fullName},` : 'Xin chào,';
  const body = approved
    ? `${greeting}\n\nĐơn đăng ký ký túc xá của bạn đã được phê duyệt.${payload.reviewNotes ? `\n\nGhi chú: ${payload.reviewNotes}` : ''}\n\nMã hồ sơ: ${payload.registrationCode || ''}\n\nVui lòng mở ứng dụng để xem chi tiết và các bước tiếp theo.`
    : `${greeting}\n\nRất tiếc, đơn đăng ký ký túc xá của bạn chưa được duyệt.${payload.rejectionReason ? `\n\nLý do: ${payload.rejectionReason}` : ''}\n\nMã hồ sơ: ${payload.registrationCode || ''}\n\nVui lòng mở ứng dụng để biết thêm chi tiết.`;
  return sendMessageEmail(email, subject, body.trim());
};

export {
  sendOTPEmail,
  sendMessageEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendRegistrationOTPEmail,
  sendRegistrationReviewEmail,
};
