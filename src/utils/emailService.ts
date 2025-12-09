import nodemailer from 'nodemailer';

const getTransporter = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_APP_PASSWORD;

  if (!emailUser || !emailPass) {
    throw new Error('Email credentials are not configured');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });
};

interface SendEmailOptions {
  to?: string;
  bcc?: string[];
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, bcc, subject, html }: SendEmailOptions) => {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `"StockBuddy" <${process.env.EMAIL_USER}>`,
      to: to || process.env.EMAIL_USER,
      bcc,
      subject,
      html
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, otp: string, userName: string) => {
  const html = `
    <h2>Password Reset Request</h2>
    <p>Hello ${userName},</p>
    <p>Use the One-Time Passcode (OTP) below to reset your StockBuddy password:</p>
    <div style="font-size: 24px; letter-spacing: 4px; font-weight: bold; margin: 16px 0;">${otp}</div>
    <p>This code will expire in 10 minutes.</p>
    <p>If you didn't request this, you can ignore this email.</p>
  `;

  return sendEmail({
    to: email,
    subject: 'StockBuddy – Password Reset OTP',
    html
  });
};