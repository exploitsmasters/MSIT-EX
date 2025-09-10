const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Full fs module with sync methods
const fsPromises = require('fs').promises; // Optional: keep promises if needed elsewhere
const crypto = require('crypto');
const QRCode = require('qrcode');
const base64 = require('base64-js');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const SignedXml = require('xml-crypto').SignedXml;
const { CanonicalXml } = require('xml-crypto'); // Assuming this is available from your backend
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch').default;
const { PrismaClient } = require('@prisma/client');
require('dotenv').config(); // Load environment variables
const prisma = new PrismaClient();
const forge = require('node-forge');
const xpath = require('xpath');
const { execSync } = require('child_process');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const jsrsasign = require('jsrsasign');
const puppeteer = require('puppeteer');
const { generateArabicPDF } = require('./routes/generate-pdf-arabic');
const { generateEnglishPDF } = require('./routes/generate-pdf-english');
const { generateArabicInvoicePDF } = require('./routes/generate-invoice-arabic');
const { generateInstallationsInvoicePDF } = require('./routes/generate-installations-invoice');
const projectRoutes = require('./routes/projects');



const allowedOrigins = [
  'http://localhost:5173',
  'http://192.168.100.3:5173',
  'https://24e4787a254e.ngrok-free.app'
];



// const { generateEnglishInvoicePDF } = require('./routes/generate-invoice-english');


// const signInvoice = require('./routes/signInvoice');
// XML parsing utilities
const parser = new xml2js.Parser({ explicitArray: false });
const builder = new xml2js.Builder({ xmldec: { version: '1.0', encoding: 'UTF-8' } });

// Utility function to format dates to ZATCA's required format (YYYY-MM-DD)
function formatZatcaDate(date) {
  if (!date) {
    throw new Error('Invalid date provided for formatting');
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date format');
  }
  return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

function formatZatcaTime(date) {
  if (!date) {
    throw new Error('Invalid date provided for formatting');
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date format');
  }
  return d.toISOString().split('T')[1].split('.')[0]; // Returns HH:MM:SS
}

// Utility function to format time to ZATCA's required format (HH:MM:SS)
function formatZatcaTime(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[1].split('.')[0]; // e.g., "14:30:00"
}

dotenv.config();
process.env.LANG = 'en_US.UTF-8';
// Initialize express app
const app = express();
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts'))); // Serve font files statically
// Health check endpoint with MySQL verification
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1'); // Test MySQL connection
    res.json({ status: 'ok', timestamp: new Date().toISOString(), services: { mysql: 'connected' } });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', message: 'MySQL connection failed' });
  }
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  next();
});

// Mount routes
app.use('/api/zatca', signInvoice); // Mount signInvoice at /api/zatca
app.use('/api', projectRoutes); // Mount projects routes


// Configure multer for file upload with strict type validation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    
    // Create directory synchronously if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename but keep the extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const generatedName = uniqueSuffix + extension;
    cb(null, generatedName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. النوعات المسموح بها: JPEG, PNG, WEBP, PDF'), false);
    }
  },
});

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Password validation
const validatePassword = (password) => {
  const minLength = 8;
  const maxLength = 50;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[@$!%*?&]/.test(password);

  if (password.length < minLength)
    return 'يجب أن تكون كلمة المرور 8 أحرف على الأقل';
  if (password.length > maxLength)
    return 'يجب أن لا تتجاوز كلمة المرور 50 حرفًا';
  if (!hasUpperCase)
    return 'يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل';
  if (!hasLowerCase)
    return 'يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل';
  if (!hasNumbers) return 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل';
  if (!hasSpecialChar)
    return 'يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل (@$!%*?&)';

  return null;
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'غير مصرح لك بالوصول' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded JWT:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'الرمز غير صالح', details: error.message });
  }
};


// Arabic Quotation PDF generation endpoint
app.post('/api/generate-pdf', authenticateToken, generateArabicPDF);

// English Quotation PDF generation endpoint
app.post('/api/generate-pdf-english', authenticateToken, generateEnglishPDF);

// Arabic Invoice PDF generation endpoint
app.post('/api/generate-invoicePDF-ar', authenticateToken, generateArabicInvoicePDF)

// Generate installations invoice PDF
app.post('/api/installations/generate-invoice', authenticateToken, generateInstallationsInvoicePDF);

// English Invoice PDF generation endpoint
// app.post('/api/generate-invoicePDF-en', authenticateToken, generateEnglishInvoicePDF)


// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { companyName, username, email, password, phone } = req.body;

    // Validate input
    if (!companyName || !username || !email || !password || !phone) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    // Validate username
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'يجب أن يكون اسم المستخدم بين 3 و50 حرفًا' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي فقط على حروف وأرقام وشرطة سفلية' });
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Check if email, username, or phone already exists
    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ? OR username = ? OR phone = ?',
      [email, username, phone]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني أو اسم المستخدم أو رقم الجوال مسجل بالفعل' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const verificationExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes

    // Create user
    const [result] = await connection.execute(
      `INSERT INTO users (company_name, username, email, password, phone, verification_code, verification_expiry) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        companyName,
        username,
        email,
        hashedPassword,
        phone,
        verificationCode,
        verificationExpiry,
      ]
    );

    // Send verification email
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'تأكيد البريد الإلكتروني',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>مرحباً بك في نظام الفواتير الإلكترونية</h2>
          <p>رمز التحقق الخاص بك هو: <strong>${verificationCode}</strong></p>
          <p>هذا الرمز صالح لمدة 30 دقيقة فقط.</p>
        </div>
      `,
    });

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      email,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'فشل في إنشاء الحساب' });
  } finally {
    connection.release();
  }
});

// Check email availability
app.post('/api/auth/check-email', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }

    // Validate email format
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(email.trim().toLowerCase())) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    res.json({ exists: existing.length > 0 });
  } catch (error) {
    console.error('Email check error:', error);
    res.status(500).json({ error: 'فشل في التحقق من البريد الإلكتروني' });
  } finally {
    connection.release();
  }
});

// Check username availability
app.post('/api/auth/check-username', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }

    // Validate username format
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'يجب أن يكون اسم المستخدم بين 3 و50 حرفًا' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي فقط على حروف وأرقام وشرطة سفلية' });
    }

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username.trim()]
    );

    res.json({ exists: existing.length > 0 });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'فشل في التحقق من اسم المستخدم' });
  } finally {
    connection.release();
  }
});

// Check phone availability
app.post('/api/auth/check-phone', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'رقم الجوال مطلوب' });
    }

    // Validate Saudi phone number format (starts with 05, 10 digits)
    const phonePattern = /^(05)(5|0|3|6|4|9|1|8|7)([0-9]{7})$/;
    if (!phonePattern.test(phone.trim())) {
      return res.status(400).json({ error: 'رقم الجوال غير صالح، يجب أن يبدأ بـ 05 ويتكون من 10 أرقام' });
    }

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE phone = ?',
      [phone.trim()]
    );

    res.json({ exists: existing.length > 0 });
  } catch (error) {
    console.error('Phone check error:', error);
    res.status(500).json({ error: 'فشل في التحقق من رقم الجوال' });
  } finally {
    connection.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('📱 Login request from phone:', req.body);
  const connection = await pool.getConnection();
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    // Get user
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const user = users[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    // Check if email is verified
    if (!user.is_verified) {
      // Generate new verification code if expired
      if (
        !user.verification_expiry ||
        new Date() > new Date(user.verification_expiry)
      ) {
        const verificationCode = Math.floor(
          100000 + Math.random() * 900000
        ).toString();
        const verificationExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes

        await connection.execute(
          'UPDATE users SET verification_code = ?, verification_expiry = ? WHERE id = ?',
          [verificationCode, verificationExpiry, user.id]
        );

        // Send new verification email
        const transporter = nodemailer.createTransport({
          host: 'smtp.hostinger.com',
          port: 465,
          secure: true,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'تأكيد البريد الإلكتروني',
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif;">
              <h2>مرحباً بك في نظام الفواتير الإلكترونية</h2>
              <p>رمز التحقق الخاص بك هو: <strong>${verificationCode}</strong></p>
              <p>هذا الرمز صالح لمدة 30 دقيقة فقط.</p>
            </div>
          `,
        });
      }

      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.company_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'فشل تسجيل الدخول' });
  } finally {
    connection.release();
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { email, code } = req.body;

    // Get user
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const user = users[0];

    // Check if code is valid and not expired
    if (
      user.verification_code !== code ||
      !user.verification_expiry ||
      new Date() > new Date(user.verification_expiry)
    ) {
      return res
        .status(400)
        .json({ error: 'رمز التحقق غير صالح أو منتهي الصلاحية' });
    }

    // Mark email as verified
    await connection.execute(
      'UPDATE users SET is_verified = true, verification_code = NULL, verification_expiry = NULL WHERE id = ?',
      [user.id]
    );

    res.json({ message: 'تم تأكيد البريد الإلكتروني بنجاح' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'فشل التحقق من الرمز' });
  } finally {
    connection.release();
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { email } = req.body;

    // Get user
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const user = users[0];

    // Generate new verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const verificationExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes

    await connection.execute(
      'UPDATE users SET verification_code = ?, verification_expiry = ? WHERE id = ?',
      [verificationCode, verificationExpiry, user.id]
    );

    // Send verification email
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'تأكيد البريد الإلكتروني',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>مرحباً بك في نظام الفواتير الإلكترونية</h2>
          <p>رمز التحقق الخاص بك هو: <strong>${verificationCode}</strong></p>
          <p>هذا الرمز صالح لمدة 30 دقيقة فقط.</p>
        </div>
      `,
    });

    res.json({ message: 'تم إرسال رمز التحقق بنجاح' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'فشل إرسال رمز التحقق' });
  } finally {
    connection.release();
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [
      email,
    ]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'البريد الإلكتروني غير مسجل' });
    }

    // Generate reset token and expiry
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save reset token in the database
    await pool.execute(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
      [resetToken, resetTokenExpiry, email]
    );

    // Define transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const mailOptions = {
      from: `"MSIT Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'إعادة تعيين كلمة المرور - نظام الفواتير الإلكترونية',
      html: `
        <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
        <p>يرجى النقر على الرابط أدناه لإعادة تعيين كلمة المرور:</p>
        <a href="${resetUrl}">إعادة تعيين كلمة المرور</a>
        <p>ينتهي هذا الرابط خلال ساعة واحدة.</p>
        <p>إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.</p>
      `,
    };
    await transporter.sendMail(mailOptions);

    // Respond to client
    res.json({
      message: 'تم إرسال تعليمات إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res
      .status(500)
      .json({ error: 'فشل في إرسال تعليمات إعادة تعيين كلمة المرور' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const [users] = await pool.execute(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({
        error: 'رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.execute(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?',
      [hashedPassword, token]
    );

    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'فشل في إعادة تعيين كلمة المرور' });
  }
});

// Utility function to sanitize input for OpenSSL
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  // Allow Arabic, alphanumeric, spaces, and basic punctuation
  return input.replace(/[^a-zA-Z0-9\s\u0600-\u06FF.-]/g, '').trim();
}

// Generate CSR endpoint
app.post('/api/zatca/generate-csr', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  let tempDir = null;
  try {
    const { company_name, tax_register, city } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!company_name || !tax_register || !city) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة: اسم الشركة، رقم التسجيل الضريبي، المدينة' });
    }
    if (tax_register.length !== 15 || !/^\d{15}$/.test(tax_register)) {
      return res.status(400).json({ error: 'رقم التسجيل الضريبي يجب أن يكون 15 رقمًا' });
    }

    // Sanitize inputs
    const safeCompanyName = sanitizeInput(company_name);
    const safeTaxRegister = sanitizeInput(tax_register);
    const safeCity = sanitizeInput(city);

    // Create temporary directory
    tempDir = path.join('E:', 'a', 'project', 'server', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Write csr_config.conf with minimal extensions
    const configContent = `
oid_section = OIDS

[ OIDS ]
certificateTemplateName = 1.3.6.1.4.1.311.20.2

[ req ]
default_bits     = 256
emailAddress     = support@msit.com.sa
prompt           = no
default_md       = sha256
req_extensions   = v3_req
distinguished_name = dn

[ dn ]
C=SA
OU=${safeCity}
O=${safeCompanyName}
CN=TST-${safeTaxRegister}

[ v3_req ]
certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing
subjectAltName = dirName:alt_names

[ alt_names ]
SN=1-TST|2-TST|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f
UID=${safeTaxRegister}
title=0100
registeredAddress=RRRD2929
businessCategory=Supply activities
`;
    const configPath = path.join(tempDir, 'csr_config.conf');
    fs.writeFileSync(configPath, configContent, { encoding: 'utf8' });

    // Generate private key
    const privateKeyPath = path.join(tempDir, 'ec-secp256k1-priv-key.pem');
    execSync(`openssl ecparam -name secp256k1 -genkey -noout -out "${privateKeyPath}"`, {
      stdio: 'inherit',
      encoding: 'utf8',
    });

    // Generate CSR
    const csrPath = path.join(tempDir, 'taxpayer.csr');
    execSync(
      `openssl req -new -sha256 -key "${privateKeyPath}" -config "${configPath}" -extensions v3_req -out "${csrPath}" -utf8`,
      { stdio: 'inherit', encoding: 'utf8' }
    );

    // Generate Base64 private key
    const privateKeyDerPath = path.join(tempDir, 'privateKey.der');
    execSync(
      `openssl ec -in "${privateKeyPath}" -outform der -out "${privateKeyDerPath}"`,
      { stdio: 'inherit', encoding: 'utf8' }
    );
    const derBuffer = fs.readFileSync(privateKeyDerPath);
    const rawKey = derBuffer.slice(7, 39);
    const base64PrivateKey = rawKey.toString('base64');

    // Verify Base64 key length
    if (base64PrivateKey.length !== 44) {
      throw new Error(`Base64 private key length is ${base64PrivateKey.length}, expected 44`);
    }

    // Generate and read public key
    const publicKeyPath = path.join(tempDir, 'PublicKey.pem');
    execSync(
      `openssl ec -in "${privateKeyPath}" -pubout -out "${publicKeyPath}"`,
      { stdio: 'inherit', encoding: 'utf8' }
    );
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    // Read CSR and private key
    const csr = fs.readFileSync(csrPath, 'utf8');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Store in database
    await connection.execute(
      `UPDATE users 
       SET zatca_private_key = ?, zatca_csr = ?, zatca_base64_private_key = ?, zatca_public_key = ?
       WHERE id = ?`,
      [privateKey, csr, base64PrivateKey, publicKey, userId]
    );

    // Clean up
    // if (tempDir && fs.existsSync(tempDir)) {
    //   fs.rmSync(tempDir, { recursive: true, force: true });
    // }

    res.json({
      success: true,
      csr,
      base64PrivateKey,
      publicKey,
      message: 'تم إنشاء CSR بنجاح',
    });
  } catch (error) {
    console.error('CSR Generation Error:', error);
    res.status(500).json({ error: 'فشل في إنشاء CSR: ' + error.message });
  } finally {
    // if (tempDir && fs.existsSync(tempDir)) {
    //   fs.rmSync(tempDir, { recursive: true, force: true });
    // }
    connection.release();
  }
});

// GET private key and public key Endpoint (unchanged)
app.get('/api/zatca/get-keys', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT zatca_base64_private_key, zatca_public_key FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows[0]?.zatca_base64_private_key || rows[0]?.zatca_public_key) {
      res.json({
        base64PrivateKey: rows[0].zatca_base64_private_key || '',
        publicKey: rows[0].zatca_public_key || '',
      });
    } else {
      res.status(404).json({ error: 'لم يتم العثور على مفاتيح' });
    }
  } catch (error) {
    res.status(500).json({ error: 'فشل في استرجاع المفاتيح' });
  } finally {
    connection.release();
  }
});

// Function to encode TLV
function encodeTLV(tag, value) {
  const valueBytes = Buffer.from(value, 'utf-8');
  return Buffer.concat([Buffer.from([tag, valueBytes.length]), valueBytes]);
}

// API endpoint to generate ZATCA QR Code
app.post('/generate-qr', async (req, res) => {
  try {
    const { sellerName, vatNumber, invoiceDate, totalAmount, vatAmount } =
      req.body;

    // Encode data in TLV format
    const tlvBuffer = Buffer.concat([
      encodeTLV(1, sellerName),
      encodeTLV(2, vatNumber),
      encodeTLV(3, invoiceDate),
      encodeTLV(4, totalAmount),
      encodeTLV(5, vatAmount),
    ]);

    // Convert to Base64
    const base64Data = base64.fromByteArray(tlvBuffer);

    // Generate QR Code
    const qrCode = await QRCode.toDataURL(base64Data);

    res.json({ qrCode });
  } catch (error) {
    res.status(500).json({ error: 'Error generating QR Code' });
  }
});

// Utility function to send request to ZATCA API
async function sendZatcaApiRequest(url, method, headers, body) {
  try {
    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const data = await response.text(); // Get raw response as text
    const statusCode = response.status;
    const responseTime = Date.now(); // Simple timestamp for response time
    
    return {
      status: statusCode,
      data: data,
      responseTime: responseTime,
    };
  } catch (error) {
    throw new Error(`ZATCA API request failed: ${error.message}`);
  }
}

// New endpoint for ZATCA API testing
app.post('/api/zatca/test-api', authenticateToken, async (req, res) => {
  try {
    const { url, method, headers, body } = req.body;

    // Validate input
    if (!url || !method) {
      return res.status(400).json({ error: 'URL and method are required' });
    }

    // Validate method
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!allowedMethods.includes(method.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid HTTP method' });
    }

    // Prepare headers
    const requestHeaders = {};
    if (Array.isArray(headers)) {
      headers.forEach(header => {
        if (header.key && header.value) {
          requestHeaders[header.key] = header.value;
        }
      });
    }

    // Parse body if provided
    let requestBody = null;
    if (body && typeof body === 'string' && body.trim()) {
      try {
        requestBody = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    // Send request to ZATCA API
    const response = await sendZatcaApiRequest(url, method.toUpperCase(), requestHeaders, requestBody);

    // Return response to client
    res.json({
      status: response.status,
      data: response.data,
      responseTime: response.responseTime,
    });
  } catch (error) {
    console.error('ZATCA API Test Error:', error);
    res.status(500).json({ error: error.message || 'Failed to test ZATCA API' });
  }
});

// Function to generate a simple QR code string (for demonstration purposes)
function generateTLVQRCode(invoice, company, totalWithVat, vatAmount, rawInvoiceHash) {
  // Input validation
  if (!company.name || typeof company.name !== 'string' || company.name.trim() === '') {
    throw new Error('Seller’s Name (Tag 1) must be a non-empty string');
  }
  if (!company.vat_number || !/^\d{15}$/.test(company.vat_number)) {
    throw new Error('VAT Number (Tag 2) must be a 15-digit string');
  }
  if (!(invoice.issue_date instanceof Date) || isNaN(invoice.issue_date)) {
    throw new Error('Issue Date must be a valid Date object');
  }
  if (typeof totalWithVat !== 'number' || isNaN(totalWithVat)) {
    throw new Error('Total with VAT (Tag 4) must be a valid number');
  }
  if (typeof vatAmount !== 'number' || isNaN(vatAmount)) {
    throw new Error('VAT Amount (Tag 5) must be a valid number');
  }
  if (!Buffer.isBuffer(rawInvoiceHash) || rawInvoiceHash.length !== 32) {
    throw new Error('Invoice Hash (Tag 6) must be a 32-byte Buffer');
  }

  const sellerName = company.name;
  const vatNumber = company.vat_number;

  // Format the timestamp to ensure seconds are included
  let timestamp = invoice.issue_date.toISOString().split('.')[0] + 'Z'; // e.g., 2025-03-18T22:00:00Z
  const timeParts = timestamp.split('T')[1].split(':');
  if (timeParts.length === 2 || !timeParts[1].includes(':')) {
    timestamp = `${timestamp.slice(0, -1)}:00Z`; // Append :00 if seconds are missing
  }

  const total = totalWithVat.toFixed(2); // e.g., "677.35"
  const vat = vatAmount.toFixed(2); // e.g., "88.35"

  const tlvData = [
    { tag: 1, value: sellerName, isBuffer: false },
    { tag: 2, value: vatNumber, isBuffer: false },
    { tag: 3, value: timestamp, isBuffer: false },
    { tag: 4, value: total, isBuffer: false },
    { tag: 5, value: vat, isBuffer: false },
    { tag: 6, value: rawInvoiceHash, isBuffer: true },
  ].map(({ tag, value, isBuffer }) => {
    const valueBuffer = isBuffer ? value : Buffer.from(value, 'utf-8');
    const length = valueBuffer.length; // Correct length calculation
    return Buffer.concat([
      Buffer.from([tag, length]),
      valueBuffer,
    ]);
  });

  const qrCodeBinary = Buffer.concat(tlvData);
  const qrCodeBase64 = qrCodeBinary.toString('base64');

  // Check Base64 string length
  if (qrCodeBase64.length > 500) {
    throw new Error(`QR Code Base64 string exceeds 500 characters: ${qrCodeBase64.length}`);
  }

  console.log('Generated QR Code (Base64):', qrCodeBase64);
  console.log('QR Code Length:', qrCodeBase64.length);

  return qrCodeBase64;
}

//Function to canonicalize XML and calculate hash
// function calculateInvoiceHash(xml) {
//   if (!xml || typeof xml !== 'string') {
//     throw new Error('Invalid XML data for hashing');
//   }

//   xml = xml.trim();

//   return new Promise((resolve, reject) => {
//     try {
//       const parser = new DOMParser({
//         errorHandler: {
//           warning: () => {},
//           error: () => {},
//           fatalError: (msg) => { throw new Error(msg); }
//         }
//       });
//       const doc = parser.parseFromString(xml, 'text/xml');

//       if (!doc || doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement || doc.documentElement.nodeName !== 'Invoice') {
//         return reject(new Error('Invalid XML: Failed to parse XML document'));
//       }

//       // Function to remove nodes based on XPath
//       const removeElements = (doc, xpathExpr) => {
//         const select = xpath.useNamespaces({
//           ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
//           cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
//           cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
//         });
//         const nodes = select(xpathExpr, doc);
//         nodes.forEach(node => {
//           if (node && node.parentNode) {
//             node.parentNode.removeChild(node);
//           }
//         });
//       };

//       // Apply ZATCA-required exclusions
//       removeElements(doc, "//ext:UBLExtensions");
//       removeElements(doc, "//cac:Signature");
//       removeElements(doc, "//cac:AdditionalDocumentReference[cbc:ID='QR']");

//       // Serialize to canonical form
//       const serializer = new XMLSerializer();
//       const canonicalizedXml = serializer.serializeToString(doc);

//       if (!canonicalizedXml) {
//         throw new Error('Canonicalization failed: No output generated');
//       }

//       const hash = crypto.createHash('sha256').update(canonicalizedXml).digest('base64');
//       resolve(hash);
//     } catch (err) {
//       reject(new Error('Failed to process XML for hashing: ' + err.message));
//     }
//   });
// }

function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate CSR and private key
async function generateCSR(userData) {
  const { company_name, tax_register, city } = userData;
  let tempDir = null;
  try {
    // Sanitize inputs
    const safeCompanyName = sanitizeInput(company_name);
    const safeTaxRegister = sanitizeInput(tax_register);
    const safeCity = sanitizeInput(city);

    // Create temporary directory
    tempDir = path.join(__dirname, 'temp', `csr_${Date.now()}_${uuidv4()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Write csr_config.conf with ZATCA-specific extensions
    const configContent = `
oid_section = OIDS

[ OIDS ]
certificateTemplateName = 1.3.6.1.4.1.311.20.2

[ req ]
default_bits     = 256
emailAddress     = support@msit.com.sa
prompt           = no
default_md       = sha256
req_extensions   = v3_req
distinguished_name = dn

[ dn ]
C=SA
OU=${safeCity}
O=${safeCompanyName}
CN=TST-${safeTaxRegister}

[ v3_req ]
certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing
subjectAltName = dirName:alt_names

[ alt_names ]
SN=1-TST|2-TST|3-${uuidv4()}
UID=${safeTaxRegister}
title=0100
registeredAddress=RRRD2929
businessCategory=Supply activities
`;
    const configPath = path.join(tempDir, 'csr_config.conf');
    fs.writeFileSync(configPath, configContent, { encoding: 'utf8' });

    // Generate private key (EC secp256k1)
    const privateKeyPath = path.join(tempDir, 'privateKey.pem');
    execSync(`openssl ecparam -name secp256k1 -genkey -noout -out "${privateKeyPath}"`, {
      stdio: 'inherit',
      encoding: 'utf8',
    });

    // Process private key: Remove headers, format as single-line Base64, save to Certificates
    const privateKeyContent = fs.readFileSync(privateKeyPath, 'utf8');
    // Remove PEM headers and all line breaks (handles \n and \r\n)
    const base64KeyContent = privateKeyContent
      .replace(/-----BEGIN EC PRIVATE KEY-----[\r\n]*/, '')
      .replace(/-----END EC PRIVATE KEY-----[\r\n]*/, '')
      .replace(/[\r\n]+/g, '')
      .trim();
    // Log to verify single-line content
    console.log('Processed Base64 private key:', base64KeyContent);
    // Save to ec-secp256k1-priv-key.pem
    const outputKeyPath = path.join(
      'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates',
      'ec-secp256k1-priv-key.pem'
    );
    try {
      fs.writeFileSync(outputKeyPath, base64KeyContent, 'utf8');
      console.log(`Successfully saved processed private key to ${outputKeyPath}`);
    } catch (error) {
      console.error('Error saving ec-secp256k1-priv-key.pem:', error);
      throw new Error(`Failed to save ec-secp256k1-priv-key.pem: ${error.message}`);
    }

    // Generate CSR
    const csrPath = path.join(tempDir, 'taxpayer.csr');
    execSync(
      `openssl req -new -sha256 -key "${privateKeyPath}" -config "${configPath}" -extensions v3_req -out "${csrPath}" -utf8`,
      { stdio: 'inherit', encoding: 'utf8' }
    );

    // Generate Base64 private key
    const privateKeyDerPath = path.join(tempDir, 'privateKey.der');
    execSync(
      `openssl ec -in "${privateKeyPath}" -outform der -out "${privateKeyDerPath}"`,
      { stdio: 'inherit', encoding: 'utf8' }
    );
    const derBuffer = fs.readFileSync(privateKeyDerPath);
    const rawKey = derBuffer.slice(7, 39);
    const base64PrivateKey = rawKey.toString('base64');

    // Verify Base64 key length
    if (base64PrivateKey.length !== 44) {
      throw new Error(`Base64 private key length is ${base64PrivateKey.length}, expected 44`);
    }

    // Generate and read public key
    const publicKeyPath = path.join(tempDir, 'PublicKey.pem');
    execSync(
      `openssl ec -in "${privateKeyPath}" -pubout -out "${publicKeyPath}"`,
      { stdio: 'inherit', encoding: 'utf8' }
    );
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    // Read CSR and private key
    const csr = fs.readFileSync(csrPath, 'utf8');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    return { privateKey, publicKey, csr, base64PrivateKey };
  } catch (error) {
    console.error('CSR Generation Error:', error);
    throw new Error(`Failed to generate CSR: ${error.message}`);
  } finally {
    // if (tempDir && fs.existsSync(tempDir)) {
    //   fs.rmSync(tempDir, { recursive: true, force: true });
    // }
  }
}

app.post('/api/zatca/check-compliance', authenticateToken, async (req, res) => {
  const { invoiceType } = req.body;
  const userId = req.user.id;
  const connection = await pool.getConnection();
  try {
    const [users] = await connection.execute(
      'SELECT company_name, tax_register, city, street_name, building_number, neighborhood_name, postal_code, zatca_private_key, zatca_ccsid_bstoken, zatca_ccsid_secret FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) throw new Error('User not found');
    const user = users[0];

    const invoice = {
      invoice_number: `TEST-${Date.now()}-${invoiceType}`,
      uuid: uuidv4(),
      icv: '1',
      seller: {
        name: user.company_name,
        vat_number: user.tax_register,
        street_name: user.street_name || 'Test Street',
        building_number: user.building_number || '1234',
        neighborhood_name: user.neighborhood_name || 'Test Neighborhood',
        city: user.city || 'Riyadh',
        postal_code: user.postal_code || '12345',
        cr_number: '1010010000',
      },
      company: {
        name: 'Test Buyer',
        vat_number: '300000000000001',
        street_name: 'Test Street',
        building_number: '1234',
        neighborhood_name: 'Test Neighborhood',
        city: 'Riyadh',
        postal_code: '12345',
      },
    };
    const previousInvoiceHash = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';
    const xml = await generateComplianceInvoiceXML(invoice, invoiceType, previousInvoiceHash);
    if (typeof xml !== 'string' || !xml.startsWith('<?xml')) {
      console.error('Invalid XML generated:', xml);
      throw new Error('Invalid XML generated');
    }
    fs.writeFileSync(`generated_invoice_${invoiceType}.xml`, xml, 'utf8');
    console.log(`Saved unsigned XML to generated_invoice_${invoiceType}.xml`);

    // Sign XML
    if (!user.zatca_ccsid_bstoken || !user.zatca_private_key) {
      throw new Error('Missing certificate or private key for signing');
    }
    const certBody = user.zatca_ccsid_bstoken.replace(/-----(BEGIN|END) CERTIFICATE-----|\n/g, '').trim();
    const { signedXml, invoiceHash } = await signXML(xml, user.zatca_private_key, certBody);
    fs.writeFileSync(`signed_invoice_${invoiceType}.xml`, signedXml, 'utf8');
    console.log(`Saved signed XML to signed_invoice_${invoiceType}.xml`);

    const base64Invoice = Buffer.from(signedXml).toString('base64');

    // Create Authorization header
    const authString = `${user.zatca_ccsid_bstoken}:${user.zatca_ccsid_secret}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
    console.log('Authorization header:', authHeader.substring(0, 50) + '...');

    const response = await fetch(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance/invoices',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Version': 'V2',
          'accept-language': 'en',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          invoiceHash,
          uuid: invoice.uuid,
          invoice: base64Invoice,
        }),
      }
    );
    const data = await response.json();
    if (response.ok) {
      res.json({ isCompliant: true });
    } else {
      res.status(400).json({ error: data.message || data.errors?.join(', ') });
    }
  } catch (error) {
    console.error('Compliance Check Error:', error);
    res.status(500).json({ error: error.message || 'Failed to check compliance' });
  } finally {
    connection.release();
  }
});


async function generateZatcaInvoiceXML(invoice, previousInvoiceHash = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==') {
  // Validate inputs
  if (!invoice.id || typeof invoice.id !== 'string') throw new Error('Invoice ID (UUID) must be a non-empty string');
  if (!(invoice.issue_date instanceof Date) || isNaN(invoice.issue_date)) throw new Error('Issue date must be a valid date');
  
  // Validate supply_date
  let supplyDate;
  if (!invoice.supply_date) {
    throw new Error('Supply date is required');
  } else if (invoice.supply_date instanceof Date && !isNaN(invoice.supply_date)) {
    supplyDate = invoice.supply_date.toISOString().split('T')[0]; // e.g., "2025-04-07"
  } else if (typeof invoice.supply_date === 'string') {
    const parsedDate = new Date(invoice.supply_date);
    if (isNaN(parsedDate)) throw new Error('Supply date must be a valid date string');
    supplyDate = parsedDate.toISOString().split('T')[0]; // e.g., "2025-04-07"
  } else {
    throw new Error('Supply date must be a Date object or valid date string');
  }
  
  // Calculate totals
  const lineExtensionAmount = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const taxExclusiveAmount = lineExtensionAmount;
  const taxAmount = invoice.items.reduce((sum, item) => sum + item.vat_amount, 0);
  const taxInclusiveAmount = taxExclusiveAmount + taxAmount;

  // Get current date and time
  const now = new Date();
    
  // Format issueDate as YYYY-MM-DD
  const issueDate = now.toISOString().split('T')[0]; // e.g., "2025-04-07"

  // Format issueTime as HH:MM:SS (24-hour format)
  const issueTime = now.toTimeString().split(' ')[0]; // e.g., "04:11:42"

  // Escape XML special characters
  function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Unsigned XML without QR code generation
  const xmlWithoutDigest = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
                                   xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
                                   xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
              <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                <ds:Reference Id="invoiceSignedData" URI="">
                  <ds:Transforms>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                  </ds:Transforms>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>DIGEST_VALUE_PLACEHOLDER</ds:DigestValue>
                </ds:Reference>
                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>SIGNATURE_PROPERTIES_DIGEST_PLACEHOLDER</ds:DigestValue>
                </ds:Reference>
              </ds:SignedInfo>
              <ds:SignatureValue>SIGNATURE_VALUE_PLACEHOLDER</ds:SignatureValue>
              <ds:KeyInfo>
                <ds:X509Data>
                  <ds:X509Certificate>CERTIFICATE_PLACEHOLDER</ds:X509Certificate>
                </ds:X509Data>
              </ds:KeyInfo>
              <ds:Object>
                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
                  <xades:SignedProperties Id="xadesSignedProperties">
                    <xades:SignedSignatureProperties>
                      <xades:SigningTime>2024-01-14T10:26:49</xades:SigningTime>
                      <xades:SigningCertificate>
                        <xades:Cert>
                          <xades:CertDigest>
                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                            <ds:DigestValue>CERT_DIGEST_PLACEHOLDER</ds:DigestValue>
                          </xades:CertDigest>
                          <xades:IssuerSerial>
                            <ds:X509IssuerName>ISSUER_NAME_PLACEHOLDER</ds:X509IssuerName>
                            <ds:X509SerialNumber>ISSUER_SERIAL_PLACEHOLDER</ds:X509SerialNumber>
                          </xades:IssuerSerial>
                        </xades:Cert>
                      </xades:SigningCertificate>
                    </xades:SignedSignatureProperties>
                  </xades:SignedProperties>
                </xades:QualifyingProperties>
              </ds:Object>
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoice_number)}</cbc:ID>
  <cbc:UUID>${escapeXml(invoice.uuid)}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${escapeXml(invoice.icv || '1')}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${previousInvoiceHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"></cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(invoice.seller.cr_number || '1010010000')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.seller.street_name || 'Unknown')}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(invoice.seller.building_number || '1234')}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(invoice.seller.neighborhood_name || 'Unknown')}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(invoice.seller.city || 'Riyadh')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(invoice.seller.postal_code || '00000')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.seller.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.company.street_name || 'Unknown')}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(invoice.company.building_number || '1234')}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(invoice.company.neighborhood_name || 'Unknown')}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(invoice.company.city || 'Riyadh')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(invoice.company.postal_code || '00000')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.company.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.company.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery>
        <cbc:ActualDeliveryDate>${supplyDate}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">0.00</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>
      <cbc:Percent>15</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${taxExclusiveAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>
    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="SAR">${taxInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoice.items.map((item, index) => `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${item.quantity.toFixed(6)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${(item.quantity * item.unit_price).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${item.vat_amount.toFixed(2)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="SAR">${((item.quantity * item.unit_price) + item.vat_amount).toFixed(2)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(item.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${(item.vat_rate || 15).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${item.unit_price.toFixed(2)}</cbc:PriceAmount>
        <cac:AllowanceCharge>
          <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
          <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
          <cbc:Amount currencyID="SAR">0.00</cbc:Amount>
        </cac:AllowanceCharge>
      </cac:Price>
    </cac:InvoiceLine>
  `).join('')}
</Invoice>`;

  // Write unsigned XML to a temporary file
  const unsignedFile = 'unsigned-invoice.xml';
  const signedFile = 'signed-invoice.xml';
  fs.writeFileSync(unsignedFile, xmlWithoutDigest);

  // Paths to SDK components (Windows-style)
  const fatooraPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps\\fatoora.bat';
  const keyPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\ec-secp256k1-priv-key.pem';
  const certPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\cert.pem';
  const csrConfigPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Input\\csr-config-example-AR.properties';

  // Set FATOORA_HOME environment variable
  process.env.FATOORA_HOME = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps';

  // Ensure certificates exist, generate if missing
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    try {
      execSync(`"${fatooraPath}" -csr -pem -csrConfig "${csrConfigPath}" -privateKey "${keyPath}" -generatedCsr "tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\cert.csr"`, { stdio: 'inherit' });
      console.warn('Generated new key and CSR. You may need to retrieve cert.pem from ZATCA sandbox using cert.csr.');
    } catch (error) {
      throw new Error(`Failed to generate certificates: ${error.message}`);
    }
  }

  // Sign the XML and generate QR code using fatoora
  try {
    execSync(`"${fatooraPath}" -sign -invoice "${unsignedFile}" -key "${keyPath}" -cert "${certPath}" -signedInvoice "${signedFile}" -qr`, { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to sign XML or generate QR with fatoora: ${error.message}`);
  }

  // Read the signed XML
  const signedXml = fs.readFileSync(signedFile, 'utf8');

  // Compute invoice hash
  const invoiceHash = crypto.createHash('sha256').update(signedXml).digest('base64');

  // Clean up temporary files
  // fs.unlinkSync(unsignedFile);
  // fs.unlinkSync(signedFile);

  return { xml: signedXml, invoiceHash };
}

// // New function for generating minimal compliance check invoices
// async function generateComplianceInvoiceXML(invoice, invoiceType, previousInvoiceHash) {
//   // Validate inputs
//   if (!invoice.uuid || typeof invoice.uuid !== 'string') throw new Error('Invoice UUID must be a non-empty string');
//   if (!invoice.invoice_number || typeof invoice.invoice_number !== 'string') throw new Error('Invoice number must be a non-empty string');
//   if (!invoice.items || !Array.isArray(invoice.items) || invoice.items.length === 0) throw new Error('Invoice must include at least one item');

//   // Enhanced XML escaping
//   function escapeXml(unsafe) {
//     if (unsafe == null || typeof unsafe !== 'string') return '';
//     return unsafe
//       .replace(/&/g, '&amp;')
//       .replace(/</g, '&lt;')
//       .replace(/>/g, '&gt;')
//       .replace(/"/g, '&quot;')
//       .replace(/'/g, '&apos;')
//       .replace(/\|/g, '&#124;')
//       .replace(/[\0-\x1F\x7F]/g, ''); // Remove control characters
//   }

//   // Format number with minimal decimals
//   function formatNumber(num) {
//     const parsed = parseFloat(num || 0);
//     return parsed % 1 === 0 ? parsed.toString() : parsed.toFixed(2).replace(/\.?0+$/, '');
//   }

//   // Generate TLV QR code
//   function generateTLVQR(invoice, timestamp, totalWithTax, taxAmount) {
//     const tags = [
//       { id: 1, value: invoice.seller.name_ar || invoice.seller.name || 'Unknown' },
//       { id: 2, value: invoice.seller.vat_number || '399999999900003' },
//       { id: 3, value: timestamp },
//       { id: 4, value: formatNumber(totalWithTax) },
//       { id: 5, value: formatNumber(taxAmount) },
//     ];
//     let tlv = '';
//     tags.forEach((tag) => {
//       const value = Buffer.from(tag.value, 'utf8');
//       tlv += String.fromCharCode(tag.id) + String.fromCharCode(value.length) + value.toString('binary');
//     });
//     return Buffer.from(tlv, 'binary').toString('base64');
//   }

//   // Map invoice type to UBL code
//   const typeCodeMap = {
//     standard_invoice: '388',
//     standard_debit_note: '381',
//     standard_credit_note: '381',
//     simplified_invoice: '383',
//     simplified_credit_note: '383',
//     simplified_debit_note: '383',
//   };
//   const invoiceTypeCode = typeCodeMap[invoiceType] || '388';

//   // Validate seller and company data
//   const requiredFields = ['name', 'vat_number', 'street_name', 'building_number', 'neighborhood_name', 'city', 'postal_code'];
//   for (const entity of ['seller', 'company']) {
//     for (const field of requiredFields) {
//       if (!invoice[entity][field] || typeof invoice[entity][field] !== 'string') {
//         console.warn(`Invalid ${entity}.${field}: ${invoice[entity][field]}`);
//         invoice[entity][field] = invoice[entity][field] || 'Unknown';
//       }
//     }
//   }

//   // Get current date and time
//   const now = new Date();
//   const issueDate = now.toISOString().split('T')[0]; // e.g., "2025-04-25"
//   const issueTime = now.toTimeString().split(' ')[0]; // e.g., "12:00:00"
//   const timestamp = `${issueDate}T${issueTime}`; // e.g., "2025-04-25T12:00:00"
//   const signingTime = now.toISOString().replace(/\.\d+Z$/, ''); // e.g., "2025-04-25T12:00:00"

//   // Calculate totals
//   const lineExtensionAmount = invoice.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0);
//   const taxExclusiveAmount = lineExtensionAmount;
//   const taxAmount = invoice.items.reduce((sum, item) => sum + (item.vat_amount || 0), 0);
//   const taxInclusiveAmount = taxExclusiveAmount + taxAmount;

//   // Generate QR code
//   const qrCode = generateTLVQR(invoice, timestamp, taxInclusiveAmount, taxAmount);

//   // Generate XML with line numbers for debugging
//   let xmlLines = [];
//   function addLine(line) {
//     xmlLines.push(line);
//   }

// addLine('<?xml version="1.0" encoding="UTF-8"?>');
// addLine('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">');
// addLine('  <ext:UBLExtensions>');
// addLine('    <ext:UBLExtension>');
// addLine('      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>');
// addLine('      <ext:ExtensionContent>');
// addLine('        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">');
// addLine('          <sac:SignatureInformation>');
// addLine('            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>');
// addLine('            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>');
// addLine('            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">');
// addLine('              <ds:SignedInfo>');
// addLine('                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11" />');
// addLine('                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256" />');
// addLine('                <ds:Reference Id="invoiceSignedData" URI="">');
// addLine('                  <ds:Transforms>');
// addLine('                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">');
// addLine('                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>');
// addLine('                    </ds:Transform>');
// addLine('                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">');
// addLine('                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>');
// addLine('                    </ds:Transform>');
// addLine('                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">');
// addLine('                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID=\'QR\'])</ds:XPath>');
// addLine('                    </ds:Transform>');
// addLine('                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11" />');
// addLine('                  </ds:Transforms>');
// addLine('                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />');
// addLine('                  <ds:DigestValue>DIGEST_VALUE_PLACEHOLDER</ds:DigestValue>');
// addLine('                </ds:Reference>');
// addLine('                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">');
// addLine('                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />');
// addLine('                  <ds:DigestValue>SIGNATURE_PROPERTIES_DIGEST_PLACEHOLDER</ds:DigestValue>');
// addLine('                </ds:Reference>');
// addLine('              </ds:SignedInfo>');
// addLine('              <ds:SignatureValue>SIGNATURE_VALUE_PLACEHOLDER</ds:SignatureValue>');
// addLine('              <ds:KeyInfo>');
// addLine('                <ds:X509Data>');
// addLine('                  <ds:X509Certificate>CERTIFICATE_PLACEHOLDER</ds:X509Certificate>');
// addLine('                </ds:X509Data>');
// addLine('              </ds:KeyInfo>');
// addLine('              <ds:Object>');
// addLine('                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">');
// addLine('                  <xades:SignedProperties Id="xadesSignedProperties">');
// addLine('                    <xades:SignedSignatureProperties>');
// addLine('                      <xades:SigningTime>2025-04-25T14:23:10</xades:SigningTime>');
// addLine('                      <xades:SigningCertificate>');
// addLine('                        <xades:Cert>');
// addLine('                          <xades:CertDigest>');
// addLine('                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />');
// addLine('                            <ds:DigestValue>CERT_DIGEST_PLACEHOLDER</ds:DigestValue>');
// addLine('                          </xades:CertDigest>');
// addLine('                          <xades:IssuerSerial>');
// addLine('                            <ds:X509IssuerName>ISSUER_NAME_PLACEHOLDER</ds:X509IssuerName>');
// addLine('                            <ds:X509SerialNumber>ISSUER_SERIAL_PLACEHOLDER</ds:X509SerialNumber>');
// addLine('                          </xades:IssuerSerial>');
// addLine('                        </xades:Cert>');
// addLine('                      </xades:SigningCertificate>');
// addLine('                    </xades:SignedSignatureProperties>');
// addLine('                  </xades:SignedProperties>');
// addLine('                </xades:QualifyingProperties>');
// addLine('              </ds:Object>');
// addLine('            </ds:Signature>');
// addLine('          </sac:SignatureInformation>');
// addLine('        </sig:UBLDocumentSignatures>');
// addLine('      </ext:ExtensionContent>');
// addLine('    </ext:UBLExtension>');
// addLine('  </ext:UBLExtensions>');
// addLine('  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>');
// addLine('  <cbc:ID>SME92329-standard_invoice</cbc:ID>');
// addLine('  <cbc:UUID>acc23ade-6fef-4ef7-82fe-9a4cf835cb75</cbc:UUID>');
// addLine('  <cbc:IssueDate>2025-04-25</cbc:IssueDate>');
// addLine('  <cbc:IssueTime>17:23:10</cbc:IssueTime>');
// addLine('  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
// addLine('  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>');
// addLine('  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>');
// addLine('  <cac:AdditionalDocumentReference>');
// addLine('    <cbc:ID>ICV</cbc:ID>');
// addLine('    <cbc:UUID>1</cbc:UUID>');
// addLine('  </cac:AdditionalDocumentReference>');
// addLine('  <cac:AdditionalDocumentReference>');
// addLine('    <cbc:ID>PIH</cbc:ID>');
// addLine('    <cac:Attachment>');
// addLine('      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==</cbc:EmbeddedDocumentBinaryObject>');
// addLine('    </cac:Attachment>');
// addLine('  </cac:AdditionalDocumentReference>');
// addLine('  <cac:AdditionalDocumentReference>');
// addLine('    <cbc:ID>QR</cbc:ID>');
// addLine('    <cac:Attachment>');
// addLine('      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">AU/YtNix2YPYqSDYqtmI2LHZitivINin2YTYqtmD2YbZiNmE2YjYrNmK2Kcg2KjYo9mC2LXZiSDYs9ix2LnYqSDYp9mE2YXYrdiv2YjYr9ipAg8zOTk5OTk5OTk5MDAwMDMDEzIwMjUtMDQtMjVUMTc6MjM6MTAEAzQuNgUDMC42</cbc:EmbeddedDocumentBinaryObject>');
// addLine('    </cac:Attachment>');
// addLine('  </cac:AdditionalDocumentReference>');
// addLine('  <cac:Signature>');
// addLine('    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>');
// addLine('    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>');
// addLine('  </cac:Signature>');
// addLine('  <cac:AccountingSupplierParty>');
// addLine('    <cac:Party>');
// addLine('      <cac:PartyIdentification>');
// addLine('        <cbc:ID schemeID="CRN">1010010000</cbc:ID>');
// addLine('      </cac:PartyIdentification>');
// addLine('      <cac:PostalAddress>');
// addLine('        <cbc:StreetName>الامير سلطان | Prince Sultan</cbc:StreetName>');
// addLine('        <cbc:BuildingNumber>5354</cbc:BuildingNumber>');
// addLine('        <cbc:CitySubdivisionName>المربع | Al-Murabba</cbc:CitySubdivisionName>');
// addLine('        <cbc:CityName>الرياض | Riyadh</cbc:CityName>');
// addLine('        <cbc:PostalZone>54354</cbc:PostalZone>');
// addLine('        <cac:Country>');
// addLine('          <cbc:IdentificationCode>SA</cbc:IdentificationCode>');
// addLine('        </cac:Country>');
// addLine('      </cac:PostalAddress>');
// addLine('      <cac:PartyTaxScheme>');
// addLine('        <cbc:CompanyID>399999999900003</cbc:CompanyID>');
// addLine('        <cac:TaxScheme>');
// addLine('          <cbc:ID>VAT</cbc:ID>');
// addLine('        </cac:TaxScheme>');
// addLine('      </cac:PartyTaxScheme>');
// addLine('      <cac:PartyLegalEntity>');
// addLine('        <cbc:RegistrationName>شركة توريد التكنولوجيا بأقصى سرعة المحدودة | Maximum Speed Tech Supply LTD</cbc:RegistrationName>');
// addLine('      </cac:PartyLegalEntity>');
// addLine('    </cac:Party>');
// addLine('  </cac:AccountingSupplierParty>');
// addLine('  <cac:AccountingCustomerParty>');
// addLine('    <cac:Party>');
// addLine('      <cac:PostalAddress>');
// addLine('        <cbc:StreetName>صلاح الدين | Salah Al-Din</cbc:StreetName>');
// addLine('        <cbc:BuildingNumber>1111</cbc:BuildingNumber>');
// addLine('        <cbc:CitySubdivisionName>المروج | Al-Murooj</cbc:CitySubdivisionName>');
// addLine('        <cbc:CityName>الرياض | Riyadh</cbc:CityName>');
// addLine('        <cbc:PostalZone>12222</cbc:PostalZone>');
// addLine('        <cac:Country>');
// addLine('          <cbc:IdentificationCode>SA</cbc:IdentificationCode>');
// addLine('        </cac:Country>');
// addLine('      </cac:PostalAddress>');
// addLine('      <cac:PartyTaxScheme>');
// addLine('        <cbc:CompanyID>399999999800003</cbc:CompanyID>');
// addLine('        <cac:TaxScheme>');
// addLine('          <cbc:ID>VAT</cbc:ID>');
// addLine('        </cac:TaxScheme>');
// addLine('      </cac:PartyTaxScheme>');
// addLine('      <cac:PartyLegalEntity>');
// addLine('        <cbc:RegistrationName>شركة نماذج فاتورة المحدودة | Fatoora Samples LTD</cbc:RegistrationName>');
// addLine('      </cac:PartyLegalEntity>');
// addLine('    </cac:Party>');
// addLine('  </cac:AccountingCustomerParty>');
// addLine('  <cac:Delivery>');
// addLine('    <cbc:ActualDeliveryDate>2025-04-25</cbc:ActualDeliveryDate>');
// addLine('  </cac:Delivery>');
// addLine('  <cac:PaymentMeans>');
// addLine('    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
// addLine('  </cac:PaymentMeans>');
// addLine('  <cac:AllowanceCharge>');
// addLine('    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
// addLine('    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>');
// addLine('    <cbc:Amount currencyID="SAR">0.00</cbc:Amount>');
// addLine('    <cac:TaxCategory>');
// addLine('      <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>');
// addLine('      <cbc:Percent>15</cbc:Percent>');
// addLine('      <cac:TaxScheme>');
// addLine('        <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>');
// addLine('      </cac:TaxScheme>');
// addLine('    </cac:TaxCategory>');
// addLine('  </cac:AllowanceCharge>');
// addLine('  <cac:TaxTotal>');
// addLine('    <cbc:TaxAmount currencyID="SAR">0.6</cbc:TaxAmount>');
// addLine('    <cac:TaxSubtotal>');
// addLine('      <cbc:TaxableAmount currencyID="SAR">4</cbc:TaxableAmount>');
// addLine('      <cbc:TaxAmount currencyID="SAR">0.6</cbc:TaxAmount>');
// addLine('      <cac:TaxCategory>');
// addLine('        <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>');
// addLine('        <cbc:Percent>15</cbc:Percent>');
// addLine('        <cac:TaxScheme>');
// addLine('          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>');
// addLine('        </cac:TaxScheme>');
// addLine('      </cac:TaxCategory>');
// addLine('    </cac:TaxSubtotal>');
// addLine('  </cac:TaxTotal>');
// addLine('  <cac:LegalMonetaryTotal>');
// addLine('    <cbc:LineExtensionAmount currencyID="SAR">4</cbc:LineExtensionAmount>');
// addLine('    <cbc:TaxExclusiveAmount currencyID="SAR">4</cbc:TaxExclusiveAmount>');
// addLine('    <cbc:TaxInclusiveAmount currencyID="SAR">4.6</cbc:TaxInclusiveAmount>');
// addLine('    <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>');
// addLine('    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>');
// addLine('    <cbc:PayableAmount currencyID="SAR">4.6</cbc:PayableAmount>');
// addLine('  </cac:LegalMonetaryTotal>');
// addLine('  <cac:InvoiceLine>');
// addLine('    <cbc:ID>1</cbc:ID>');
// addLine('    <cbc:InvoicedQuantity unitCode="PCE">2</cbc:InvoicedQuantity>');
// addLine('    <cbc:LineExtensionAmount currencyID="SAR">4</cbc:LineExtensionAmount>');
// addLine('    <cac:TaxTotal>');
// addLine('      <cbc:TaxAmount currencyID="SAR">0.6</cbc:TaxAmount>');
// addLine('      <cac:TaxSubtotal>');
// addLine('        <cbc:TaxableAmount currencyID="SAR">4</cbc:TaxableAmount>');
// addLine('        <cbc:TaxAmount currencyID="SAR">0.6</cbc:TaxAmount>');
// addLine('        <cac:TaxCategory>');
// addLine('          <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>');
// addLine('          <cbc:Percent>15</cbc:Percent>');
// addLine('          <cac:TaxScheme>');
// addLine('            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>');
// addLine('          </cac:TaxScheme>');
// addLine('        </cac:TaxCategory>');
// addLine('      </cac:TaxSubtotal>');
// addLine('    </cac:TaxTotal>');
// addLine('    <cac:Item>');
// addLine('      <cbc:Name>قلم رصاص | Pencil</cbc:Name>');
// addLine('      <cac:ClassifiedTaxCategory>');
// addLine('        <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>');
// addLine('        <cbc:Percent>15</cbc:Percent>');
// addLine('        <cac:TaxScheme>');
// addLine('          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>');
// addLine('        </cac:TaxScheme>');
// addLine('      </cac:ClassifiedTaxCategory>');
// addLine('    </cac:Item>');
// addLine('    <cac:Price>');
// addLine('      <cbc:PriceAmount currencyID="SAR">2</cbc:PriceAmount>');
// addLine('    </cac:Price>');
// addLine('  </cac:InvoiceLine>');
// addLine('</Invoice>');

//   // Generate InvoiceLine with validation
//   invoice.items.forEach((item, index) => {
//     const quantity = item.quantity || 0;
//     const unitPrice = item.unit_price || 0;
//     const vatRate = item.vat_rate || 15;
//     const vatAmount = item.vat_amount || 0;
//     const lineAmount = quantity * unitPrice;
//     const description = item.description || 'Item';

//     // Validate item fields
//     if (typeof description !== 'string') {
//       console.warn(`Invalid item.description at index ${index}: ${description}`);
//       throw new Error(`Invalid item.description at index ${index}`);
//     }

//     addLine(`  <cac:InvoiceLine>`);
//     addLine(`    <cbc:ID>${index + 1}</cbc:ID>`);
//     addLine(`    <cbc:InvoicedQuantity unitCode="PCE">${formatNumber(quantity)}</cbc:InvoicedQuantity>`);
//     addLine(`    <cbc:LineExtensionAmount currencyID="SAR">${formatNumber(lineAmount)}</cbc:LineExtensionAmount>`);
//     addLine(`    <cac:TaxTotal>`);
//     addLine(`      <cbc:TaxAmount currencyID="SAR">${formatNumber(vatAmount)}</cbc:TaxAmount>`);
//     addLine(`      <cac:TaxSubtotal>`);
//     addLine(`        <cbc:TaxableAmount currencyID="SAR">${formatNumber(lineAmount)}</cbc:TaxableAmount>`);
//     addLine(`        <cbc:TaxAmount currencyID="SAR">${formatNumber(vatAmount)}</cbc:TaxAmount>`);
//     addLine(`        <cac:TaxCategory>`);
//     addLine(`          <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>`);
//     addLine(`          <cbc:Percent>${formatNumber(vatRate)}</cbc:Percent>`);
//     addLine(`          <cac:TaxScheme>`);
//     addLine(`            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>`);
//     addLine(`          </cac:TaxScheme>`);
//     addLine(`        </cac:TaxCategory>`);
//     addLine(`      </cac:TaxSubtotal>`);
//     addLine(`    </cac:TaxTotal>`);
//     addLine(`    <cac:Item>`);
//     addLine(`      <cbc:Name>${escapeXml(description)}</cbc:Name>`);
//     addLine(`      <cac:ClassifiedTaxCategory>`);
//     addLine(`        <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>`);
//     addLine(`        <cbc:Percent>${formatNumber(vatRate)}</cbc:Percent>`);
//     addLine(`        <cac:TaxScheme>`);
//     addLine(`          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>`);
//     addLine(`        </cac:TaxScheme>`);
//     addLine(`      </cac:ClassifiedTaxCategory>`);
//     addLine(`    </cac:Item>`);
//     addLine(`    <cac:Price>`);
//     addLine(`      <cbc:PriceAmount currencyID="SAR">${formatNumber(unitPrice)}</cbc:PriceAmount>`);
//     addLine(`    </cac:Price>`);
//     addLine(`  </cac:InvoiceLine>`);
//   });

//   addLine('</Invoice>');

//   // Combine lines
//   const xml = xmlLines.join('\n');

//   // Log XML for debugging
//   console.log('Generated XML Preview:', xml.substring(0, 500));
//   console.log('Generated XML Line Count:', xmlLines.length);

//   // Save XML with line numbers for debugging
//   const xmlWithLineNumbers = xmlLines.map((line, index) => `${index + 1}: ${line}`).join('\n');
//   fs.writeFileSync('E:\\a\\project\\server\\temp\\invoice_with_lines.xml', xmlWithLineNumbers, 'utf8');

//   // Validate XML structure
//   try {
//     const parser = new xml2js.Parser({ strict: true });
//     await parser.parseStringPromise(xml);
//     console.log('XML is well-formed');
//   } catch (err) {
//     console.error('XML validation failed:', err.message);
//     fs.writeFileSync('E:\\a\\project\\server\\temp\\invalid_invoice.xml', xml, 'utf8');
//     throw new Error(`Generated XML is invalid: ${err.message}`);
//   }

//   return xml;
// }



async function generateAndSubmitComplianceInvoices(user, binarySecurityToken, secret, previousInvoiceHash = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==') {
  // Validate inputs
  if (!user || !user.tax_register || !user.company_name) {
    throw new Error('User data is incomplete (missing tax_register or company_name)');
  }
  if (!binarySecurityToken || !secret) {
    throw new Error('Missing binarySecurityToken or secret for compliance check');
  }

  // Invoice types
  const invoiceTypes = [
    'standard_invoice',
    'standard_debit_note',
    'standard_credit_note',
    'simplified_invoice',
    'simplified_credit_note',
    'simplified_debit_note',
  ];

  // Paths to SDK components
  const fatooraPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps\\fatoora.bat';
  const keyPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\ec-secp256k1-priv-key.pem';
  const certPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\cert.pem';
  const csrConfigPath = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Input\\csr-config-example-AR.properties';
  const standardCertPath = 'E:\\a\\project\\server\\temp\\cert.pem';

  // Set FATOORA_HOME
  process.env.FATOORA_HOME = 'tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps';

  // // // Validate certificates
  // // if (!fs.existsSync(keyPath) || !fs.existsSync(certPath) || fs.readFileSync(certPath, 'utf8').trim() === '') {
  // //   if (fs.existsSync(standardCertPath)) {
  // //     console.log(`Copying valid certificate from ${standardCertPath} to ${certPath}`);
  // //     fs.copyFileSync(standardCertPath, certPath);
  // //   } else {
  // //     try {
  // //       execSync(`"${fatooraPath}" -csr -pem -csrConfig "${csrConfigPath}" -privateKey "${keyPath}" -generatedCsr "tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\cert.csr"`, { stdio: 'inherit' });
  // //       console.warn('Generated new key and CSR. Retrieve cert.pem from ZATCA sandbox using cert.csr and place it in tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\');
  // //       throw new Error('Certificate file is missing or empty. Please update cert.pem and retry.');
  // //     } catch (error) {
  // //       throw new Error(`Failed to generate certificates: ${error.message}`);
  // //     }
  // //   }
  // // }

  // // // Ensure certificate is non-empty
  // // const certContent = fs.readFileSync(certPath, 'utf8').trim();
  // // if (!certContent) {
  // //   throw new Error(`cert.pem at ${certPath} is empty. Copy the raw certificate content from ${standardCertPath}.`);
  // // }

  // Authentication for Step 2
  const authString = `${binarySecurityToken}:${secret}`;
  const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
  const complianceHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Version': 'V2',
    'accept-language': 'en',
    'Authorization': authHeader,
  };

  const results = [];
  let currentPreviousInvoiceHash = previousInvoiceHash;
  let referenceInvoiceNumber = null;
  let referenceInvoiceUuid = null;

  // Escape XML special characters
  function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, "'");
  }

  for (const type of invoiceTypes) {
    console.log(`Processing invoice type: ${type}`);

    // Use default PIH for debit/credit notes and simplified invoices
    const pihToUse = (type.includes('debit_note') || type.includes('credit_note') || type.includes('simplified'))
      ? 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=='
      : currentPreviousInvoiceHash;

    // Construct invoice object
    const invoice = {
      invoice_number: `SME${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}-${type}`,
      uuid: uuidv4(),
      icv: '10',
      issue_date: new Date(),
      supply_date: new Date(),
      note: 'ABC',
      seller: {
        name: user.company_name || 'Maximum Speed Tech Supply LTD',
        vat_number: user.tax_register || '399999999900003',
        street_name: user.street_name || 'Prince Sultan',
        building_number: user.building_number || '2322',
        neighborhood_name: user.neighborhood_name || 'Al-Murabba',
        city: user.city || 'Riyadh',
        postal_code: user.postal_code || '23333',
        cr_number: '1010010000',
      },
      company: {
        name: 'Fatoora Samples LTD',
        vat_number: '399999999800003',
        street_name: 'Salah Al-Din',
        building_number: '1111',
        neighborhood_name: 'Al-Murooj',
        city: 'Riyadh',
        postal_code: '12222',
      },
      items: type.includes('simplified') ? [
        {
          description: 'كتاب',
          quantity: 33,
          unit_price: 3,
          vat_rate: 15,
          vat_amount: 14.85,
        },
        {
          description: 'قلم',
          quantity: 3,
          unit_price: 34,
          vat_rate: 15,
          vat_amount: 15.30,
        },
      ] : [
        {
          description: 'Pencil',
          quantity: 2,
          unit_price: 2,
          vat_rate: 15,
          vat_amount: 0.6,
        },
      ],
    };

    // Store invoice number and UUID for standard_invoice or simplified_invoice
    if (type === 'standard_invoice' || type === 'simplified_invoice') {
      referenceInvoiceNumber = invoice.invoice_number;
      referenceInvoiceUuid = invoice.uuid;
    }

    // Calculate totals
    const lineExtensionAmount = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const taxExclusiveAmount = lineExtensionAmount;
    const taxAmount = invoice.items.reduce((sum, item) => sum + item.vat_amount, 0);
    const taxInclusiveAmount = taxExclusiveAmount + taxAmount;

    // Format dates
    const issueDate = invoice.issue_date.toISOString().split('T')[0];
    const issueTime = invoice.issue_date.toTimeString().split(' ')[0];
    const supplyDate = invoice.supply_date.toISOString().split('T')[0];

    // Add BillingReference for debit/credit notes
    const billingReference = (type.includes('debit_note') || type.includes('credit_note')) && referenceInvoiceNumber && referenceInvoiceUuid
      ? `
        <cac:BillingReference>
          <cac:InvoiceDocumentReference>
            <cbc:ID>${escapeXml(referenceInvoiceNumber)}</cbc:ID>
            <cbc:UUID>${escapeXml(referenceInvoiceUuid)}</cbc:UUID>
            <cbc:IssueDate>${issueDate}</cbc:IssueDate>
          </cac:InvoiceDocumentReference>
        </cac:BillingReference>
      `
      : '';

    // Log PIH and reference details
    console.log(`Using PIH for ${type}: ${pihToUse}`);
    if (billingReference) {
      console.log(`BillingReference for ${type}: ID=${referenceInvoiceNumber}, UUID=${referenceInvoiceUuid}`);
    }

    // Generate XML
    const xmlWithoutDigest = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoice_number)}</cbc:ID>
  <cbc:UUID>${escapeXml(invoice.uuid)}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${type.includes('simplified') ? '0200000' : type.includes('debit_note') ? '0101000' : '0100000'}">388</cbc:InvoiceTypeCode>
  <cbc:Note languageID="ar">${escapeXml(invoice.note)}</cbc:Note>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  ${billingReference}
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${escapeXml(invoice.icv)}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${pihToUse}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(invoice.seller.cr_number)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.seller.street_name)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(invoice.seller.building_number)}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(invoice.seller.neighborhood_name)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(invoice.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(invoice.seller.postal_code)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.seller.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.company.street_name)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(invoice.company.building_number)}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(invoice.company.neighborhood_name)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(invoice.company.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(invoice.company.postal_code)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.company.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.company.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${supplyDate}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">0.00</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>
      <cbc:Percent>15</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${taxExclusiveAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>
    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="SAR">${taxInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoice.items.map((item, index) => `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${item.quantity.toFixed(6)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${(item.quantity * item.unit_price).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${item.vat_amount.toFixed(2)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="SAR">${((item.quantity * item.unit_price) + item.vat_amount).toFixed(2)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(item.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${(item.vat_rate || 15).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${item.unit_price.toFixed(2)}</cbc:PriceAmount>
        <cac:AllowanceCharge>
          <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
          <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
          <cbc:Amount currencyID="SAR">0.00</cbc:Amount>
        </cac:AllowanceCharge>
      </cac:Price>
    </cac:InvoiceLine>
  `).join('')}
</Invoice>`;

    // Write unsigned XML
    const unsignedFile = `E:\\a\\project\\server\\temp\\unsigned_invoice_${type}.xml`;
    const signedFile = `E:\\a\\project\\server\\temp\\signed_invoice_${type}.xml`;
    fs.writeFileSync(unsignedFile, xmlWithoutDigest);
    console.log(`Saved unsigned XML to ${unsignedFile}`);

    // Sign XML using ZATCA SDK with QR code
    let invoiceHash;
    try {
      const signCommand = `"${fatooraPath}" -sign -invoice "${unsignedFile}" -key "${keyPath}" -cert "${certPath}" -signedInvoice "${signedFile}" -qr`;
      console.log('Executing signing command:', signCommand);
      const signOutput = execSync(signCommand, { stdio: 'pipe', shell: true }).toString();
      console.log('SDK signing output:', signOutput);

      // Check for signing errors
      if (signOutput.includes('ERROR')) {
        throw new Error(`SDK signing failed for ${type}: ${signOutput}`);
      }

      // Extract invoice hash from SDK output
      const hashMatch = signOutput.match(/INVOICE HASH = ([A-Za-z0-9+/=]+)/);
      if (!hashMatch || !hashMatch[1]) {
        throw new Error('Failed to extract invoice hash from SDK output');
      }
      invoiceHash = hashMatch[1];
      console.log(`Extracted invoice hash: ${invoiceHash}`);

      // Check if signed file exists
      if (!fs.existsSync(signedFile)) {
        throw new Error(`Signed XML file not created: ${signedFile}`);
      }
    } catch (error) {
      console.error('SDK signing failed:', error.message);
      throw new Error(`Failed to sign XML for ${type}: ${error.message}`);
    }

    // Validate signed XML locally
    try {
      const validateCommand = `"${fatooraPath}" -validate -invoice "${signedFile}"`;
      console.log('Executing validation command:', validateCommand);
      const validateOutput = execSync(validateCommand, { stdio: 'pipe', shell: true }).toString();
      console.log('SDK validation output:', validateOutput);
  
      // Check if BR-KSA-98 is present and validation passed
      const hasBRKSA98 = validateOutput.includes('BR-KSA-98');
      const isValidationPassed = validateOutput.includes('GLOBAL VALIDATION RESULT = PASSED');
  
      if (validateOutput.includes('ERROR') && !(hasBRKSA98 && isValidationPassed)) {
        throw new Error(`Local validation failed for ${type}: ${validateOutput}`);
      } else if (hasBRKSA98) {
        console.warn(`BR-KSA-98 detected in local validation for ${type}: Treated as non-fatal, continuing compliance check`);
      }
    } catch (error) {
      console.error('Local validation failed:', error.message);
      throw new Error(`Failed to validate XML for ${type}: ${error.message}`);
    }

    // Read signed XML and inspect QR code
    const signedXml = fs.readFileSync(signedFile, 'utf8');
    console.log(`Saved signed XML to ${signedFile}`);
    const qrMatch = signedXml.match(/<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>(.*?)<\/cbc:EmbeddedDocumentBinaryObject>/);
    if (qrMatch && qrMatch[1]) {
      console.log(`QR code content length: ${qrMatch[1].length} characters`);
    } else {
      console.log('No QR code content found in signed XML');
      if (type.includes('simplified')) {
        throw new Error(`QR code missing for ${type}`);
      }
    }

    // Submit to ZATCA compliance API
    const base64Invoice = Buffer.from(signedXml).toString('base64');
  let complianceResponse;
  try {
    console.log(`Submitting ${type} to ZATCA compliance API`);
    const response = await fetch('https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance/invoices', {
      method: 'POST',
      headers: complianceHeaders,
      body: JSON.stringify({
        invoiceHash,
        uuid: invoice.uuid,
        invoice: base64Invoice,
      }),
    });
    const responseText = await response.text();
    fs.writeFileSync(`E:\\a\\project\\server\\temp\\zatca_compliance_response_${type}.json`, responseText, 'utf8');
    try {
      complianceResponse = JSON.parse(responseText);
    } catch (jsonError) {
      throw new Error(`Failed to parse ZATCA compliance response for ${type}: ${jsonError.message}`);
    }
    console.log(`ZATCA compliance response for ${type}:`, JSON.stringify(complianceResponse, null, 2));

    // Handle BR-KSA-98 as non-fatal
    const validationResults = complianceResponse.validationResults || {};
    const warnings = validationResults.warningMessages || [];
    const errors = validationResults.errorMessages || [];
    const hasBRKSA98 = warnings.some(w => w.code === 'BR-KSA-98') || errors.some(e => e.code === 'BR-KSA-98');

    if (!response.ok || validationResults.status === 'ERROR') {
      if (hasBRKSA98) {
        console.warn(`BR-KSA-98 detected for ${type}: Treated as non-fatal, continuing compliance check`);
      } else {
        const errorDetails = errors.map(msg => JSON.stringify(msg)).join(', ') || 'No error details provided';
        throw new Error(`Compliance check failed for ${type}: ${errorDetails}`);
      }
    }

    // Log all warnings and errors for debugging
    if (warnings.length > 0) {
      console.warn(`Warnings for ${type}:`, JSON.stringify(warnings, null, 2));
    }
    if (errors.length > 0) {
      console.warn(`Errors for ${type}:`, JSON.stringify(errors, null, 2));
    }
  } catch (error) {
    throw new Error(`Failed to submit ${type} to ZATCA: ${error.message}`);
  }

  results.push({
    type,
    invoice_number: invoice.invoice_number,
    uuid: invoice.uuid,
    invoiceHash,
    complianceResponse,
  });

  currentPreviousInvoiceHash = invoiceHash;
  }

  return { results, lastInvoiceHash: currentPreviousInvoiceHash };
}

async function requestProductionCsid(complianceRequestId, binarySecurityToken, secret) {
  if (!complianceRequestId || !binarySecurityToken || !secret) {
    throw new Error('Missing compliance_request_id, binarySecurityToken, or secret for production CSID request');
  }

  const authString = `${binarySecurityToken}:${secret}`;
  const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Version': 'V2',
    'accept-language': 'en',
    'Authorization': authHeader,
  };

  const body = {
    compliance_request_id: complianceRequestId,
  };

  console.log('Sending ZATCA production request:', body);

  try {
    const response = await fetch('https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/production/csids', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    fs.writeFileSync('E:\\a\\project\\server\\temp\\zatca_production_response.json', responseText, 'utf8');

    let productionResponse;
    try {
      productionResponse = JSON.parse(responseText);
    } catch (jsonError) {
      throw new Error(`Failed to parse ZATCA production response: ${jsonError.message}`);
    }

    console.log('ZATCA production response:', JSON.stringify(productionResponse, null, 2));

    if (!response.ok) {
      throw new Error(`Production CSID request failed: HTTP ${response.status} - ${productionResponse.httpMessage || 'Unknown error'} (${productionResponse.moreInformation || 'No details'})`);
    }

    return productionResponse;
  } catch (error) {
    console.error('ZATCA production request failed:', error.message);
    throw new Error(`ZATCA Integration Error (Step 3): ${error.message}`);
  }
}

// Function to sign and validate an invoice
async function signInvoice(req, res) {
  const { invoiceType, xml } = req.body;

  if (!invoiceType || !xml) {
    console.log('Missing invoiceType or xml:', req.body);
    return res.status(400).json({ error: 'Missing invoiceType or xml' });
  }

  try {
    // Paths
    const certPath = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\cert.pem';
    const privKeyPath = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates\\ec-secp256k1-priv-key.pem';
    const signedDir = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Signed';
    const debugDir = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Debug';
    const fatooraPath = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps\\fatoora.bat';
    const tempDir = path.join(__dirname, 'temp', `validate_${Date.now()}_${uuidv4()}`);
    const tempFilePath = path.join(tempDir, 'signed_temp.xml');

    // Set FATOORA_HOME
    process.env.FATOORA_HOME = 'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Apps';

    // Save input XML to debug folder for inspection
    console.log('Saving input XML to debug folder...');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const debugInputFilePath = path.join(debugDir, `debug_input_${invoiceType}_${uuidv4()}.xml`);
    fs.writeFileSync(debugInputFilePath, xml, 'utf8');
    console.log(`Saved input XML to ${debugInputFilePath}`);

    // Read raw Base64 certificates
    console.log('Reading certificates...');
    const certBase64 = fs.readFileSync(certPath, 'utf8').trim();
    const privKeyBase64 = fs.readFileSync(privKeyPath, 'utf8').trim();

    // Convert to PEM for jsrsasign
    const privKeyPem = `-----BEGIN EC PRIVATE KEY-----\n${privKeyBase64}\n-----END EC PRIVATE KEY-----`;
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;

    // Parse XML
    console.log('Parsing XML...');
    let xmlObj;
    try {
      xmlObj = await parser.parseStringPromise(xml);
    } catch (parseError) {
      console.error('XML parsing error:', parseError.message);
      console.log('Input XML preview:', xml.slice(0, 500));
      throw new Error(`XML parsing failed: ${parseError.message}`);
    }

    // Canonicalize XML (excluding UBLExtensions and cac:Signature)
    const tempXmlObj = JSON.parse(JSON.stringify(xmlObj));
    delete tempXmlObj.Invoice['ext:UBLExtensions'];
    delete tempXmlObj.Invoice['cac:Signature'];
    const canonicalXml = builder.buildObject(tempXmlObj).replace(/>\s+</g, '><');

    // Calculate SHA-256 hash
    console.log('Calculating hash...');
    const hash = jsrsasign.KJUR.crypto.Util.sha256(canonicalXml);
    const hashBase64 = Buffer.from(hash, 'hex').toString('base64');

    // Sign hash with ECDSA
    console.log('Signing XML...');
    const sig = new jsrsasign.KJUR.crypto.Signature({ alg: 'SHA256withECDSA' });
    sig.init(privKeyPem);
    sig.updateString(canonicalXml);
    const signatureValue = sig.sign();

    // Calculate XAdES properties
    const signingTime = new Date().toISOString().split('.')[0];
    const certDigest = Buffer.from(jsrsasign.KJUR.crypto.Util.sha256(certPem), 'hex').toString('base64');
    const xadesXml = `
      <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
        <xades:SignedProperties Id="xadesSignedProperties">
          <xades:SignedSignatureProperties>
            <xades:SigningTime>${signingTime}</xades:SigningTime>
            <xades:SigningCertificate>
              <xades:Cert>
                <xades:CertDigest>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/>
                  <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>
                </xades:CertDigest>
                <xades:IssuerSerial>
                  <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local</ds:X509IssuerName>
                  <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">379112742831380471835263969587287663520528387</ds:X509SerialNumber>
                </xades:IssuerSerial>
              </xades:Cert>
            </xades:SigningCertificate>
          </xades:SignedSignatureProperties>
        </xades:SignedProperties>
      </xades:QualifyingProperties>
    `;
    const xadesHash = jsrsasign.KJUR.crypto.Util.sha256(xadesXml.replace(/>\s+</g, '><'));
    const xadesHashBase64 = Buffer.from(xadesHash, 'hex').toString('base64');

    // Create signature XML
    const signatureXml = `
      <sig:UBLDocumentSignatures
        xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
        xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
        xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
        <sac:SignatureInformation>
          <cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">urn:oasis:names:specification:ubl:signature:1</cbc:ID>
          <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
          <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
              <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
              <ds:Reference Id="invoiceSignedData" URI="">
                <ds:Transforms>
                  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                    <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                  </ds:Transform>
                  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                    <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                  </ds:Transform>
                  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                    <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                  </ds:Transform>
                  <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                </ds:Transforms>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>${hashBase64}</ds:DigestValue>
              </ds:Reference>
              <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>${xadesHashBase64}</ds:DigestValue>
              </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>${Buffer.from(signatureValue, 'hex').toString('base64')}</ds:SignatureValue>
            <ds:KeyInfo>
              <ds:X509Data>
                <ds:X509Certificate>${certBase64}</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
            <ds:Object>
              ${xadesXml}
            </ds:Object>
          </ds:Signature>
        </sac:SignatureInformation>
      </sig:UBLDocumentSignatures>
    `;

    // Parse signature XML to avoid escaping
    console.log('Parsing signature XML...');
    let signatureObj;
    try {
      signatureObj = await parser.parseStringPromise(signatureXml);
    } catch (parseError) {
      console.error('Signature XML parsing error:', parseError.message);
      throw new Error(`Signature XML parsing failed: ${parseError.message}`);
    }

    // Update UBLExtensions with parsed signature
    xmlObj.Invoice['ext:UBLExtensions']['ext:UBLExtension']['ext:ExtensionContent'] = {
      'sig:UBLDocumentSignatures': signatureObj['sig:UBLDocumentSignatures']
    };

    // Convert to XML
    console.log('Building signed XML...');
    const signedXml = builder.buildObject(xmlObj);

    // Save signed XML to debug folder (always)
    console.log('Saving signed XML to debug folder...');
    const debugFilePath = path.join(debugDir, `debug_signed_${invoiceType}_${uuidv4()}.xml`);
    fs.writeFileSync(debugFilePath, signedXml, 'utf8');
    console.log(`Saved signed XML to ${debugFilePath}`);
    console.log('Signed XML preview:', signedXml.slice(0, 500));

    // Validate signed XML using ZATCA SDK (fatoora.bat)
    console.log('Validating signed XML...');
    let validationStatus = 'failed';
    let validationError = null;

    try {
      // Create temp directory for validation
      console.log(`Creating temp directory: ${tempDir}`);
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`Verifying temp directory exists: ${fs.existsSync(tempDir)}`);
      console.log(`Writing signed XML to: ${tempFilePath}`);

      // Write XML with error handling
      try {
        fs.writeFileSync(tempFilePath, signedXml, 'utf8');
        console.log(`Successfully wrote signed XML to ${tempFilePath}`);
        console.log(`Verifying file exists: ${fs.existsSync(tempFilePath)}`);
      } catch (writeError) {
        console.error(`Failed to write signed XML to ${tempFilePath}:`, writeError.message);
        throw new Error(`Failed to write signed XML: ${writeError.message}`);
      }

      // Verify file exists
      if (!fs.existsSync(tempFilePath)) {
        console.error(`Temporary file does not exist: ${tempFilePath}`);
        throw new Error(`Temporary file was not created: ${tempFilePath}`);
      }

      // Run ZATCA SDK validation
      const validateCommand = `"${fatooraPath}" -validate -invoice "${tempFilePath}"`;
      console.log(`Executing validation command: ${validateCommand}`);
      let validateOutput;
      try {
        validateOutput = execSync(validateCommand, { stdio: 'pipe', shell: true, encoding: 'utf8' });
        console.log('SDK validation output:', validateOutput);
      } catch (execError) {
        console.error('Validation stderr:', execError.stderr || execError.stdout || 'No output');
        throw new Error(`Validation command failed: ${execError.message}`);
      }

      // Check validation result
      const hasBRKSA98 = validateOutput.includes('BR-KSA-98');
      const isValidationPassed = validateOutput.includes('GLOBAL VALIDATION RESULT = PASSED');

      if (validateOutput.includes('ERROR') && !(hasBRKSA98 && isValidationPassed)) {
        validationError = `Validation failed: ${validateOutput}`;
      } else {
        validationStatus = 'success';
        if (hasBRKSA98) {
          console.warn('BR-KSA-98 detected in validation: Treated as non-fatal');
        }
      }
    } catch (error) {
      console.error('Validation error:', error.message);
      validationError = `Validation failed: ${error.message}`;
    } finally {
      // Only clean up if validation succeeded
      if (validationStatus === 'success' && fs.existsSync(tempDir)) {
        console.log(`Cleaning up temp directory: ${tempDir}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } else {
        console.log(`Preserving temp directory for debugging: ${tempDir}`);
      }
    }

    // Save to Signed folder only if validation succeeds
    if (validationStatus === 'success') {
      console.log('Validation succeeded, saving signed XML...');
      if (!fs.existsSync(signedDir)) {
        fs.mkdirSync(signedDir, { recursive: true });
      }
      const signedFilePath = path.join(signedDir, `signed_${invoiceType}_${uuidv4()}.xml`);
      fs.writeFileSync(signedFilePath, signedXml, 'utf8');
      console.log(`Saved signed XML to ${signedFilePath}`);
    } else {
      console.log('Validation failed, not saving XML');
    }

    // Send response
    return res.json({
      signedXml,
      validationStatus,
      validationError
    });
  } catch (error) {
    console.error('Invoice Signing Error:', error.message);
    return res.status(500).json({ error: `Failed to sign invoice: ${error.message}` });
  }
}

// Define the route using the signInvoice function
app.post('/sign-invoice', signInvoice);


app.post('/api/zatca/integrate', async (req, res) => {
  let connection1 = null; // For Step 1
  let connection3 = null; // For Step 3
  try {
    console.time('Total Integration');
    const { otp, base64Csr, userId } = req.body;
    console.log('Received request body:', { otp, base64Csr, userId });

    // Validate inputs
    if (!userId) {
      throw Object.assign(new Error('userId is null or missing in request body'), { step: 1 });
    }
    if (isNaN(parseInt(userId))) {
      throw Object.assign(new Error('userId is invalid; it must be a valid integer'), { step: 1 });
    }
    if (!otp) {
      throw Object.assign(new Error('OTP is required for ZATCA compliance request'), { step: 1 });
    }

    // Step 1: Compliance CSID
    console.time('Step 1');
    connection1 = await pool.getConnection();
    await connection1.beginTransaction();

    // Fetch user data
    const [users] = await connection1.execute(
      'SELECT company_name, tax_register, city, street_name, building_number, neighborhood_name, postal_code FROM users WHERE id = ?',
      [userId]
    ).catch((err) => {
      console.error('Database query error:', err);
      throw Object.assign(new Error(`Database error: ${err.message}`), { step: 1 });
    });

    if (users.length === 0) {
      throw Object.assign(new Error(`المستخدم غير موجود: userId=${userId}`), { step: 1 });
    }
    const user = users[0];

    // Validate tax_register
    if (!user.tax_register || user.tax_register.length !== 15 || !/^\d{15}$/.test(user.tax_register)) {
      throw Object.assign(new Error('رقم التسجيل الضريبي يجب أن يكون 15 رقمًا'), { step: 1 });
    }

    // Generate or use provided CSR
    let privateKeyPem, csrPem, base64PrivateKey;
    if (!base64Csr) {
      const csrData = await generateCSR(user);
      privateKeyPem = csrData.privateKey;
      csrPem = csrData.csr;
      base64PrivateKey = csrData.base64PrivateKey;
    } else {
      csrPem = Buffer.from(base64Csr, 'base64').toString('utf8');
      privateKeyPem = '';
      base64PrivateKey = base64Csr;
    }

    // ZATCA Compliance CSID Request
    const complianceHeaders = {
      accept: 'application/json',
      'accept-language': 'en',
      OTP: otp,
      'Accept-Version': 'V2',
      'Content-Type': 'application/json',
    };
    const requestBody = {
      csr: base64Csr || Buffer.from(csrPem).toString('base64'),
    };
    console.log('Sending ZATCA compliance request:', { headers: complianceHeaders, body: requestBody });
    const complianceResponse = await fetch(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance',
      {
        method: 'POST',
        headers: complianceHeaders,
        body: JSON.stringify(requestBody),
      }
    );
    const responseText = await complianceResponse.text();
    console.log('ZATCA API raw response:', responseText);
    fs.writeFileSync('E:\\a\\project\\server\\temp\\zatca_compliance_response.json', responseText, 'utf8');
    console.log('Saved ZATCA response to zatca_compliance_response.json');
    let complianceData;
    try {
      complianceData = JSON.parse(responseText);
    } catch (jsonError) {
      throw Object.assign(
        new Error(`Failed to parse ZATCA API response: ${jsonError.message}. Status: ${complianceResponse.status}`),
        { step: 1 }
      );
    }
    console.log('ZATCA API response:', complianceData);
    if (!complianceResponse.ok) {
      throw Object.assign(
        new Error(
          complianceData.message ||
          complianceData.errors?.join(', ') ||
          `ZATCA API error: ${complianceResponse.status}`
        ),
        { step: 1 }
      );
    }

    const { requestID, binarySecurityToken, secret, dispositionMessage } = complianceData;
    console.log('Raw binarySecurityToken:', binarySecurityToken);
    if (dispositionMessage !== 'ISSUED') {
      throw Object.assign(new Error(`Compliance CSID not issued: ${dispositionMessage}`), { step: 1 });
    }

    // Decode and save binarySecurityToken as cert.pem (for both Step 1 and Step 3)
    const saveBinarySecurityTokenAsCert = (binarySecurityToken, step) => {
      try {
        // Decode Base64 to binary
        const decodedCert = Buffer.from(binarySecurityToken, 'base64');
        // Define output path
        const certPath = path.join(
          'E:\\a\\project\\tools\\zatca-einvoicing-sdk-Java-238-R3.4.1\\Data\\Certificates',
          'cert.pem'
        );
        // Write decoded binary to cert.pem without headers
        fs.writeFileSync(certPath, decodedCert);
        console.log(`Successfully saved decoded binarySecurityToken to ${certPath} for step ${step}`);
      } catch (error) {
        console.error(`Error saving cert.pem for step ${step}:`, error);
        throw Object.assign(new Error(`Failed to save cert.pem: ${error.message}`), { step });
      }
    };

    // Call the function after Step 1 response
    saveBinarySecurityTokenAsCert(binarySecurityToken, 1);

    // Store Step 1 data in database
    await connection1.execute(
      `UPDATE users SET 
        zatca_private_key = ?, 
        zatca_csr = ?, 
        zatca_base64_private_key = ?, 
        zatca_ccsid_bstoken = ?, 
        zatca_ccsid_secret = ?, 
        zatca_ccsid_request_id = ?
      WHERE id = ?`,
      [
        privateKeyPem || null,
        csrPem || null,
        base64PrivateKey || null,
        binarySecurityToken,
        secret,
        requestID,
        userId,
      ]
    );

    // Commit Step 1 transaction
    await connection1.commit();
    console.timeEnd('Step 1');

    // Release Step 1 connection
    connection1.release();
    console.log('Step 1 connection released');

    // Step 2: Compliance Check with 6 Invoices
    console.time('Step 2');
    console.log('Starting compliance check for 6 invoices');
    const { results, lastInvoiceHash } = await generateAndSubmitComplianceInvoices(user, binarySecurityToken, secret);
    console.log('Compliance check results:', results);
    console.timeEnd('Step 2');

    // Step 3: Production CSID
    console.time('Step 3');
    console.log('Starting production CSID request');
    const productionData = await requestProductionCsid(requestID, binarySecurityToken, secret);

    // Save binarySecurityToken for Step 3
    saveBinarySecurityTokenAsCert(productionData.binarySecurityToken, 3);
    console.log('Production Certificate Has Been Generated And Saved Successfully');

    // New connection for Step 3
    connection3 = await pool.getConnection();
    await connection3.beginTransaction();

    // Store Step 3 data in database
    await connection3.execute(
      `UPDATE users SET 
        zatca_pcsid_bstoken = ?, 
        zatca_pcsid_secret = ?, 
        zatca_pcsid_request_id = ?
      WHERE id = ?`,
      [
        productionData.binarySecurityToken,
        productionData.secret,
        productionData.requestID,
        userId,
      ]
    );

    // Commit Step 3 transaction
    await connection3.commit();
    console.timeEnd('Step 3');
    console.timeEnd('Total Integration');

    // Send response
    res.status(200).json({
      status: { step: 3, progress: 100, success: true },
      message: 'تم التكامل مع ZATCA بنجاح',
      complianceResults: results,
      lastInvoiceHash,
    });
    console.log('Integration has been succeeded');
    res.end();

  } catch (error) {
    console.error('ZATCA Integration Error:', error);
    // Rollback transactions if connections are active
    if (connection1 && connection1.connection._closing === false) {
      await connection1.rollback();
    }
    if (connection3 && connection3.connection._closing === false) {
      await connection3.rollback();
    }
    res.status(500).json({
      status: { step: error.step || 1, progress: error.step ? error.step * 33 : 33, success: false },
      error: error.message || 'فشل التكامل مع ZATCA',
    });
    res.end();
  } 
});

// ZATCA Reporting Endpoint
app.post('/api/report-invoice', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { invoiceId } = req.body;
    const userId = req.user.id;

    // Fetch invoice details (unchanged)
    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.supply_date,
        i.due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.icv,
        i.uuid,
        i.zatca_invoice_hash,
        u.company_name AS seller_name,
        u.tax_register AS seller_vat_number,
        u.commercial_register AS seller_cr_number,
        u.address AS seller_street_name,
        u.city AS seller_city,
        u.postal_code AS seller_postal_code,
        u.building_number AS seller_building_number,
        c.name AS company_name,
        c.vat_number AS company_vat_number,
        c.cr_number AS company_cr_number,
        c.street_name AS company_street_name,
        c.city AS company_city,
        c.postal_code AS company_postal_code
      FROM invoices i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [invoiceId, userId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoiceFromDb = invoices[0];

    // Fetch invoice items (unchanged)
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoiceId]
    );

    // Fetch the last ICV (unchanged)
    const [lastInvoice] = await connection.execute(
      `SELECT icv FROM invoices WHERE company_id = ? AND icv IS NOT NULL ORDER BY icv DESC LIMIT 1`,
      [invoiceFromDb.company_id]
    );
    const icv = lastInvoice.length > 0 && lastInvoice[0].icv ? parseInt(lastInvoice[0].icv) + 1 : 1;

    // Fetch the previous invoice hash (unchanged)
    const [previousInvoice] = await connection.execute(
      `SELECT zatca_invoice_hash 
       FROM invoices 
       WHERE company_id = ? AND id < ? AND zatca_invoice_hash IS NOT NULL 
       ORDER BY id DESC LIMIT 1`,
      [invoiceFromDb.company_id, invoiceId]
    );
    const previousInvoiceHash = previousInvoice.length > 0 && previousInvoice[0].zatca_invoice_hash
      ? previousInvoice[0].zatca_invoice_hash
      : 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

    // Map the fetched invoice (unchanged)
    const invoice = {
      id: String(invoiceFromDb.id),
      invoice_number: invoiceFromDb.invoice_number,
      issue_date: new Date(invoiceFromDb.issue_date),
      supply_date: invoiceFromDb.supply_date ? new Date(invoiceFromDb.supply_date) : undefined,
      icv: String(icv),
      uuid: invoiceFromDb.uuid || crypto.randomUUID(),
      seller: {
        name: invoiceFromDb.seller_name || 'غير محدد',
        vat_number: invoiceFromDb.seller_vat_number,
        cr_number: invoiceFromDb.seller_cr_number,
        street_name: invoiceFromDb.seller_street_name || 'غير محدد',
        building_number: invoiceFromDb.seller_building_number || '1234',
        city: invoiceFromDb.seller_city || 'غير محدد',
        postal_code: invoiceFromDb.seller_postal_code || '00000',
      },
      company: {
        name: invoiceFromDb.company_name,
        vat_number: invoiceFromDb.company_vat_number,
        cr_number: invoiceFromDb.company_cr_number,
        street_name: invoiceFromDb.company_street_name || invoiceFromDb.address || 'غير محدد',
        building_number: '1234',
        city: invoiceFromDb.company_city || 'غير محدد',
        postal_code: invoiceFromDb.company_postal_code || '00000',
      },
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price),
        vat_rate: parseFloat(item.vat_rate),
        vat_amount: parseFloat(item.vat_amount),
      })),
    };

    // Validate seller and buyer VAT numbers (unchanged)
    if (!invoice.seller.vat_number || !invoice.company.vat_number) {
      throw new Error('Seller or buyer VAT number is missing');
    }
    if (invoice.seller.vat_number === invoice.company.vat_number) {
      throw new Error('Seller and buyer VAT numbers must be different');
    }

    // Generate the XML (unchanged)
    const { xml, invoiceHash } = await generateZatcaInvoiceXML(invoice, previousInvoiceHash);
    const base64Invoice = Buffer.from(xml).toString('base64');

    // Parse the signed XML to extract UUID, hash, and QR code
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'text/xml');
    const signedUuid = xmlDoc.getElementsByTagNameNS(
      'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'UUID'
    )[0]?.textContent || invoice.uuid;
    const signedInvoiceHash = xmlDoc.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#',
      'DigestValue'
    )[0]?.textContent || invoiceHash;

    // Debug: Log the hash from the signed XML
    console.log('Signed Invoice Hash from XML:', signedInvoiceHash);

    // Extract QR code from signed XML
    const additionalDocRefs = xmlDoc.getElementsByTagNameNS(
      'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'AdditionalDocumentReference'
    );
    let qrCode = null;
    for (let i = 0; i < additionalDocRefs.length; i++) {
      const docRef = additionalDocRefs[i];
      const idNode = docRef.getElementsByTagNameNS(
        'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        'ID'
      )[0];
      if (idNode && idNode.textContent === 'QR') {
        const embeddedDocNode = docRef.getElementsByTagNameNS(
          'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
          'EmbeddedDocumentBinaryObject'
        )[0];
        if (embeddedDocNode) {
          qrCode = embeddedDocNode.textContent;
          break;
        }
      }
    }
    if (!qrCode) {
      console.warn('QR code not found in signed XML');
    }

    // Update invoice with ICV, hash, UUID, QR code, and status
    await connection.execute(
      `UPDATE invoices SET icv = ?, zatca_invoice_hash = ?, uuid = ?, qr_code = ?, status = ? WHERE id = ?`,
      [icv, signedInvoiceHash, signedUuid, qrCode, 'certified', invoiceId]
    );

    // Debug: Fetch and log the stored hash and status
    const [updatedInvoice] = await connection.execute(
      `SELECT zatca_invoice_hash, status FROM invoices WHERE id = ?`,
      [invoiceId]
    );
    console.log('Stored Invoice Hash:', updatedInvoice[0].zatca_invoice_hash);
    console.log('Stored Status:', updatedInvoice[0].status);

    // ZATCA API call
    const zatcaToken = process.env.ZATCA_TOKEN;
    const zatcaSecret = process.env.ZATCA_SECRET;
    const authHeader = `Basic ${Buffer.from(`${zatcaToken}:${zatcaSecret}`).toString('base64')}`;

    const headers = {
      'accept': 'application/json',
      'accept-language': 'en',
      'Clearance-Status': '1',
      'Accept-Version': 'V2',
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    };

    const requestBody = {
      invoiceHash: signedInvoiceHash,
      uuid: signedUuid,
      invoice: base64Invoice,
    };

    const response = await fetch(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single',
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      }
    );

    const responseBody = await response.text();
    let zatcaResult;
    try {
      zatcaResult = JSON.parse(responseBody);
      console.log('ZATCA Response:', JSON.stringify(zatcaResult, null, 2));
    } catch (parseError) {
      console.error('Failed to parse ZATCA response:', parseError);
      return res.status(500).json({
        error: 'Failed to parse ZATCA response',
        details: responseBody,
      });
    }

    if (!response.ok) {
      console.error('ZATCA Error Response:', JSON.stringify(zatcaResult, null, 2));
      return res.status(response.status).json({
        error: 'Failed to report invoice to ZATCA',
        status: response.status,
        details: zatcaResult,
      });
    }

    // Store ZATCA response
    await connection.execute(
      `UPDATE invoices SET zatca_response = ? WHERE id = ?`,
      [JSON.stringify(zatcaResult), invoiceId]
    );

    await connection.commit();
    res.json({
      message: 'Invoice reported successfully',
      zatcaResponse: zatcaResult,
      qrCode: qrCode,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// XML Download Endpoint
app.get('/api/invoices/:id/xml', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const invoiceId = req.params.id;
    const userId = req.user.id;

    // Fetch invoice details from the database
    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.supply_date,
        i.due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.icv,
        i.uuid,
        i.zatca_invoice_hash,
        u.company_name AS seller_name,
        u.tax_register AS seller_vat_number,
        u.commercial_register AS seller_cr_number,
        u.address AS seller_street_name,
        u.city AS seller_city,
        u.postal_code AS seller_postal_code,
        u.building_number AS seller_building_number,
        c.name AS company_name,
        c.vat_number AS company_vat_number,
        c.cr_number AS company_cr_number,
        c.street_name AS company_street_name,
        c.city AS company_city,
        c.postal_code AS company_postal_code
      FROM invoices i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [invoiceId, userId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const invoiceData = invoices[0];

    // Fetch invoice items
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoiceId]
    );

    // Fetch previous invoice hash if available
    const [previousInvoice] = await connection.execute(
      `SELECT zatca_invoice_hash 
       FROM invoices 
       WHERE company_id = ? AND id < ? AND zatca_invoice_hash IS NOT NULL 
       ORDER BY id DESC LIMIT 1`,
      [invoiceData.company_id, invoiceId]
    );
    const previousInvoiceHash = previousInvoice.length > 0 && previousInvoice[0].zatca_invoice_hash
      ? previousInvoice[0].zatca_invoice_hash
      : 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

    // Map database data to the invoice format
    const invoice = {
      id: String(invoiceData.id),
      invoice_number: invoiceData.invoice_number,
      issue_date: new Date(invoiceData.issue_date),
      supply_date: invoiceData.supply_date ? new Date(invoiceData.supply_date) : undefined,
      icv: invoiceData.icv || '1',
      uuid: invoiceData.uuid,
      seller: {
        name: invoiceData.seller_name || 'غير محدد',
        vat_number: invoiceData.seller_vat_number,
        cr_number: invoiceData.seller_cr_number,
        street_name: invoiceData.seller_street_name || 'غير محدد',
        building_number: invoiceData.seller_building_number || '1234',
        city: invoiceData.seller_city || 'غير محدد',
        postal_code: invoiceData.seller_postal_code || '00000',
      },
      company: {
        name: invoiceData.company_name,
        vat_number: invoiceData.company_vat_number,
        cr_number: invoiceData.company_cr_number,
        street_name: invoiceData.company_street_name || invoiceData.address || 'غير محدد',
        building_number: '1234',
        city: invoiceData.company_city || 'غير محدد',
        postal_code: invoiceData.company_postal_code || '00000',
      },
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price),
        vat_rate: parseFloat(item.vat_rate),
        vat_amount: parseFloat(item.vat_amount),
      })),
    };

    // Validate required fields
    if (!invoice.seller.vat_number || !invoice.company.vat_number) {
      throw new Error('رقم تسجيل الضريبة للبائع أو المشتري مفقود');
    }

    // Generate the XML
    const { xml } = await generateZatcaInvoiceXML(invoice, previousInvoiceHash);

    // Set headers and send XML response
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice.invoice_number}.xml`);
    res.send(xml);
  } catch (error) {
    console.error('Error generating invoice XML:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'فشل في إنشاء ملف XML للفاتورة', details: error.message });
  } finally {
    connection.release();
  }
});

// Endpoint to get QR code
// app.get('/api/invoices/:id/qr', authenticateToken, async (req, res) => {
//   try {
//     const invoiceId = req.params.id;
//     const [rows] = await db.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
//     const invoice = rows[0];
//     if (!invoice) {
//       return res.status(404).json({ error: 'Invoice not found' });
//     }

//     let qrCodeBase64 = invoice.qr_code;

//     // If QR code isn’t cached, generate it
//     if (!qrCodeBase64) {
//       const { xml } = await generateZatcaInvoiceXML(invoice);
//       const parser = new DOMParser();
//       const xmlDoc = parser.parseFromString(xml, 'application/xml');
//       qrCodeBase64 = xmlDoc.querySelector("AdditionalDocumentReference[ID='QR'] EmbeddedDocumentBinaryObject")?.textContent || '';

//       if (!qrCodeBase64) {
//         return res.status(500).json({ error: 'Failed to extract QR code' });
//       }

//       // Cache the QR code in the database
//       await db.query('UPDATE invoices SET qr_code = ? WHERE id = ?', [qrCodeBase64, invoiceId]);
//     }

//     res.json({ qrCode: qrCodeBase64 });
//   } catch (error) {
//     console.error('Error generating QR code:', error);
//     res.status(500).json({ error: 'Failed to generate QR code' });
//   }
// });

// Create quotation endpoint
app.post('/api/quotations', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      expiryDate,
      totalAmount,
      vatAmount,
      notes,
      terms,
      customerName,
      interestRate,
      discountRate,
      discount_on_total_percent,
      discount_on_total_amount,
      projectId,
      items,
    } = req.body; // Removed profitAmount from destructuring

    // Validate required fields
    if (!companyId || !issueDate || !totalAmount || !vatAmount || !items || !items.length) {
      throw new Error('Missing required fields');
    }

    // Format dates
    const formattedIssueDate = new Date(issueDate).toISOString().split('T')[0];
    const formattedExpiryDate = expiryDate ? new Date(expiryDate).toISOString().split('T')[0] : null;

    // Generate quotation number
    const date = new Date(issueDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;
    const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM quotations`);
    const sequenceNumber = countResult[0].count + 1;
    const quotationNumber = `QUO-${formattedDate}-${sequenceNumber}`;

    // Insert quotation
    const [result] = await connection.execute(
      `INSERT INTO quotations (
        quotation_number, company_id, issue_date, expiry_date, 
        total_amount, vat_amount, notes, terms, created_by, 
        customer_name, interest_rate, discount_rate, 
        discount_on_total_percent, discount_on_total_amount, project_id, profit_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotationNumber,
        companyId,
        formattedIssueDate,
        formattedExpiryDate,
        Number(totalAmount.toFixed(3)),
        Number(vatAmount.toFixed(3)),
        notes || null,
        terms,
        req.user.id,
        customerName || null,
        interestRate || 0,
        discountRate || 0,
        discount_on_total_percent || 0,
        discount_on_total_amount || 0,
        projectId || null,
        0, // Initial profit_amount, to be updated later
      ]
    );

    const quotationId = result.insertId;

    // Insert quotation items
    for (const item of items) {
      await connection.execute(
        `INSERT INTO quotation_items (
          quotation_id, code, description, quantity, unit_price, base_unit_price,
          vat_rate, vat_amount, total_vat_amount, price_after_tax,
          total_amount, discount_rate, interest_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.code || '',
          item.description,
          item.quantity,
          Number(item.unitPrice.toFixed(2)),
          Number(item.baseUnitPrice.toFixed(2)),
          item.vatRate,
          item.vatAmount,
          item.totalVatAmount,
          item.priceAfterTax,
          item.totalAmount,
          item.discountRate || 0,
          item.interestRate || 0,
        ]
      );
    }

    // Calculate profit
    const [rows] = await connection.execute(
      'SELECT unit_price, base_unit_price, quantity FROM quotation_items WHERE quotation_id = ?',
      [quotationId]
    );
    const profit = rows.reduce(
      (sum, item) => sum + (Number(item.unit_price) - Number(item.base_unit_price || 0)) * Number(item.quantity || 0),
      0
    );

    // Update quotations table with profit_amount
    await connection.execute(
      'UPDATE quotations SET profit_amount = ? WHERE id = ?',
      [Number(profit.toFixed(2)), quotationId]
    );

    await connection.commit();
    res.status(201).json({
      message: 'تم إنشاء عرض السعر بنجاح',
      quotationId,
      quotationNumber,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quotation:', error, error.stack);
    res.status(500).json({ error: 'فشل في إنشاء عرض السعر', details: error.message });
  } finally {
    connection.release();
  }
});


// Get quotations endpoint
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search, type, status, customer, startDate, endDate, dueOnly } = req.query;
    let query = `
      SELECT 
        q.id,
        q.quotation_number as number,
        q.issue_date as issueDate,
        q.expiry_date as expiryDate,
        q.total_amount as total,
        q.vat_amount as vatAmount,
        q.notes,
        q.created_at as createdAt,
        q.customer_name as customerName,
        c.vat_number as customerVatNumber,
        p.name as projectName,
        q.profit_amount
      FROM quotations q
      LEFT JOIN companies c ON q.company_id = c.id
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.created_by = ?
    `;
    const queryParams = [req.user.id];

    if (search) {
      query += ` AND (q.quotation_number LIKE ? OR q.customer_name LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (type && type !== 'all') {
      query += ` AND q.type = ?`;
      queryParams.push(type);
    }

    if (status && status !== 'all') {
      query += ` AND q.status = ?`;
      queryParams.push(status);
    }

    if (customer && customer !== 'all') {
      query += ` AND q.company_id = ?`;
      queryParams.push(customer);
    }

    if (startDate) {
      query += ` AND q.issue_date >= ?`;
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ` AND q.issue_date <= ?`;
      queryParams.push(endDate);
    }

    if (dueOnly === 'true') {
      query += ` AND q.expiry_date <= CURRENT_DATE`;
    }

    const [rows] = await pool.execute(query, queryParams);
    res.json({ quotations: rows });
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات عروض الأسعار' });
  }
});


// Get single quotation with details
app.get('/api/quotations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch quotation details
    const [quotation] = await pool.execute(
      `SELECT
        q.id,
        q.quotation_number as number,
        q.company_id,
        q.issue_date as issueDate,
        q.expiry_date as expiryDate,
        q.total_amount as totalAmount,
        q.vat_amount as vatAmount,
        q.notes as notes,
        q.terms,
        q.interest_rate,
        q.discount_rate,
        q.discount_on_total_percent,
        q.discount_on_total_amount,
        q.project_id,
        p.name as projectName,
        q.created_at as createdAt,
        q.customer_name as customerName,
        c.vat_number as customerVatNumber,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email
      FROM quotations q
      LEFT JOIN companies c ON q.company_id = c.id
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.id = ? AND q.created_by = ?`,
      [id, req.user.id]
    );

    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود' });
    }

    // Fetch quotation items
    const [items] = await pool.execute(
      `SELECT
        description,
        code,
        quantity,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount,
        price_after_tax,
        discount_rate,
        interest_rate
      FROM quotation_items
      WHERE quotation_id = ?`,
      [id]
    );

    // Format the response
    const formattedQuotation = {
      ...quotation[0],
      company_name: {
        id: quotation[0].company_id,
        name: quotation[0].customerName,
        vat_number: quotation[0].customerVatNumber,
        address: quotation[0].company_address,
        city: quotation[0].company_city,
        postal_code: quotation[0].company_postal_code,
        phone: quotation[0].company_phone,
        email: quotation[0].company_email,
      },
      projectName: quotation[0].projectName,
      items: items,
    };

    res.json(formattedQuotation);
  } catch (error) {
    console.error('Error fetching quotation details:', error);
    res.status(500).json({ error: 'فشل في جلب تفاصيل عرض السعر', details: error.message });
  }
});


// Update a quotation (partial update)
app.patch('/api/quotations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_name,
      customer_type,
      email,
      phone,
      issue_date,
      expiry_date,
      discount_rate,
      interest_rate,
      items,
      terms,
      notes,
      status,
      company_id,
    } = req.body;

    // Validate required fields
    if (!customer_name || !issue_date || !expiry_date || !items || items.length === 0) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة' });
    }

    // Validate discount_rate and interest_rate
    if (discount_rate !== undefined && (discount_rate < 0 || discount_rate > 100)) {
      return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 100' });
    }
    if (interest_rate !== undefined && interest_rate < 0) {
      return res.status(400).json({ error: 'نسبة الفائدة يجب أن تكون غير سالبة' });
    }

    // Validate status if provided
    const validStatuses = ['draft', 'issued', 'certified', 'paid', 'cancelled'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة' });
    }

    // Validate item fields
    for (const item of items) {
      if (!item.description || item.quantity <= 0 || item.unit_price < 0 || item.vat_rate < 0) {
        return res.status(400).json({ error: 'بيانات العناصر غير صالحة' });
      }
      if (item.discount_rate !== undefined && (item.discount_rate < 0 || item.discount_rate > 100)) {
        return res.status(400).json({ error: 'نسبة الخصم للعنصر يجب أن تكون بين 0 و 100' });
      }
      if (item.interest_rate !== undefined && item.interest_rate < 0) {
        return res.status(400).json({ error: 'نسبة الفائدة للعنصر يجب أن تكون غير سالبة' });
      }
      // Optional: Validate code (e.g., not empty if required)
      if (item.code !== undefined && typeof item.code !== 'string') {
        return res.status(400).json({ error: 'كود العنصر يجب أن يكون نصًا' });
      }
    }

    // Check if quotation exists and belongs to the user
    const [quotation] = await pool.execute(
      'SELECT id, company_id FROM quotations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );
    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود أو لا تملك صلاحية التعديل' });
    }

    const existingCompanyId = quotation[0].company_id;

    // Update company details if provided
    if (company_id || customer_name || email || phone) {
      const companyUpdates = {};
      if (customer_name) companyUpdates.name = customer_name;
      if (email !== undefined) companyUpdates.email = email;
      if (phone !== undefined) companyUpdates.phone = phone;

      if (Object.keys(companyUpdates).length > 0) {
        const targetCompanyId = company_id || existingCompanyId;
        if (targetCompanyId) {
          const updateCompanyQuery = `
            UPDATE companies
            SET ${Object.keys(companyUpdates).map((key) => `${key} = ?`).join(', ')}
            WHERE id = ?
          `;
          const updateCompanyValues = [...Object.values(companyUpdates), targetCompanyId];
          await pool.execute(updateCompanyQuery, updateCompanyValues);
        }
      }
    }

    // Calculate item totals
    let totalVatAmount = 0;
    let totalAmount = 0;
    items.forEach((item) => {
      const basePrice = item.quantity * item.unit_price;
      const discountAmount = basePrice * (item.discount_rate || 0) / 100;
      const priceAfterDiscount = basePrice - discountAmount;
      item.price_after_tax = Number(priceAfterDiscount.toFixed(2));
      item.vat_amount = Number((priceAfterDiscount * (item.vat_rate || 15) / 100).toFixed(2));
      item.total_amount = Number((priceAfterDiscount + item.vat_amount).toFixed(2));
      totalVatAmount += item.vat_amount;
      totalAmount += item.total_amount;
    });

    // Update quotation details
    const quotationUpdates = {
      customer_name,
      issue_date,
      expiry_date,
      discount_rate: discount_rate || 0,
      interest_rate: interest_rate || 0,
      total_amount: totalAmount.toFixed(2),
      vat_amount: totalVatAmount.toFixed(2),
      terms: terms || null,
      notes: notes || null,
      status: status || 'draft',
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      company_id: company_id || existingCompanyId,
    };

    const updateQuotationQuery = `
      UPDATE quotations
      SET ${Object.keys(quotationUpdates).map((key) => `${key} = ?`).join(', ')}
      WHERE id = ?
    `;
    const updateQuotationValues = [...Object.values(quotationUpdates), id];
    await pool.execute(updateQuotationQuery, updateQuotationValues);

    // Delete existing items
    await pool.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

    // Insert updated items
    if (items.length > 0) {
      const itemQuery = `
        INSERT INTO quotation_items (
          quotation_id,
          description,
          code,
          quantity,
          unit_price,
          vat_rate,
          vat_amount,
          total_amount,
          price_after_tax,
          discount_rate,
          interest_rate
        ) VALUES ${items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      `;
      const itemValues = items.flatMap((item) => [
        id,
        item.description,
        item.code || null, // Handle empty code
        item.quantity,
        item.unit_price,
        item.vat_rate,
        item.vat_amount,
        item.total_amount,
        item.price_after_tax,
        item.discount_rate || 0,
        item.interest_rate || 0,
      ]);
      await pool.execute(itemQuery, itemValues);
    }

    res.json({ message: 'تم تحديث عرض السعر بنجاح' });
  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ error: 'فشل في تحديث عرض السعر', details: error.message });
  }
});



// DELETE endpoint to delete a quotation
app.delete('/api/quotations/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if the quotation exists and belongs to the user
    const [quotation] = await connection.execute(
      'SELECT id FROM quotations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود' });
    }

    // Delete associated items first
    await connection.execute(
      'DELETE FROM quotation_items WHERE quotation_id = ?',
      [id]
    );

    // Delete the quotation
    await connection.execute('DELETE FROM quotations WHERE id = ?', [id]);

    await connection.commit();
    res.json({ message: 'تم حذف عرض السعر بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting quotation:', error);
    res.status(500).json({ error: 'فشل في حذف عرض السعر' });
  } finally {
    connection.release();
  }
});



// Get customers endpoint
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const type = req.query.type || 'all';

    let query = `
      SELECT SQL_CALC_FOUND_ROWS 
        c.id, c.name, c.vat_number, c.cr_number, c.phone, c.address, c.city, c.postal_code, c.created_at, c.type, c.email, 
        c.street_name, c.neighborhood_name, c.rating, c.notes, p.name AS project_name
      FROM companies c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.created_by = ? AND (
        c.name LIKE ? OR 
        c.vat_number LIKE ? OR 
        c.cr_number LIKE ? OR 
        c.phone LIKE ? OR 
        c.address LIKE ? OR 
        c.city LIKE ? OR 
        c.postal_code LIKE ? OR 
        c.street_name LIKE ? OR 
        c.neighborhood_name LIKE ? OR
        p.name LIKE ?
      )
    `;

    const searchParams = [req.user.id, ...Array(10).fill(`%${search}%`)];

    if (type !== 'all') {
      query += ' AND c.type = ?';
      searchParams.push(type);
    }

    query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    searchParams.push(limit, offset);

    const [customers] = await pool.execute(query, searchParams);
    const [countResult] = await pool.execute('SELECT FOUND_ROWS() as total');
    const total = countResult[0].total;

    res.json({
      customers,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات العملاء' });
  }
});

// Add customer endpoint
app.post('/api/customers', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { name, vatNumber, crNumber, phone, address, city, postalCode, type, email, streetName, neighborhoodName, registrationDate, projectId } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'الاسم ونوع العميل مطلوبان' });
    }

    if (type === 'company') {
      if (!vatNumber || !crNumber || !projectId) {
        return res.status(400).json({ error: 'الرقم الضريبي، رقم السجل التجاري، واسم المشروع مطلوبة للشركات' });
      }
    }

    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      return res.status(400).json({ error: 'الرمز البريدي يجب أن يتكون من 5 أرقام فقط' });
    }

    if (vatNumber) {
      const [existingVat] = await connection.execute(
        'SELECT id FROM companies WHERE vat_number = ? AND created_by = ?',
        [vatNumber, req.user.id]
      );
      if (existingVat.length > 0) {
        return res.status(400).json({ error: 'الرقم الضريبي مستخدم بالفعل' });
      }
    }

    if (crNumber) {
      const [existingCr] = await connection.execute(
        'SELECT id FROM companies WHERE cr_number = ? AND created_by = ?',
        [crNumber, req.user.id]
      );
      if (existingCr.length > 0) {
        return res.status(400).json({ error: 'رقم السجل التجاري مستخدم بالفعل' });
      }
    }

    const cleanedAddress = address?.trim() || null;
    const cleanedStreetName = streetName?.trim() || null;
    const cleanedNeighborhoodName = neighborhoodName?.trim() || null;
    const cleanedCity = city?.trim() || null;
    const cleanedPostalCode = postalCode?.trim() || null;
    const cleanedRegistrationDate = registrationDate && type === 'company' ? new Date(registrationDate).toISOString().split('T')[0] : null;

    const [result] = await connection.execute(
      'INSERT INTO companies (name, vat_number, cr_number, phone, address, city, postal_code, type, email, street_name, neighborhood_name, registration_date, project_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [
        name,
        vatNumber || null,
        crNumber || null,
        phone || null,
        cleanedAddress,
        cleanedCity,
        cleanedPostalCode,
        type,
        email || null,
        cleanedStreetName,
        cleanedNeighborhoodName,
        cleanedRegistrationDate,
        type === 'company' ? projectId : null,
        req.user.id,
      ]
    );

    await connection.commit();
    res.json({ customerId: result.insertId, message: 'تم إضافة العميل بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding customer:', error);
    res.status(500).json({ error: 'فشل في إضافة العميل: ' + error.message });
  } finally {
    connection.release();
  }
});

// Delete customer endpoint
app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if customer exists and belongs to user
    const [customer] = await connection.execute(
      'SELECT id FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    // Check if customer has any invoices
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE company_id = ?',
      [id]
    );

    // Check if customer has any quotations
    const [quotations] = await connection.execute(
      'SELECT id FROM quotations WHERE company_id = ?',
      [id]
    );

    // If either invoices or quotations exist, return a 400 error with the unified message
    if (invoices.length > 0 || quotations.length > 0) {
      return res.status(400).json({
        error: 'لا يمكن حذف العميل لوجود فواتير مرتبطه به او عروض سعر',
      });
    }

    // Delete customer
    await connection.execute('DELETE FROM companies WHERE id = ?', [id]);

    await connection.commit();
    res.json({ message: 'تم حذف العميل بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting customer:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({ error: 'فشل في حذف العميل: ' + error.message });
  } finally {
    connection.release();
  }
});

// Update PATCH customer endpoint 
app.patch('/api/customers/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { name, vatNumber, crNumber, phone, address, city, postalCode, type, email, streetName, neighborhoodName, registrationDate, projectId } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'الاسم ونوع العميل مطلوبان' });
    }

    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      return res.status(400).json({ error: 'الرمز البريدي يجب أن يتكون من 5 أرقام فقط' });
    }

    const [customer] = await connection.execute(
      'SELECT id FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    const cleanedAddress = address?.trim() || '';
    const cleanedStreetName = streetName?.trim() || '';
    const cleanedNeighborhoodName = neighborhoodName?.trim() || '';
    const cleanedCity = city?.trim() || '';
    const cleanedPostalCode = postalCode?.trim() || '';
    const cleanedRegistrationDate = registrationDate ? new Date(registrationDate).toISOString().split('T')[0] : null;

    const [result] = await connection.execute(
      'UPDATE companies SET name = ?, vat_number = ?, cr_number = ?, phone = ?, address = ?, city = ?, postal_code = ?, type = ?, email = ?, street_name = ?, neighborhood_name = ?, registration_date = ?, project_id = ? WHERE id = ? AND created_by = ?',
      [
        name,
        vatNumber || null,
        crNumber || null,
        phone || null,
        cleanedAddress,
        cleanedCity,
        cleanedPostalCode,
        type,
        email || null,
        cleanedStreetName,
        cleanedNeighborhoodName,
        cleanedRegistrationDate,
        projectId || null,
        id,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'العميل غير موجود أو لا يمكن تعديله' });
    }

    await connection.commit();
    res.json({ message: 'تم تعديل العميل بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'فشل في تعديل العميل: ' + error.message });
  } finally {
    connection.release();
  }
});

// Customer Rate
app.post('/api/customers/:id/rate', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { rating, notes } = req.body;

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و5' });
    }

    // Check if customer exists and belongs to user
    const [customer] = await connection.execute(
      'SELECT id FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    // Update the customer's rating and notes in the companies table
    await connection.execute(
      'UPDATE companies SET rating = ?, notes = ? WHERE id = ?',
      [rating, notes || null, id]
    );

    await connection.commit();
    res.json({ message: 'تم إضافة التقييم بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error rating customer:', error);
    res.status(500).json({ error: 'فشل في إضافة التقييم: ' + error.message });
  } finally {
    connection.release();
  }
});

// Get customer rating
app.get('/api/customers/:id/rating', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    // Check if customer exists and belongs to user
    const [customer] = await connection.execute(
      'SELECT id, rating, notes FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    const customerData = customer[0];
    res.json({
      averageRating: customerData.rating || 0,
      notes: customerData.notes || '',
    });
  } catch (error) {
    console.error('Error fetching customer rating:', error);
    res.status(500).json({ error: 'فشل في جلب التقييم: ' + error.message });
  } finally {
    connection.release();
  }
});

// Update rating
app.patch('/api/customers/:id/rate', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { rating, notes } = req.body;

    // Validate input
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و5' });
    }

    // Check if customer exists and belongs to user
    const [customer] = await connection.execute(
      'SELECT id FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    // Update the customer's rating and notes in the companies table
    await connection.execute(
      'UPDATE companies SET rating = ?, notes = ? WHERE id = ?',
      [rating || null, notes || null, id]
    );

    await connection.commit();
    res.json({ message: 'تم تحديث التقييم بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating rating:', error);
    res.status(500).json({ error: 'فشل في تحديث التقييم: ' + error.message });
  } finally {
    connection.release();
  }
});

// Delete rating
app.delete('/api/customers/:id/rate', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    // Check if customer exists and belongs to user
    const [customer] = await connection.execute(
      'SELECT id FROM companies WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    // Reset rating and notes to default values
    await connection.execute(
      'UPDATE companies SET rating = 0, notes = NULL WHERE id = ?',
      [id]
    );

    await connection.commit();
    res.json({ message: 'تم حذف التقييم بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting rating:', error);
    res.status(500).json({ error: 'فشل في حذف التقييم: ' + error.message });
  } finally {
    connection.release();
  }
});

//Suppliers Dropdown
app.get('/api/suppliers/dropdown', authenticateToken, async (req, res) => {
  console.log('Reached /api/suppliers/dropdown endpoint');
  try {
    const { search = '' } = req.query;
    
    let query = 'SELECT id, name FROM suppliers WHERE created_by = ?';
    const queryParams = [req.user.id];
    
    if (search) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${search}%`);
    }
    
    query += ' ORDER BY name ASC LIMIT 50'; // Limit for performance
    
    const [suppliers] = await pool.execute(query, queryParams);

    // Return in the format expected by the frontend
    res.json({
      success: true,
      data: suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers for dropdown:', error);
    res.status(500).json({ 
      success: false,
      error: 'فشل في جلب بيانات الموردين' 
    });
  }
});

//Get Suppliers Endpoint
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 5, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [suppliers] = await pool.execute(
      `SELECT 
        id,
        name,
        email,
        phone,
        total_spent,
        active,
        created_at
      FROM suppliers
      WHERE created_by = ? AND (name LIKE ? OR email LIKE ?)
      LIMIT ? OFFSET ?`,
      [req.user.id, `%${search}%`, `%${search}%`, Number(limit), offset]
    );

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total
       FROM suppliers
       WHERE created_by = ? AND (name LIKE ? OR email LIKE ?)`,
      [req.user.id, `%${search}%`, `%${search}%`]
    );

    const total = countResult[0].total;
    const pages = Math.ceil(total / Number(limit));

    res.json({
      suppliers,
      pagination: {
        total,
        pages,
        currentPage: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات الموردين' });
  }
});

//Get Single Supplier Endpoint
app.get('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [supplier] = await pool.execute(
      `SELECT
        id,
        name,
        contact_person,
        email,
        phone,
        address,
        working_hours,
        business_activity,
        total_spent,
        notes,
        active,
        created_at,
        updated_at
      FROM suppliers
      WHERE id = ? AND created_by = ?`,
      [id, req.user.id]
    );

    if (supplier.length === 0) {
      return res.status(404).json({ error: 'المورد غير موجود' });
    }

    res.json(supplier[0]);
  } catch (error) {
    console.error('Error fetching supplier details:', error);
    res.status(500).json({ error: 'فشل في جلب تفاصيل المورد' });
  }
});



//Create Supplier Endpoint
app.post('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      contact_person,
      email,
      phone,
      address,
      working_hours, // New field
      business_activity, // New field
      notes,
      active = true,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'الاسم مطلوب' });
    }

    const [result] = await pool.execute(
      `INSERT INTO suppliers (
        name,
        contact_person,
        email,
        phone,
        address,
        working_hours,
        business_activity,
        notes,
        active,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        contact_person || null,
        email || null,
        phone || null,
        address || null,
        working_hours || null,
        business_activity || null,
        notes || null,
        active ? 1 : 0,
        req.user.id,
      ]
    );

    const [newSupplier] = await pool.execute(
      `SELECT
        id,
        name,
        contact_person,
        email,
        phone,
        address,
        working_hours,
        business_activity,
        total_spent,
        notes,
        active,
        created_at,
        updated_at
      FROM suppliers
      WHERE id = ? AND created_by = ?`,
      [result.insertId, req.user.id]
    );

    res.status(201).json(newSupplier[0]);
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(400).json({ error: 'معرف المستخدم غير موجود في جدول المستخدمين' });
    } else {
      res.status(500).json({ error: 'فشل في إنشاء المورد' });
    }
  }
});

//Update Supplier Endpoint
app.put('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      contact_person,
      email,
      phone,
      address,
      working_hours, // New field
      business_activity, // New field
      notes,
      active,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'الاسم مطلوب' });
    }

    const [result] = await pool.execute(
      `UPDATE suppliers
       SET
        name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?,
        working_hours = ?,
        business_activity = ?,
        notes = ?,
        active = ?
       WHERE id = ? AND created_by = ?`,
      [
        name,
        contact_person || null,
        email || null,
        phone || null,
        address || null,
        working_hours || null,
        business_activity || null,
        notes || null,
        active ? 1 : 0,
        id,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'المورد غير موجود' });
    }

    const [updatedSupplier] = await pool.execute(
      `SELECT
        id,
        name,
        contact_person,
        email,
        phone,
        address,
        working_hours,
        business_activity,
        total_spent,
        notes,
        active,
        created_at,
        updated_at
      FROM suppliers
      WHERE id = ? AND created_by = ?`,
      [id, req.user.id]
    );

    res.json(updatedSupplier[0]);
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    } else {
      res.status(500).json({ error: 'فشل في تحديث المورد' });
    }
  }
});

//Delete Supplier Endpoint
app.delete('/api/suppliers/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const supplierId = parseInt(id, 10); // Ensure id is an integer
    console.log('Parsed supplierId:', supplierId); // Debug log
    if (isNaN(supplierId)) {
      await connection.rollback();
      return res.status(400).json({ error: 'معرف المورد غير صالح' });
    }

    // Ensure req.user.id exists
    if (!req.user || !req.user.id) {
      await connection.rollback();
      return res.status(401).json({ error: 'غير مصرح لك: المستخدم غير محدد' });
    }

    // Check if the supplier exists and belongs to the user
    const [supplier] = await connection.execute(
      'SELECT id FROM suppliers WHERE id = ? AND created_by = ?',
      [supplierId, req.user.id]
    );
    console.log('Supplier check result:', supplier); // Debug log

    if (supplier.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'المورد غير موجود' });
    }

    // Check if the supplier is associated with any purchase invoices
    const [purchases] = await connection.execute(
      'SELECT id FROM purchase_invoices WHERE supplier_id = ?',
      [supplierId]
    );
    console.log(`Checking purchases for supplier_id ${supplierId}:`, purchases); // Debug log

    if (purchases.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: 'لا يمكن حذف المورد لوجود مشتريات أو فواتير مرتبطه به',
      });
    }

    // If no purchases are associated, proceed with deletion
    const [deleteResult] = await connection.execute(
      'DELETE FROM suppliers WHERE id = ?',
      [supplierId]
    );
    console.log('Delete result:', deleteResult); // Debug log

    if (deleteResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'فشل في حذف المورد: المورد غير موجود أو تم حذفه بالفعل' });
    }

    await connection.commit();
    res.json({ message: 'تم حذف المورد بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting supplier:', error); // Log the full error
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(400).json({
        error: 'لا يمكن حذف المورد لوجود مشتريات أو فواتير مرتبطه به',
      });
    }
    res.status(500).json({ error: 'فشل في حذف المورد' });
  } finally {
    connection.release();
  }
});


// Add product endpoint
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, code, price, supplierId } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO products (name, code, price, supplier_id, created_by) VALUES (?, ?, ?, ?, ?)`,
      [name, code, price, supplierId || null, req.user.id]
    );

    res.status(201).json({
      message: 'تم إضافة المنتج بنجاح',
      productId: result.insertId,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'كود المنتج مسجل بالفعل' });
    }
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'فشل في إضافة المنتج' });
  }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT SQL_CALC_FOUND_ROWS 
        p.id,
        p.name,
        p.code,
        p.price,
        p.created_at,
        p.supplier_id,
        s.name AS supplierName
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.created_by = ? AND (
        p.name LIKE ? OR
        p.code LIKE ? OR
        s.name LIKE ?
      )
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `;

    const [products] = await pool.execute(query, [
      req.user.id,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      limit,
      offset,
    ]);

    const [countResult] = await pool.execute('SELECT FOUND_ROWS() as total');
    const total = countResult[0].total;

    res.json({
      products,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات المنتجات: ' + error.message });
  }
});

// Delete product endpoint
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if product exists and belongs to the user
    const [product] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (product.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    await pool.execute('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'فشل في حذف المنتج' });
  }
});

// Update product endpoint
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { name, code, price, supplierId } = req.body;

    // Validate input (excluding supplierId since it's optional)
    if (!name || !code || price === undefined) {
      return res.status(400).json({ error: 'جميع الحقول (الاسم، الكود، السعر) مطلوبة' });
    }

    // Check if product exists and belongs to the user
    const [product] = await connection.execute(
      'SELECT id FROM products WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (product.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    // Update product
    await connection.execute(
      'UPDATE products SET name = ?, code = ?, price = ?, supplier_id = ? WHERE id = ?',
      [name, code, price, supplierId || null, id]
    );

    res.json({ message: 'تم تعديل المنتج بنجاح' });
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'كود المنتج مسجل بالفعل' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'المورد المحدد غير موجود' });
    }
    res.status(500).json({ error: 'فشل في تعديل المنتج: ' + error.message });
  } finally {
    connection.release();
  }
});

// Get recent projects
app.get('/api/projects/recent', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT id, name, location, progress, status, budget, spent, description, start_date AS startDate, end_date AS endDate, manager FROM projects WHERE created_by = ? ORDER BY created_at ASC LIMIT 5',
      [req.user.id]
    );
    const formattedRows = rows.map(row => ({
      ...row,
      startDate: row.startDate instanceof Date ? row.startDate.toISOString().split('T')[0] : row.startDate,
      endDate: row.endDate instanceof Date ? row.endDate.toISOString().split('T')[0] : row.endDate,
    }));
    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching recent projects:', error);
    res.status(500).json({ error: 'فشل في جلب المشاريع الحديثة' });
  } finally {
    connection.release();
  }
});

app.get('/api/projects/dropdown', authenticateToken, async (req, res) => {
  console.log('Reached /api/projects/dropdown endpoint');
  try {
    const { search = '' } = req.query;
    
    let query = 'SELECT id, name FROM projects WHERE created_by = ?';
    const queryParams = [req.user.id];
    
    if (search) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${search}%`);
    }
    
    query += ' ORDER BY name ASC LIMIT 50'; // Limit for performance
    
    const [projects] = await pool.execute(query, queryParams);

    // Return in the format expected by the frontend
    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error fetching projects for dropdown:', error);
    res.status(500).json({ 
      success: false,
      error: 'فشل في جلب بيانات المشاريع' 
    });
  }
});

// Get all projects (with pagination and search)
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const query = `
      SELECT 
        p.id,
        p.name,
        p.location,
        p.progress,
        p.status,
        p.budget,
        p.spent,
        p.description,
        p.start_date,
        p.end_date,
        p.manager,
        p.created_at,
        p.updated_at,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', pm.id,
              'name', pm.name,
              'description', pm.description,
              'order_index', pm.order_index
            )
          )
          FROM project_missions pm
          WHERE pm.project_id = p.id AND pm.id IS NOT NULL
        ), '[]') as missions,
        COALESCE((
          SELECT SUM(total_amount)
          FROM purchase_invoice_products pip
          WHERE pip.purchase_invoice_id IN (
            SELECT pi.id FROM purchase_invoices pi 
            WHERE pi.project_id = p.id AND pi.created_by = ?
          )
        ), 0) as total_purchases,
        COALESCE(SUM(me.amount), 0) as total_expenses,
        COALESCE((
          SELECT SUM(quantity * price)
          FROM installations i
          WHERE i.project_id = p.id AND i.created_by = ?
        ), 0) as total_installations
      FROM projects p
      LEFT JOIN miscellaneous_expenses me ON p.id = me.project_id AND me.user_id = ?
      WHERE p.created_by = ? AND (
        p.name LIKE ? OR
        p.location LIKE ?
      )
      GROUP BY p.id, p.name, p.location, p.progress, p.status, p.budget, p.spent,
               p.description, p.start_date, p.end_date, p.manager, p.created_at, p.updated_at
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const [projects] = await pool.execute(query, [
      req.user.id,
      req.user.id,
      req.user.id,
      req.user.id,
      `%${search}%`,
      `%${search}%`,
      limit,
      offset,
    ]);

    const processedProjects = projects.map(project => {
      let missions = [];
      try {
        missions = project.missions ? JSON.parse(project.missions).filter(m => m.id !== null && m.id !== undefined) : [];
      } catch (e) {
        console.error('Error parsing missions for project', project.id, ':', e);
        missions = [];
      }
      const total_purchases = parseFloat(project.total_purchases) || 0;
      const total_expenses = parseFloat(project.total_expenses) || 0;
      const total_installations = parseFloat(project.total_installations) || 0;
      const total_project_cost = total_purchases + total_expenses + total_installations;
      return {
        ...project,
        missions,
        total_purchases,
        total_expenses,
        total_installations,
        total_project_cost,
        budget: parseFloat(project.budget) || 0,
        spent: parseFloat(project.spent) || 0,
        start_date: project.start_date ? new Date(project.start_date).toISOString() : null,
        end_date: project.end_date ? new Date(project.end_date).toISOString() : null
      };
    });

    console.log('User ID:', req.user.id);
    console.log('Processed projects:', processedProjects.map(p => ({
      id: p.id,
      name: p.name,
      start_date: p.start_date,
      missions: p.missions.map(m => ({ id: m.id, name: m.name })),
      total_purchases: p.total_purchases,
      total_expenses: p.total_expenses,
      total_installations: p.total_installations,
      total_project_cost: p.total_project_cost
    })));

    const [debugSums] = await pool.execute(`
      SELECT 
        (SELECT COALESCE(SUM(total_amount), 0)
         FROM purchase_invoice_products pip
         WHERE pip.purchase_invoice_id IN (
           SELECT pi.id FROM purchase_invoices pi 
           WHERE pi.project_id = ? AND pi.created_by = ?
         )) as total_purchases,
        (SELECT COALESCE(SUM(amount), 0) 
         FROM miscellaneous_expenses 
         WHERE project_id = ? AND user_id = ?) as total_expenses,
        (SELECT COALESCE(SUM(quantity * price), 0) 
         FROM installations 
         WHERE project_id = ? AND created_by = ?) as total_installations
      FROM projects WHERE id = ? AND created_by = ?
    `, [26, req.user.id, 26, req.user.id, 26, req.user.id, 26, req.user.id]);
    console.log('Debug sums for project 26:', debugSums[0]);

    const [missionsDebug] = await pool.execute(`
      SELECT id, name, description, order_index
      FROM project_missions 
      WHERE project_id = ?
    `, [26]);
    console.log('Missions for project 26:', missionsDebug);

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM projects 
       WHERE created_by = ? AND (name LIKE ? OR location LIKE ?)`,
      [req.user.id, `%${search}%`, `%${search}%`]
    );
    const total = countResult[0].total;

    res.json({
      success: true,
      projects: processedProjects,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ 
      success: false,
      error: 'فشل في جلب المشاريع' 
    });
  }
});

// Get single project by ID
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [projects] = await pool.execute(
      `SELECT 
        id,
        name,
        location,
        progress,
        status,
        budget,
        spent,
        created_at,
        updated_at
      FROM projects
      WHERE id = ? AND created_by = ?`,
      [id, req.user.id]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'المشروع غير موجود' });
    }

    res.json(projects[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'فشل في جلب تفاصيل المشروع' });
  }
});

// Create new project with missions (FIXED)
app.post('/api/projects', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { 
      name, 
      description, 
      startDate, 
      endDate, 
      budget, 
      location, 
      manager, 
      status,
      missions 
    } = req.body;

    // Validation
    if (!name || !description || !startDate || !endDate || !location || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول المطلوبة يجب ملؤها' 
      });
    }

    if (!missions || !Array.isArray(missions) || missions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'يجب إضافة مهمة واحدة على الأقل للمشروع' 
      });
    }

    // Map status from English to Arabic
    const statusMap = {
      'pending': 'معلق',
      'active': 'جاري',
      'completed': 'مكتمل',
      'on-hold': 'معلق'
    };

    // Create project
    const [result] = await connection.execute(
      `INSERT INTO projects (
        name, location, progress, status, budget, spent, description, 
        start_date, end_date, manager, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        location,
        0, // Initial progress
        statusMap[status] || 'معلق',
        parseFloat(budget) || 0,
        0, // Initial spent
        description,
        startDate,
        endDate,
        manager || '',
        req.user.id
      ]
    );

    const projectId = result.insertId;

    // Create missions
    for (const mission of missions) {
      if (mission.name && mission.name.trim()) {
        await connection.execute(
          'INSERT INTO project_missions (project_id, name, description, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [projectId, mission.name.trim(), mission.description || '', mission.order_index]
        );
      }
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      message: 'تم إضافة المشروع والمهام بنجاح',
      projectId: projectId
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating project:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في إضافة المشروع',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

app.post('/api/projects/:id/missions', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const projectId = parseInt(req.params.id);
    const { name, description, order_index } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'اسم المهمة مطلوب' });
    }

    const [project] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [projectId, req.user.id]
    );
    if (!project.length) {
      return res.status(404).json({ success: false, error: 'المشروع غير موجود أو لا يمكنك الوصول إليه' });
    }

    const [result] = await connection.execute(
      'INSERT INTO project_missions (project_id, name, description, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [projectId, name.trim(), description || '', order_index]
    );

    const [newMission] = await connection.execute(
      'SELECT id, name, description, order_index FROM project_missions WHERE id = ?',
      [result.insertId]
    );

    await connection.commit();

    console.log('Added mission for project', projectId, ':', newMission[0]);

    res.json({
      success: true,
      message: 'تم إضافة المهمة بنجاح',
      mission: newMission[0]
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding mission:', error);
    res.status(500).json({ success: false, error: 'فشل في إضافة المهمة', details: error.message });
  } finally {
    connection.release();
  }
});

// Update project status (FIXED)
app.patch('/api/projects/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Check if project exists and belongs to user
    const [existingProject] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (existingProject.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    await pool.execute(
      'UPDATE projects SET status = ? WHERE id = ? AND created_by = ?',
      [status, id, req.user.id]
    );

    res.json({
      success: true,
      message: 'تم تحديث حالة المشروع بنجاح'
    });
  } catch (error) {
    console.error('Error updating project status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث حالة المشروع',
      details: error.message 
    });
  }
});

// Update existing project with missions (FIXED)
app.patch('/api/projects/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { 
      name, 
      description, 
      startDate, 
      endDate, 
      budget, 
      location, 
      manager, 
      status,
      missions 
    } = req.body;

    // Check if project exists and belongs to user
    const [existingProject] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (existingProject.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    // Validation
    if (!name || !description || !startDate || !endDate || !location || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول المطلوبة يجب ملؤها' 
      });
    }

    if (!missions || !Array.isArray(missions) || missions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'يجب إضافة مهمة واحدة على الأقل للمشروع' 
      });
    }

    // Map status from English to Arabic
    const statusMap = {
      'pending': 'معلق',
      'active': 'جاري',
      'completed': 'مكتمل',
      'on-hold': 'معلق'
    };

    // Update project
    await connection.execute(
      `UPDATE projects SET 
        name = ?, location = ?, status = ?, budget = ?, description = ?, 
        start_date = ?, end_date = ?, manager = ?
       WHERE id = ? AND created_by = ?`,
      [
        name,
        location,
        statusMap[status] || 'معلق',
        parseFloat(budget) || 0,
        description,
        startDate,
        endDate,
        manager || '',
        id,
        req.user.id
      ]
    );

    // Delete existing missions
    await connection.execute(
      'DELETE FROM project_missions WHERE project_id = ?',
      [id]
    );

    // Create new missions
    for (const mission of missions) {
      if (mission.name && mission.name.trim()) {
        await connection.execute(
          'INSERT INTO project_missions (project_id, name, description, order_index) VALUES (?, ?, ?, ?)',
          [id, mission.name.trim(), mission.description || '', mission.order_index]
        );
      }
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'تم تحديث المشروع والمهام بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating project:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث المشروع',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// Delete a project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [projects] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );
    if (projects.length === 0) {
      return res.status(404).json({ error: 'المشروع غير موجود' });
    }

    await connection.execute('DELETE FROM projects WHERE id = ?', [id]);
    await connection.commit();
    res.json({ message: 'تم حذف المشروع بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'فشل في حذف المشروع' });
  } finally {
    connection.release();
  }
});

// Get sales endpoint
app.get('/api/sales', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const type = req.query.type || 'all';
    const status = req.query.status || 'all';
    const customer = req.query.customer || 'all';
    const projectName = req.query.projectName || '';

    let query = `
      SELECT 
        i.id,
        i.invoice_number,
        i.issue_date AS issueDate,
        i.due_date AS dueDate,
        i.total_amount AS total,
        i.status,
        c.name AS customerName,
        c.vat_number AS customerVatNumber,
        i.project_name AS projectName
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.created_by = ?
    `;

    const queryParams = [req.user.id];

    if (search) {
      query += ` AND (
        i.invoice_number LIKE ? OR
        c.name LIKE ? OR
        c.vat_number LIKE ? OR
        i.project_name LIKE ?
      )`;
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type !== 'all') {
      query += ' AND i.type = ?';
      queryParams.push(type);
    }

    if (status !== 'all') {
      query += ' AND i.status = ?';
      queryParams.push(status);
    }

    if (customer !== 'all') {
      query += ' AND c.id = ?';
      queryParams.push(customer);
    }

    if (projectName) {
      query += ' AND i.project_name = ?';
      queryParams.push(projectName);
    }

    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const [sales] = await pool.execute(query, queryParams);

    // Update count query to respect the same filters
    let countQuery = 'SELECT COUNT(*) AS total FROM invoices i WHERE i.created_by = ?';
    const countParams = [req.user.id];

    if (search) {
      countQuery += ` AND (
        i.invoice_number LIKE ? OR
        i.project_name LIKE ?
      )`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (type !== 'all') {
      countQuery += ' AND i.type = ?';
      countParams.push(type);
    }

    if (status !== 'all') {
      countQuery += ' AND i.status = ?';
      countParams.push(status);
    }

    if (customer !== 'all') {
      countQuery += ' AND i.company_id = ?';
      countParams.push(customer);
    }

    if (projectName) {
      countQuery += ' AND i.project_name = ?';
      countParams.push(projectName);
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    res.json({
      sales,
      pagination: {
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات المبيعات' });
  }
});

// Get purchases endpoint
app.get('/api/purchases', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', projectId, startDate, endDate } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT
        p.id,
        p.invoice_number,
        p.total_amount,
        p.vat_amount,
        p.notes,
        p.created_at,
        p.updated_at,
        s.name as supplier_name,
        pr.name as project_name,
        pr.id as project_id,
        pm.id as mission_id,
        pm.name as mission_name,
        u.file_name as original_file_name,
        u.file_path,
        u.file_type,
        -- Breakdown totals from invoice items
        COALESCE(breakdown.total_before_vat, 0) as breakdown_total_before_vat,
        COALESCE(breakdown.total_vat, 0) as breakdown_total_vat,
        COALESCE(breakdown.total_with_vat, 0) as breakdown_total_with_vat
      FROM purchase_invoices p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN project_missions pm ON p.mission_id = pm.id
      LEFT JOIN purchase_invoice_uploads u ON p.id = u.purchase_invoice_id
      LEFT JOIN (
        SELECT 
          purchase_invoice_id,
          SUM(quantity * price_before_vat) as total_before_vat,
          SUM(quantity * vat_amount) as total_vat,
          SUM(total_amount) as total_with_vat
        FROM purchase_invoice_products 
        GROUP BY purchase_invoice_id
      ) breakdown ON p.id = breakdown.purchase_invoice_id
      WHERE p.created_by = ?
    `;
    
    const queryParams = [req.user.id];

    // Add filters
    if (search) {
      query += ' AND (p.invoice_number LIKE ? OR s.name LIKE ? OR pr.name LIKE ? OR pm.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (projectId) {
      query += ' AND p.project_id = ?';
      queryParams.push(projectId);
    }

    if (startDate) {
      query += ' AND DATE(p.created_at) >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(p.created_at) <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY p.created_at DESC';

    if (limit !== 'all') {
      query += ' LIMIT ? OFFSET ?';
      queryParams.push(Number(limit), offset);
    }

    const [purchases] = await pool.execute(query, queryParams);

    // Process file paths and ensure mission_name is included
    const processedPurchases = purchases.map(purchase => {
      if (purchase.file_path) {
        const actualFileName = path.basename(purchase.file_path);
        purchase.file_url = `/Uploads/${actualFileName}`;
      }
      // Ensure mission_name is a string or null
      purchase.mission_name = purchase.mission_name || null;
      return {
        ...purchase,
        total_amount: parseFloat(purchase.total_amount) || 0,
        vat_amount: parseFloat(purchase.vat_amount) || 0,
        breakdown_total_before_vat: parseFloat(purchase.breakdown_total_before_vat) || 0,
        breakdown_total_vat: parseFloat(purchase.breakdown_total_vat) || 0,
        breakdown_total_with_vat: parseFloat(purchase.breakdown_total_with_vat) || 0
      };
    });

    // Debug log to verify mission_name in response
    console.log('Processed purchases:', processedPurchases.map(p => ({
      id: p.id,
      invoice_number: p.invoice_number,
      mission_id: p.mission_id,
      mission_name: p.mission_name
    })));

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM purchase_invoices p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN project_missions pm ON p.mission_id = pm.id
      WHERE p.created_by = ?
    `;
    
    const countParams = [req.user.id];
    
    if (search) {
      countQuery += ' AND (p.invoice_number LIKE ? OR s.name LIKE ? OR pr.name LIKE ? OR pm.name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (projectId) {
      countQuery += ' AND p.project_id = ?';
      countParams.push(projectId);
    }

    if (startDate) {
      countQuery += ' AND DATE(p.created_at) >= ?';
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ' AND DATE(p.created_at) <= ?';
      countParams.push(endDate);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;
    const pages = limit === 'all' ? 1 : Math.ceil(total / Number(limit));

    res.json({
      success: true,
      purchases: processedPurchases,
      pagination: { 
        total, 
        pages, 
        currentPage: Number(page), 
        limit: Number(limit) 
      }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في جلب بيانات المشتريات' 
    });
  }
});

// Get purchases by project ID
app.get('/api/projects/:projectId/purchases', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { search, startDate, endDate } = req.query;

    // First verify the project belongs to the user
    const [projectCheck] = await pool.execute(
      'SELECT id, name FROM projects WHERE id = ? AND created_by = ?',
      [projectId, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    let query = `
      SELECT
        p.id,
        p.invoice_number,
        p.total_amount,
        p.vat_amount,
        p.notes,
        p.created_at,
        p.updated_at,
        s.name as supplier_name,
        u.file_name as original_file_name,
        u.file_path,
        u.file_type,
        -- Breakdown totals from invoice items
        COALESCE(breakdown.total_before_vat, 0) as breakdown_total_before_vat,
        COALESCE(breakdown.total_vat, 0) as breakdown_total_vat,
        COALESCE(breakdown.total_with_vat, 0) as breakdown_total_with_vat
      FROM purchase_invoices p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN purchase_invoice_uploads u ON p.id = u.purchase_invoice_id
      LEFT JOIN (
        SELECT 
          purchase_invoice_id,
          SUM(quantity * price_before_vat) as total_before_vat,
          SUM(quantity * vat_amount) as total_vat,
          SUM(total_amount) as total_with_vat
        FROM purchase_invoice_products 
        GROUP BY purchase_invoice_id
      ) breakdown ON p.id = breakdown.purchase_invoice_id
      WHERE p.created_by = ? AND p.project_id = ?
    `;
    
    const queryParams = [req.user.id, projectId];

    // Add filters
    if (search) {
      query += ' AND (p.invoice_number LIKE ? OR s.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND DATE(p.created_at) >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(p.created_at) <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY p.created_at DESC';

    const [purchases] = await pool.execute(query, queryParams);

    // Process file paths to use the actual stored filename
    const processedPurchases = purchases.map(purchase => {
      if (purchase.file_path) {
        const actualFileName = path.basename(purchase.file_path);
        purchase.file_url = `/uploads/${actualFileName}`;
      }
      return purchase;
    });
    
    // Calculate totals
    const totalAmount = processedPurchases.reduce((sum, purchase) => sum + parseFloat(purchase.total_amount), 0);
    
    res.json({
      success: true,
      data: processedPurchases,
      project: projectCheck[0],
      summary: {
        totalPurchases: processedPurchases.length,
        totalAmount: totalAmount,
        averageAmount: processedPurchases.length > 0 ? totalAmount / processedPurchases.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching project purchases:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب مشتريات المشروع',
      details: error.message 
    });
  }
});

// Add purchase invoice endpoint
app.post('/api/purchases', authenticateToken, upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { 
      invoice_number, 
      supplier_name, 
      project_id, 
      mission_id, // Added mission_id
      notes,
      invoice_date,
      invoice_time 
    } = req.body;

    // Validation
    if (!invoice_number || !supplier_name || !project_id || !mission_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع والمهمة' 
      });
    }

    // Validate project_id
    const [projectCheck] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    // Validate mission_id
    const [missionCheck] = await connection.execute(
      'SELECT id FROM project_missions WHERE id = ? AND project_id = ?',
      [mission_id, project_id]
    );

    if (missionCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المهمة المحددة غير موجودة أو لا تتبع المشروع المحدد' 
      });
    }

    // Find or create supplier
    let supplierId;
    const [existingSupplier] = await connection.execute(
      'SELECT id FROM suppliers WHERE name = ? AND created_by = ?',
      [supplier_name, req.user.id]
    );

    if (existingSupplier.length > 0) {
      supplierId = existingSupplier[0].id;
    } else {
      // Create new supplier
      const [newSupplier] = await connection.execute(
        'INSERT INTO suppliers (name, created_by) VALUES (?, ?)',
        [supplier_name, req.user.id]
      );
      supplierId = newSupplier.insertId;
    }

    // Create datetime from date and time
    let createdAt = new Date();
    if (invoice_date && invoice_time) {
      createdAt = new Date(`${invoice_date}T${invoice_time}:00`);
    }

    // Create purchase invoice record
    const [result] = await connection.execute(
      `INSERT INTO purchase_invoices (
        invoice_number, 
        total_amount,
        vat_amount,
        supplier_id,
        project_id,
        mission_id,
        notes,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice_number,
        0, // Set to 0 until breakdown
        0, // VAT amount set to 0
        supplierId,
        project_id,
        mission_id, // Added mission_id
        notes || null,
        req.user.id,
        createdAt
      ]
    );

    const purchaseInvoiceId = result.insertId;

    // If file was uploaded, create upload record
    if (req.file) {
      await connection.execute(
        `INSERT INTO purchase_invoice_uploads (
          purchase_invoice_id,
          file_name,
          file_path,
          file_type,
          file_size,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          purchaseInvoiceId,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          req.user.id,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      message: 'تم إضافة الفاتورة بنجاح',
      purchaseId: purchaseInvoiceId,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding purchase:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في إضافة الفاتورة' 
    });
  } finally {
    connection.release();
  }
});

// Add endpoint to serve uploaded files
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'الملف غير موجود' });
  }
});


// Delete purchase invoice endpoint
app.delete('/api/purchases/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if purchase exists and belongs to user
    const [purchase] = await connection.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (purchase.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    // Fetch associated uploads to delete the file from disk
    const [uploads] = await connection.execute(
      'SELECT file_path FROM purchase_invoice_uploads WHERE purchase_invoice_id = ?',
      [id]
    );

    // Delete associated uploads from database
    await connection.execute(
      'DELETE FROM purchase_invoice_uploads WHERE purchase_invoice_id = ?',
      [id]
    );

    // Delete purchase invoice
    await connection.execute('DELETE FROM purchase_invoices WHERE id = ?', [id]);

    // Delete the file from disk if it exists
    for (const upload of uploads) {
      if (upload.file_path) {
        try {
          await fs.unlink(upload.file_path); // Delete the file
          console.log(`Deleted file: ${upload.file_path}`);
        } catch (fileError) {
          console.error(`Error deleting file ${upload.file_path}:`, fileError);
          // Optionally handle the error (e.g., log it, but don't fail the request)
        }
      }
    }

    await connection.commit();
    res.json({ message: 'تم حذف الفاتورة بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'فشل في حذف الفاتورة' });
  } finally {
    connection.release();
  }
});

// Get single purchase invoice with details
app.get('/api/purchases/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch purchase invoice details with all related information
    const [purchase] = await pool.execute(
      `SELECT
        p.id,
        p.invoice_number,
        p.total_amount,
        p.vat_amount,
        p.notes,
        p.created_at,
        p.updated_at,
        s.name as supplier_name,
        pr.name as project_name,
        pr.id as project_id,
        pm.id as mission_id,
        pm.name as mission_name,
        u.file_name as original_file_name,
        u.file_path,
        u.file_type
      FROM purchase_invoices p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN project_missions pm ON p.mission_id = pm.id
      LEFT JOIN purchase_invoice_uploads u ON p.id = u.purchase_invoice_id
      WHERE p.id = ? AND p.created_by = ?`,
      [id, req.user.id]
    );

    if (purchase.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    const purchaseData = purchase[0];

    // Add file URL and ensure mission_name is included
    if (purchaseData.file_path) {
      const actualFileName = path.basename(purchaseData.file_path);
      purchaseData.file_url = `/Uploads/${actualFileName}`;
    }
    purchaseData.mission_name = purchaseData.mission_name || null;
    purchaseData.total_amount = parseFloat(purchaseData.total_amount) || 0;
    purchaseData.vat_amount = parseFloat(purchaseData.vat_amount) || 0;

    // Debug log to verify mission_name in response
    console.log('Single purchase:', {
      id: purchaseData.id,
      invoice_number: purchaseData.invoice_number,
      mission_id: purchaseData.mission_id,
      mission_name: purchaseData.mission_name
    });

    res.json({
      success: true,
      data: purchaseData
    });
  } catch (error) {
    console.error('Error fetching purchase details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في جلب تفاصيل الفاتورة' 
    });
  }
});

// Get invoice items for breakdown
app.get('/api/purchases/:id/items', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // First verify the invoice belongs to the user
    const [invoiceCheck] = await pool.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Fetch invoice items
    const [items] = await pool.execute(
      `SELECT 
        id,
        name,
        code,
        quantity,
        price_before_vat,
        vat_rate,
        vat_amount,
        price_with_vat,
        total_amount,
        created_at,
        updated_at
      FROM purchase_invoice_products 
      WHERE purchase_invoice_id = ?
      ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Error fetching invoice items:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في جلب عناصر الفاتورة' 
    });
  }
});

// Save/Update invoice items with automatic product saving
app.post('/api/purchases/:id/items', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { items } = req.body;

    // Verify the invoice belongs to the user
    const [invoiceCheck] = await connection.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'يجب إضافة عنصر واحد على الأقل' 
      });
    }

    // Validate each item
    for (const item of items) {
      if (!item.name || !item.name.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'اسم العنصر مطلوب' 
        });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'الكمية يجب أن تكون أكبر من صفر' 
        });
      }
      if (item.price_before_vat < 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'السعر لا يمكن أن يكون سالباً' 
        });
      }
    }

    // Delete existing items for this invoice
    await connection.execute(
      'DELETE FROM purchase_invoice_products WHERE purchase_invoice_id = ?',
      [id]
    );

    // Insert new items
    for (const item of items) {
      // Calculate values
      const quantity = parseInt(item.quantity) || 1;
      const priceBeforeVat = parseFloat(item.price_before_vat) || 0;
      const vatRate = parseFloat(item.vat_rate) || 15;
      const vatAmount = (priceBeforeVat * vatRate) / 100;
      const priceWithVat = priceBeforeVat + vatAmount;
      const totalAmount = quantity * priceWithVat;

      await connection.execute(
        `INSERT INTO purchase_invoice_products (
          purchase_invoice_id,
          name,
          code,
          quantity,
          price_before_vat,
          vat_rate,
          vat_amount,
          price_with_vat,
          total_amount,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.name.trim(),
          item.code?.trim() || '',
          quantity,
          priceBeforeVat,
          vatRate,
          vatAmount,
          priceWithVat,
          totalAmount,
          req.user.id
        ]
      );
    }

    // Calculate and update breakdown totals
    const [totals] = await connection.execute(
      `SELECT 
        SUM(quantity * price_before_vat) as total_before_vat,
        SUM(quantity * vat_amount) as total_vat,
        SUM(total_amount) as total_with_vat
      FROM purchase_invoice_products 
      WHERE purchase_invoice_id = ?`,
      [id]
    );

    const breakdown = totals[0] || {
      total_before_vat: 0,
      total_vat: 0,
      total_with_vat: 0
    };

    // Update the purchase invoice with breakdown totals
    await connection.execute(
      `UPDATE purchase_invoices 
       SET 
         breakdown_total_before_vat = ?,
         breakdown_total_vat = ?,
         breakdown_total_with_vat = ?
       WHERE id = ?`,
      [
        breakdown.total_before_vat || 0,
        breakdown.total_vat || 0,
        breakdown.total_with_vat || 0,
        id
      ]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'تم حفظ عناصر الفاتورة بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving invoice items:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في حفظ عناصر الفاتورة' 
    });
  } finally {
    connection.release();
  }
});

// Delete specific invoice item
app.delete('/api/purchases/:invoiceId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId, itemId } = req.params;

    // Verify the invoice belongs to the user
    const [invoiceCheck] = await pool.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [invoiceId, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Delete the item
    const [result] = await pool.execute(
      'DELETE FROM purchase_invoice_products WHERE id = ? AND purchase_invoice_id = ?',
      [itemId, invoiceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'العنصر غير موجود' 
      });
    }

    res.json({
      success: true,
      message: 'تم حذف العنصر بنجاح'
    });
  } catch (error) {
    console.error('Error deleting invoice item:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في حذف العنصر' 
    });
  }
});

// Get invoice summary with items count
app.get('/api/purchases/:id/summary', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the invoice belongs to the user
    const [invoiceCheck] = await pool.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Get items summary
    const [summary] = await pool.execute(
      `SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(quantity * price_before_vat) as total_before_vat,
        SUM(quantity * vat_amount) as total_vat,
        SUM(total_amount) as total_with_vat
      FROM purchase_invoice_products 
      WHERE purchase_invoice_id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: summary[0] || {
        total_items: 0,
        total_quantity: 0,
        total_before_vat: 0,
        total_vat: 0,
        total_with_vat: 0
      }
    });
  } catch (error) {
    console.error('Error fetching invoice summary:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في جلب ملخص الفاتورة' 
    });
  }
});

// Update purchase invoice
app.put('/api/purchases/:id', authenticateToken, upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { 
      invoice_number, 
      total_amount, 
      supplier_name, 
      project_id, 
      notes,
      invoice_date,
      invoice_time 
    } = req.body;

    // Check if purchase exists and belongs to user
    const [existingPurchase] = await connection.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (existingPurchase.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Validation
    if (!invoice_number || !total_amount || !supplier_name || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع' 
      });
    }

    // Validate project_id
    const [projectCheck] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    // Find or create supplier
    let supplierId;
    const [existingSupplier] = await connection.execute(
      'SELECT id FROM suppliers WHERE name = ? AND created_by = ?',
      [supplier_name, req.user.id]
    );

    if (existingSupplier.length > 0) {
      supplierId = existingSupplier[0].id;
    } else {
      // Create new supplier
      const [newSupplier] = await connection.execute(
        'INSERT INTO suppliers (name, created_by) VALUES (?, ?)',
        [supplier_name, req.user.id]
      );
      supplierId = newSupplier.insertId;
    }

    // Create datetime from date and time
    let updatedAt = new Date();
    if (invoice_date && invoice_time) {
      updatedAt = new Date(`${invoice_date}T${invoice_time}:00`);
    }

    // Update purchase invoice (REMOVED vat_amount)
    await connection.execute(
      `UPDATE purchase_invoices 
       SET invoice_number = ?, total_amount = ?, supplier_id = ?, project_id = ?, notes = ?, updated_at = ?
       WHERE id = ? AND created_by = ?`,
      [
        invoice_number,
        parseFloat(total_amount),
        supplierId,
        project_id,
        notes || null,
        updatedAt,
        id,
        req.user.id
      ]
    );

    // If new file was uploaded, replace the old one
    if (req.file) {
      // Delete old upload record and file
      const [oldUploads] = await connection.execute(
        'SELECT file_path FROM purchase_invoice_uploads WHERE purchase_invoice_id = ?',
        [id]
      );

      await connection.execute(
        'DELETE FROM purchase_invoice_uploads WHERE purchase_invoice_id = ?',
        [id]
      );

      // Delete old files from disk
      for (const upload of oldUploads) {
        if (upload.file_path) {
          try {
            await fs.unlink(upload.file_path);
          } catch (fileError) {
            console.error(`Error deleting old file ${upload.file_path}:`, fileError);
          }
        }
      }

      // Create new upload record
      await connection.execute(
        `INSERT INTO purchase_invoice_uploads (
          purchase_invoice_id,
          file_name,
          file_path,
          file_type,
          file_size,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          req.user.id,
        ]
      );
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'تم تحديث الفاتورة بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating purchase:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحديث الفاتورة' 
    });
  } finally {
    connection.release();
  }
});

// Add endpoint to update breakdown totals after invoice breakdown is saved
app.post('/api/purchases/:id/update-totals', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the invoice belongs to the user
    const [invoiceCheck] = await pool.execute(
      'SELECT id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    // Calculate totals from breakdown items
    const [totals] = await pool.execute(
      `SELECT 
        SUM(quantity * price_before_vat) as total_before_vat,
        SUM(quantity * vat_amount) as total_vat,
        SUM(total_amount) as total_with_vat
      FROM purchase_invoice_products 
      WHERE purchase_invoice_id = ?`,
      [id]
    );

    const breakdown = totals[0] || {
      total_before_vat: 0,
      total_vat: 0,
      total_with_vat: 0
    };

    // Update the purchase invoice with breakdown totals
    await pool.execute(
      `UPDATE purchase_invoices 
       SET 
         breakdown_total_before_vat = ?,
         breakdown_total_vat = ?,
         breakdown_total_with_vat = ?
       WHERE id = ?`,
      [
        breakdown.total_before_vat || 0,
        breakdown.total_vat || 0,
        breakdown.total_with_vat || 0,
        id
      ]
    );

    res.json({
      success: true,
      message: 'تم تحديث إجماليات الفاتورة بنجاح',
      totals: breakdown
    });
  } catch (error) {
    console.error('Error updating breakdown totals:', error);
    res.status(500).json({ 
      success: false, 
      error: 'فشل في تحديث إجماليات الفاتورة' 
    });
  }
});

//installations Endpoint APIs

// Get all installations for authenticated user
app.get('/api/installations', authenticateToken, async (req, res) => {
  try {
    const { search, startDate, endDate, projectId } = req.query;
    
    let query = `
      SELECT 
        i.id, 
        i.name, 
        i.quantity, 
        i.price, 
        i.date, 
        i.notes, 
        i.created_at, 
        i.updated_at,
        i.project_id,
        i.is_paid,
        i.payment_status,
        i.paid_amount,
        i.remaining_amount,
        p.name as project_name
      FROM installations i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.created_by = ?
    `;
    const queryParams = [req.user.id];

    // Add filters
    if (search) {
      query += ' AND (i.name LIKE ? OR p.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND i.date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND i.date <= ?';
      queryParams.push(endDate);
    }

    if (projectId) {
      query += ' AND i.project_id = ?';
      queryParams.push(projectId);
    }

    query += ' ORDER BY i.date DESC, i.created_at DESC';

    const [installations] = await pool.execute(query, queryParams);
    
    // Calculate totals
    const totalAmount = installations.reduce((sum, installation) => 
      sum + (parseFloat(installation.quantity) * parseFloat(installation.price)), 0);
    
    res.json({
      success: true,
      data: installations,
      summary: {
        totalInstallations: installations.length,
        totalAmount: totalAmount,
        averageAmount: installations.length > 0 ? totalAmount / installations.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching installations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب التركيبات',
      details: error.message 
    });
  }
});

// Create new installation
app.post('/api/installations', authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      quantity, 
      price, 
      date, 
      notes, 
      project_id,
      is_paid,
      payment_status,
      paid_amount,
      remaining_amount
    } = req.body;

    // Validation
    if (!name || !quantity || !price || !date || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع' 
      });
    }

    if (isNaN(quantity) || parseInt(quantity) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'الكمية يجب أن تكون رقماً موجباً' 
      });
    }

    if (isNaN(price) || parseFloat(price) < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'السعر يجب أن يكون رقماً غير سالب' 
      });
    }

    // Validate payment information if paid
    if (is_paid) {
      if (!payment_status || payment_status === 'unpaid') {
        return res.status(400).json({ 
          success: false, 
          error: 'يجب تحديد حالة الدفع' 
        });
      }
      
      if (!paid_amount || parseFloat(paid_amount) <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'يجب إدخال المبلغ المدفوع' 
        });
      }
      
      const totalAmount = parseFloat(quantity) * parseFloat(price);
      const paidAmountValue = parseFloat(paid_amount);
      
      if (paidAmountValue > totalAmount) {
        return res.status(400).json({ 
          success: false, 
          error: 'المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي المبلغ' 
        });
      }
    }

    // Validate date format
    const installationDate = new Date(date);
    if (isNaN(installationDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'تاريخ غير صالح' 
      });
    }

    // Validate project_id
    const [projectCheck] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO installations 
       (name, quantity, price, date, notes, project_id, is_paid, payment_status, paid_amount, remaining_amount, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        parseInt(quantity), 
        parseFloat(price), 
        date, 
        notes || null, 
        project_id,
        is_paid || false,
        payment_status || 'unpaid',
        paid_amount ? parseFloat(paid_amount) : 0,
        remaining_amount ? parseFloat(remaining_amount) : 0,
        req.user.id
      ]
    );

    // Get the created installation with project info
    const [newInstallation] = await pool.execute(
      `SELECT 
        i.*, 
        p.name as project_name 
       FROM installations i
       LEFT JOIN projects p ON i.project_id = p.id
       WHERE i.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'تم إضافة التركيب بنجاح',
      data: newInstallation[0]
    });
  } catch (error) {
    console.error('Error creating installation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في إضافة التركيب',
      details: error.message 
    });
  }
});

// Update installation
app.put('/api/installations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      quantity, 
      price, 
      date, 
      notes, 
      project_id,
      is_paid,
      payment_status,
      paid_amount,
      remaining_amount
    } = req.body;

    // Check if installation exists and belongs to user
    const [existingInstallation] = await pool.execute(
      'SELECT id FROM installations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (existingInstallation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'التركيب غير موجود' 
      });
    }

    // Validation
    if (!name || !quantity || !price || !date || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع' 
      });
    }

    if (isNaN(quantity) || parseInt(quantity) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'الكمية يجب أن تكون رقماً موجباً' 
      });
    }

    if (isNaN(price) || parseFloat(price) < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'السعر يجب أن يكون رقماً غير سالب' 
      });
    }

    // Validate payment information if paid
    if (is_paid) {
      if (!payment_status || payment_status === 'unpaid') {
        return res.status(400).json({ 
          success: false, 
          error: 'يجب تحديد حالة الدفع' 
        });
      }
      
      if (!paid_amount || parseFloat(paid_amount) <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'يجب إدخال المبلغ المدفوع' 
        });
      }
      
      const totalAmount = parseFloat(quantity) * parseFloat(price);
      const paidAmountValue = parseFloat(paid_amount);
      
      if (paidAmountValue > totalAmount) {
        return res.status(400).json({ 
          success: false, 
          error: 'المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي المبلغ' 
        });
      }
    }

    // Validate date format
    const installationDate = new Date(date);
    if (isNaN(installationDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'تاريخ غير صالح' 
      });
    }

    // Validate project_id
    const [projectCheck] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    await pool.execute(
      `UPDATE installations 
       SET name = ?, quantity = ?, price = ?, date = ?, notes = ?, project_id = ?, 
           is_paid = ?, payment_status = ?, paid_amount = ?, remaining_amount = ?
       WHERE id = ? AND created_by = ?`,
      [
        name, 
        parseInt(quantity), 
        parseFloat(price), 
        date, 
        notes || null, 
        project_id,
        is_paid || false,
        payment_status || 'unpaid',
        paid_amount ? parseFloat(paid_amount) : 0,
        remaining_amount ? parseFloat(remaining_amount) : 0,
        id, 
        req.user.id
      ]
    );

    // Get the updated installation with project info
    const [updatedInstallation] = await pool.execute(
      `SELECT 
        i.*, 
        p.name as project_name 
       FROM installations i
       LEFT JOIN projects p ON i.project_id = p.id
       WHERE i.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'تم تحديث التركيب بنجاح',
      data: updatedInstallation[0]
    });
  } catch (error) {
    console.error('Error updating installation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث التركيب',
      details: error.message 
    });
  }
});

// Delete installation
app.delete('/api/installations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if installation exists and belongs to user
    const [existingInstallation] = await pool.execute(
      'SELECT id FROM installations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (existingInstallation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'التركيب غير موجود' 
      });
    }

    await pool.execute(
      'DELETE FROM installations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    res.json({
      success: true,
      message: 'تم حذف التركيب بنجاح'
    });
  } catch (error) {
    console.error('Error deleting installation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في حذف التركيب',
      details: error.message 
    });
  }
});

// Bulk create installations
app.post('/api/installations/bulk', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { installations, date, project_id, is_paid, payment_status, paid_amount, remaining_amount } = req.body;

    if (!installations || !Array.isArray(installations) || installations.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'يجب إضافة تركيب واحد على الأقل' 
      });
    }

    if (!date || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'التاريخ والمشروع مطلوبان' 
      });
    }

    // Validate project belongs to user
    const [projectCheck] = await connection.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    // Calculate total amount
    const totalAmount = installations.reduce((sum, inst) => 
      sum + (parseFloat(inst.quantity) * parseFloat(inst.price)), 0);

    // Update company balance if paid
    if (is_paid && payment_status) {
      const amountToAdd = payment_status === 'full' ? totalAmount : parseFloat(paid_amount) || 0;
      
      if (amountToAdd > 0) {
        // Add to company balance
        await connection.execute(
          `UPDATE company_settings 
           SET current_balance = current_balance + ?
           WHERE user_id = ?`,
          [amountToAdd, req.user.id]
        );
      }
    }

    // Insert all installations
    const insertPromises = installations.map(installation => 
      connection.execute(
        `INSERT INTO installations (name, quantity, price, date, notes, project_id, created_by, is_paid, payment_status, paid_amount, remaining_amount) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          installation.name,
          parseInt(installation.quantity),
          parseFloat(installation.price),
          date,
          installation.notes || null,
          project_id,
          req.user.id,
          is_paid || false,
          payment_status || 'unpaid',
          is_paid ? (parseFloat(paid_amount) || 0) : 0,
          is_paid && payment_status === 'partial' ? (parseFloat(remaining_amount) || 0) : 0
        ]
      )
    );

    await Promise.all(insertPromises);
    await connection.commit();

    res.status(201).json({
      success: true,
      message: `تم إضافة ${installations.length} تركيب بنجاح`
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating bulk installations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في إضافة التركيبات',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});


// Get installations by project ID
app.get('/api/projects/:projectId/installations', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { search, startDate, endDate } = req.query;

    // First verify the project belongs to the user
    const [projectCheck] = await pool.execute(
      'SELECT id, name FROM projects WHERE id = ? AND created_by = ?',
      [projectId, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    let query = `
      SELECT id, name, quantity, price, date, notes, created_at, updated_at
      FROM installations 
      WHERE created_by = ? AND project_id = ?
    `;
    const queryParams = [req.user.id, projectId];

    // Add filters
    if (search) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${search}%`);
    }

    if (startDate) {
      query += ' AND date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const [installations] = await pool.execute(query, queryParams);
    
    // Calculate totals
    const totalAmount = installations.reduce((sum, installation) => 
      sum + (parseFloat(installation.quantity) * parseFloat(installation.price)), 0);
    
    res.json({
      success: true,
      data: installations,
      project: projectCheck[0],
      summary: {
        totalInstallations: installations.length,
        totalAmount: totalAmount,
        averageAmount: installations.length > 0 ? totalAmount / installations.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching project installations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب تركيبات المشروع',
      details: error.message 
    });
  }
});

// Get missions for a specific project (FIXED)
app.get('/api/projects/:projectId/missions', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Verify project belongs to user
    const [projectCheck] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [projectId, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    const [missions] = await pool.execute(
      'SELECT id, name, description, order_index FROM project_missions WHERE project_id = ? ORDER BY order_index ASC',
      [projectId]
    );

    res.json({
      success: true,
      data: missions
    });
  } catch (error) {
    console.error('Error fetching project missions:', error);
    res.status(500).json({ 
      success: false,
      error: 'فشل في جلب مهام المشروع' 
    });
  }
});

// Get projects with their missions for dropdown (FIXED)
app.get('/api/projects/with-missions', authenticateToken, async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    let query = `
      SELECT 
        p.id, 
        p.name,
        JSON_ARRAYAGG(
          CASE 
            WHEN pm.id IS NOT NULL THEN
              JSON_OBJECT(
                'id', pm.id,
                'name', pm.name,
                'description', pm.description,
                'order_index', pm.order_index
              )
            ELSE NULL
          END
        ) as missions
      FROM projects p
      LEFT JOIN project_missions pm ON p.id = pm.project_id
      WHERE p.created_by = ?
    `;
    const queryParams = [req.user.id];
    
    if (search) {
      query += ' AND p.name LIKE ?';
      queryParams.push(`%${search}%`);
    }
    
    query += ' GROUP BY p.id, p.name ORDER BY p.name ASC LIMIT 50';
    
    const [projects] = await pool.execute(query, queryParams);

    // Process the results to handle JSON parsing and filter out null missions
    const processedProjects = projects.map(project => {
      let missions = [];
      if (project.missions) {
        try {
          const parsedMissions = JSON.parse(project.missions);
          missions = parsedMissions.filter(m => m !== null && m.id !== null);
        } catch (e) {
          missions = [];
        }
      }
      return {
        ...project,
        missions
      };
    });

    res.json({
      success: true,
      data: processedProjects
    });
  } catch (error) {
    console.error('Error fetching projects with missions:', error);
    res.status(500).json({ 
      success: false,
      error: 'فشل في جلب بيانات المشاريع والمهام' 
    });
  }
});

// Simple projects dropdown endpoint (using your existing pattern)
app.get('/api/projects/simple', authenticateToken, async (req, res) => {
  try {
    const [projects] = await pool.execute(
      'SELECT id, name FROM projects WHERE created_by = ? ORDER BY name ASC',
      [req.user.id]
    );

    res.json({
      success: true,
      projects: projects  // Using the same format as your existing API
    });
  } catch (error) {
    console.error('Error fetching projects for dropdown:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب قائمة المشاريع',
      details: error.message 
    });
  }
});

// Get detailed projects with expenses totals (FIXED)
app.get('/api/projects/detailed', authenticateToken, async (req, res) => {
  try {
    const [projects] = await pool.execute(`
      SELECT 
        p.id,
        p.name,
        p.location,
        p.progress,
        p.status,
        p.budget,
        p.spent,
        p.description,
        p.start_date,
        p.end_date,
        p.manager,
        p.created_at,
        p.updated_at,
        -- Calculate total expenses from miscellaneous_expenses
        COALESCE(SUM(me.amount), 0) as total_expenses,
        -- Calculate total purchases from purchase_invoices
        COALESCE(SUM(CASE 
          WHEN pi.breakdown_total_with_vat > 0 THEN pi.breakdown_total_with_vat 
          ELSE pi.total_amount 
        END), 0) as total_purchases,
        -- Calculate total installations
        COALESCE(SUM(inst.quantity * inst.price), 0) as total_installations,
        -- Calculate total project cost
        (COALESCE(SUM(me.amount), 0) + 
         COALESCE(SUM(CASE 
           WHEN pi.breakdown_total_with_vat > 0 THEN pi.breakdown_total_with_vat 
           ELSE pi.total_amount 
         END), 0) + 
         COALESCE(SUM(inst.quantity * inst.price), 0)) as total_project_cost
      FROM projects p
      LEFT JOIN miscellaneous_expenses me ON p.id = me.project_id
      LEFT JOIN purchase_invoices pi ON p.id = pi.project_id
      LEFT JOIN installations inst ON p.id = inst.project_id
      WHERE p.created_by = ?
      GROUP BY p.id, p.name, p.location, p.progress, p.status, p.budget, p.spent, 
               p.description, p.start_date, p.end_date, p.manager, p.created_at, p.updated_at
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    // Get missions for each project
    for (let project of projects) {
      const [missions] = await pool.execute(
        'SELECT id, name, description, order_index FROM project_missions WHERE project_id = ? ORDER BY order_index ASC',
        [project.id]
      );
      project.missions = missions;
    }

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Error fetching detailed projects:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب تفاصيل المشاريع',
      details: error.message 
    });
  }
});

// Get expenses by project ID
app.get('/api/projects/:projectId/expenses', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { search, startDate, endDate, category } = req.query;

    // First verify the project belongs to the user
    const [projectCheck] = await pool.execute(
      'SELECT id, name FROM projects WHERE id = ? AND created_by = ?',
      [projectId, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المشروع غير موجود' 
      });
    }

    let query = `
      SELECT id, description, amount, category, date, payment_method, notes, created_at, updated_at
      FROM miscellaneous_expenses 
      WHERE user_id = ? AND project_id = ?
    `;
    const queryParams = [req.user.id, projectId];

    // Add filters
    if (category) {
      query += ' AND category = ?';
      queryParams.push(category);
    }

    if (search) {
      query += ' AND (description LIKE ? OR category LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const [expenses] = await pool.execute(query, queryParams);
    
    // Calculate totals
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({
      success: true,
      data: expenses,
      project: projectCheck[0],
      summary: {
        totalExpenses: expenses.length,
        totalAmount: totalAmount,
        averageAmount: expenses.length > 0 ? totalAmount / expenses.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching project expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب مصروفات المشروع',
      details: error.message 
    });
  }
});

// Get unassigned expenses (expenses without project)
app.get('/api/expenses/unassigned', authenticateToken, async (req, res) => {
  try {
    const { search, startDate, endDate, category } = req.query;

    let query = `
      SELECT id, description, amount, category, date, payment_method, notes, created_at, updated_at
      FROM miscellaneous_expenses 
      WHERE user_id = ? AND project_id IS NULL
    `;
    const queryParams = [req.user.id];

    // Add filters
    if (category) {
      query += ' AND category = ?';
      queryParams.push(category);
    }

    if (search) {
      query += ' AND (description LIKE ? OR category LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const [expenses] = await pool.execute(query, queryParams);
    
    // Calculate totals
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({
      success: true,
      data: expenses,
      summary: {
        totalExpenses: expenses.length,
        totalAmount: totalAmount,
        averageAmount: expenses.length > 0 ? totalAmount / expenses.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching unassigned expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب المصروفات غير المخصصة',
      details: error.message 
    });
  }
});

// Get single miscellaneous expense
app.get('/api/miscellaneous-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [expenses] = await pool.execute(
      'SELECT * FROM miscellaneous_expenses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (expenses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المصروف غير موجود' 
      });
    }

    res.json({
      success: true,
      data: expenses[0]
    });
  } catch (error) {
    console.error('Error fetching miscellaneous expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب المصروف',
      details: error.message 
    });
  }
});

// Get all miscellaneous expenses for authenticated user
app.get('/api/miscellaneous-expenses', authenticateToken, async (req, res) => {
  try {
    const { category, search, startDate, endDate, projectId } = req.query;
    let query = `
      SELECT 
        me.id, 
        me.description, 
        me.amount, 
        me.category, 
        me.date, 
        me.payment_method, 
        me.notes, 
        me.created_at, 
        me.updated_at,
        me.project_id,
        p.name as project_name
      FROM miscellaneous_expenses me
      LEFT JOIN projects p ON me.project_id = p.id
      WHERE me.user_id = ?
    `;
    const queryParams = [req.user.id];

    // Add filters
    if (category) {
      query += ' AND me.category = ?';
      queryParams.push(category);
    }

    if (search) {
      query += ' AND (me.description LIKE ? OR me.category LIKE ? OR p.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND me.date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND me.date <= ?';
      queryParams.push(endDate);
    }

    if (projectId) {
      if (projectId === 'unassigned') {
        query += ' AND me.project_id IS NULL';
      } else {
        query += ' AND me.project_id = ?';
        queryParams.push(projectId);
      }
    }

    query += ' ORDER BY me.date DESC, me.created_at DESC';

    const [expenses] = await pool.execute(query, queryParams);
    
    // Calculate totals
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({
      success: true,
      data: expenses,
      summary: {
        totalExpenses: expenses.length,
        totalAmount: totalAmount,
        averageAmount: expenses.length > 0 ? totalAmount / expenses.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching miscellaneous expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب المصروفات المتفرقة',
      details: error.message 
    });
  }
});

// Create new miscellaneous expense
app.post('/api/miscellaneous-expenses', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { description, amount, category, date, payment_method, notes, project_id } = req.body;

    // Validation
    if (!description || !amount || !category || !date || !payment_method || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المبلغ يجب أن يكون رقماً موجباً' 
      });
    }

    // Validate project_id
    const [projectCheck] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    // Prepare file data
    let fileData = {
      original_file_name: null,
      file_path: null,
      file_type: null,
      file_size: null
    };

    if (req.file) {
      fileData = {
        original_file_name: req.file.originalname,
        file_path: req.file.path,
        file_type: req.file.mimetype,
        file_size: req.file.size
      };
    }

    const [result] = await pool.execute(
      `INSERT INTO miscellaneous_expenses 
       (user_id, description, amount, category, date, payment_method, notes, project_id, original_file_name, file_path, file_type, file_size) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, 
        description, 
        parseFloat(amount), 
        category, 
        date, 
        payment_method, 
        notes || null, 
        project_id,
        fileData.original_file_name,
        fileData.file_path,
        fileData.file_type,
        fileData.file_size
      ]
    );

    // Get the created expense with project info
    const [newExpense] = await pool.execute(
      `SELECT 
        me.*, 
        p.name as project_name 
       FROM miscellaneous_expenses me
       LEFT JOIN projects p ON me.project_id = p.id
       WHERE me.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'تم إضافة المصروف بنجاح',
      data: newExpense[0]
    });
  } catch (error) {
    console.error('Error creating miscellaneous expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في إضافة المصروف',
      details: error.message 
    });
  }
});

// Update miscellaneous expense
app.put('/api/miscellaneous-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, category, date, payment_method, notes, project_id } = req.body;

    // Check if expense exists and belongs to user
    const [existingExpense] = await pool.execute(
      'SELECT id FROM miscellaneous_expenses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existingExpense.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المصروف غير موجود' 
      });
    }

    // Validation - project_id is now required
    if (!description || !amount || !category || !date || !payment_method || !project_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة بما في ذلك المشروع' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المبلغ يجب أن يكون رقماً موجباً' 
      });
    }

    // Validate date format
    const expenseDate = new Date(date);
    if (isNaN(expenseDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'تاريخ غير صالح' 
      });
    }

    // Validate project_id - it's required now
    const [projectCheck] = await pool.execute(
      'SELECT id FROM projects WHERE id = ? AND created_by = ?',
      [project_id, req.user.id]
    );

    if (projectCheck.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المشروع المحدد غير موجود' 
      });
    }

    await pool.execute(
      `UPDATE miscellaneous_expenses 
       SET description = ?, amount = ?, category = ?, date = ?, payment_method = ?, notes = ?, project_id = ?
       WHERE id = ? AND user_id = ?`,
      [description, parseFloat(amount), category, date, payment_method, notes || null, project_id, id, req.user.id]
    );

    // Get the updated expense with project info
    const [updatedExpense] = await pool.execute(
      `SELECT 
        me.*, 
        p.name as project_name 
       FROM miscellaneous_expenses me
       LEFT JOIN projects p ON me.project_id = p.id
       WHERE me.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'تم تحديث المصروف بنجاح',
      data: updatedExpense[0]
    });
  } catch (error) {
    console.error('Error updating miscellaneous expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث المصروف',
      details: error.message 
    });
  }
});

// Delete miscellaneous expense
app.delete('/api/miscellaneous-expenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense exists and belongs to user
    const [existingExpense] = await pool.execute(
      'SELECT id FROM miscellaneous_expenses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existingExpense.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المصروف غير موجود' 
      });
    }

    await pool.execute(
      'DELETE FROM miscellaneous_expenses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({
      success: true,
      message: 'تم حذف المصروف بنجاح'
    });
  } catch (error) {
    console.error('Error deleting miscellaneous expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في حذف المصروف',
      details: error.message 
    });
  }
});

// Get expense categories (for dropdown)
app.get('/api/miscellaneous-expenses', authenticateToken, async (req, res) => {
  try {
    const { category, search, startDate, endDate, projectId } = req.query;
    let query = `
      SELECT 
        me.id, 
        me.description, 
        me.amount, 
        me.category, 
        me.date, 
        me.payment_method, 
        me.notes, 
        me.created_at, 
        me.updated_at,
        me.project_id,
        me.original_file_name,
        me.file_path,
        me.file_type,
        me.file_size,
        p.name as project_name
      FROM miscellaneous_expenses me
      LEFT JOIN projects p ON me.project_id = p.id
      WHERE me.user_id = ?
    `;
    const queryParams = [req.user.id];

    // Add filters
    if (category) {
      query += ' AND me.category = ?';
      queryParams.push(category);
    }

    if (search) {
      query += ' AND (me.description LIKE ? OR me.category LIKE ? OR p.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND me.date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND me.date <= ?';
      queryParams.push(endDate);
    }

    if (projectId) {
      if (projectId === 'unassigned') {
        query += ' AND me.project_id IS NULL';
      } else {
        query += ' AND me.project_id = ?';
        queryParams.push(projectId);
      }
    }

    query += ' ORDER BY me.date DESC, me.created_at DESC';

    const [expenses] = await pool.execute(query, queryParams);
    
    // Process file paths
    const processedExpenses = expenses.map(expense => {
      if (expense.file_path) {
        const actualFileName = path.basename(expense.file_path);
        expense.file_url = `/uploads/${actualFileName}`;
      }
      return expense;
    });
    
    // Calculate totals
    const totalAmount = processedExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({
      success: true,
      data: processedExpenses,
      summary: {
        totalExpenses: processedExpenses.length,
        totalAmount: totalAmount,
        averageAmount: processedExpenses.length > 0 ? totalAmount / processedExpenses.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching miscellaneous expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب المصروفات المتفرقة',
      details: error.message 
    });
  }
});


// Get company balance
app.get('/api/company-balance', authenticateToken, async (req, res) => {
  try {
    // 1. Get or create company settings
    let [settings] = await pool.execute(
      'SELECT * FROM company_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (settings.length === 0) {
      await pool.execute(
        'INSERT INTO company_settings (user_id, company_name, initial_balance, current_balance) VALUES (?, ?, ?, ?)',
        [req.user.id, 'الشركة', 0, 0]
      );
      [settings] = await pool.execute(
        'SELECT * FROM company_settings WHERE user_id = ?',
        [req.user.id]
      );
    }

    const companySetting = settings[0];

    // 2. Query each total independently to avoid JOIN multiplication
    const [[invoiceRow]] = await pool.execute(
      `SELECT COALESCE(SUM(total_amount), 0) AS invoice_income
       FROM invoices
       WHERE created_by = ? AND status = 'paid'`,
      [req.user.id]
    );

    const [[installationRow]] = await pool.execute(
      `SELECT COALESCE(SUM(paid_amount), 0) AS installation_income
       FROM installations
       WHERE created_by = ? AND is_paid = 1`,
      [req.user.id]
    );

    const [[purchaseRow]] = await pool.execute(
      `SELECT COALESCE(SUM(COALESCE(breakdown_total_with_vat, total_amount, 0)), 0) AS purchase_expenses
       FROM purchase_invoices
       WHERE created_by = ?`,
      [req.user.id]
    );

    const [[miscRow]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS misc_expenses
       FROM miscellaneous_expenses
       WHERE user_id = ?`,
      [req.user.id]
    );

    const [[withdrawRow]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS manual_withdrawals
       FROM withdrawals_deposits
       WHERE user_id = ? AND type = 'withdrawal'`,
      [req.user.id]
    );

    const [[depositRow]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS manual_deposits
       FROM withdrawals_deposits
       WHERE user_id = ? AND type = 'deposit'`,
      [req.user.id]
    );

    // 3. Convert to numbers
    const invoiceIncome = parseFloat(invoiceRow.invoice_income || 0);
    const installationIncome = parseFloat(installationRow.installation_income || 0);
    const purchaseExpenses = parseFloat(purchaseRow.purchase_expenses || 0);
    const miscExpenses = parseFloat(miscRow.misc_expenses || 0);
    const manualWithdrawals = parseFloat(withdrawRow.manual_withdrawals || 0);
    const manualDeposits = parseFloat(depositRow.manual_deposits || 0);

    // 4. Calculate totals
    const totalIncome = invoiceIncome + installationIncome;
    const totalExpenses = purchaseExpenses + miscExpenses;
    const currentBalance =
      parseFloat(companySetting.initial_balance || 0) +
      totalIncome -
      totalExpenses +
      manualDeposits -
      manualWithdrawals;

    // 5. Update current balance in DB
    await pool.execute(
      'UPDATE company_settings SET current_balance = ? WHERE user_id = ?',
      [currentBalance, req.user.id]
    );

    // 6. Respond
    res.json({
      success: true,
      data: {
        current_balance: currentBalance,
        initial_balance: parseFloat(companySetting.initial_balance || 0),
        total_income: totalIncome,
        total_expenses: totalExpenses,
        manual_deposits: manualDeposits,
        manual_withdrawals: manualWithdrawals,
        net_manual_adjustments: manualDeposits - manualWithdrawals,
        last_updated: new Date().toISOString(),
        breakdown: {
          invoice_income: invoiceIncome,
          installation_income: installationIncome,
          purchase_expenses: purchaseExpenses,
          misc_expenses: miscExpenses
        }
      }
    });
  } catch (error) {
    console.error('Error fetching company balance:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching company balance',
      details: error.message
    });
  }
});


// Get company settings
app.get('/api/company-settings', authenticateToken, async (req, res) => {
  try {
    let [settings] = await pool.execute(
      'SELECT * FROM company_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (settings.length === 0) {
      // Create default settings
      await pool.execute(
        'INSERT INTO company_settings (user_id, company_name, initial_balance, current_balance) VALUES (?, ?, ?, ?)',
        [req.user.id, 'الشركة', 0, 0]
      );
      
      [settings] = await pool.execute(
        'SELECT * FROM company_settings WHERE user_id = ?',
        [req.user.id]
      );
    }

    res.json({
      success: true,
      data: settings[0]
    });
  } catch (error) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب إعدادات الشركة',
      details: error.message 
    });
  }
});

// Update company settings
app.put('/api/company-settings', authenticateToken, async (req, res) => {
  try {
    const { company_name, initial_balance, contact_email, contact_phone, address } = req.body;

    // Validation
    if (!company_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم الشركة مطلوب' 
      });
    }

    // Update or insert company settings
    const [existing] = await pool.execute(
      'SELECT id FROM company_settings WHERE user_id = ?',
      [req.user.id]
    );

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE company_settings 
         SET company_name = ?, initial_balance = ?, contact_email = ?, contact_phone = ?, address = ?
         WHERE user_id = ?`,
        [company_name, parseFloat(initial_balance) || 0, contact_email || null, contact_phone || null, address || null, req.user.id]
      );
    } else {
      await pool.execute(
        `INSERT INTO company_settings (user_id, company_name, initial_balance, contact_email, contact_phone, address) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, company_name, parseFloat(initial_balance) || 0, contact_email || null, contact_phone || null, address || null]
      );
    }

    res.json({
      success: true,
      message: 'تم حفظ الإعدادات بنجاح'
    });
  } catch (error) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في حفظ الإعدادات',
      details: error.message 
    });
  }
});

// Get withdrawals/deposits
app.get('/api/withdrawals-deposits', authenticateToken, async (req, res) => {
  try {
    const { search, type, startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        wd.id,
        wd.type,
        wd.amount,
        wd.description,
        wd.date,
        wd.payment_method,
        wd.notes,
        wd.created_at,
        wd.updated_at,
        u.file_name as original_file_name,
        u.file_path,
        u.file_type
      FROM withdrawals_deposits wd
      LEFT JOIN withdrawals_deposits_uploads u ON wd.id = u.transaction_id
      WHERE wd.user_id = ?
    `;
    const queryParams = [req.user.id];

    // Add filters
    if (search) {
      query += ' AND (wd.description LIKE ? OR wd.notes LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      query += ' AND wd.type = ?';
      queryParams.push(type);
    }

    if (startDate) {
      query += ' AND wd.date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND wd.date <= ?';
      queryParams.push(endDate);
    }

    query += ' ORDER BY wd.date DESC, wd.created_at DESC';

    const [transactions] = await pool.execute(query, queryParams);

    // Process file paths
    const processedTransactions = transactions.map(transaction => {
      if (transaction.file_path) {
        const actualFileName = path.basename(transaction.file_path);
        transaction.file_url = `/uploads/${actualFileName}`;
      }
      return transaction;
    });

    // Calculate summary
    const totalWithdrawals = processedTransactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const totalDeposits = processedTransactions
      .filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    res.json({
      success: true,
      data: processedTransactions,
      summary: {
        totalTransactions: processedTransactions.length,
        totalWithdrawals,
        totalDeposits,
        netAmount: totalDeposits - totalWithdrawals
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawals/deposits:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب المعاملات',
      details: error.message 
    });
  }
});

// Create withdrawal/deposit
app.post('/api/withdrawals-deposits', authenticateToken, upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { type, amount, description, date, payment_method, notes } = req.body;

    // Validation
    if (!type || !amount || !description || !date || !payment_method) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المبلغ يجب أن يكون رقماً موجباً' 
      });
    }

    // Create transaction record
    const [result] = await connection.execute(
      `INSERT INTO withdrawals_deposits (
        user_id, type, amount, description, date, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, type, parseFloat(amount), description, date, payment_method, notes || null]
    );

    const transactionId = result.insertId;

    // If file was uploaded, create upload record
    if (req.file) {
      await connection.execute(
        `INSERT INTO withdrawals_deposits_uploads (
          transaction_id,
          file_name,
          file_path,
          file_type,
          file_size,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          req.user.id
        ]
      );
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      message: 'تم إضافة المعاملة بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating withdrawal/deposit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في إضافة المعاملة',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// Update withdrawal/deposit
app.put('/api/withdrawals-deposits/:id', authenticateToken, upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { type, amount, description, date, payment_method, notes } = req.body;

    // Check if transaction exists and belongs to user
    const [existingTransaction] = await connection.execute(
      'SELECT id FROM withdrawals_deposits WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existingTransaction.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المعاملة غير موجودة' 
      });
    }

    // Validation
    if (!type || !amount || !description || !date || !payment_method) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'المبلغ يجب أن يكون رقماً موجباً' 
      });
    }

    // Update transaction
    await connection.execute(
      `UPDATE withdrawals_deposits 
       SET type = ?, amount = ?, description = ?, date = ?, payment_method = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [type, parseFloat(amount), description, date, payment_method, notes || null, id, req.user.id]
    );

    // If new file was uploaded, replace the old one
    if (req.file) {
      // Delete old upload record and file
      const [oldUploads] = await connection.execute(
        'SELECT file_path FROM withdrawals_deposits_uploads WHERE transaction_id = ?',
        [id]
      );

      await connection.execute(
        'DELETE FROM withdrawals_deposits_uploads WHERE transaction_id = ?',
        [id]
      );

      // Delete old files from disk
      for (const upload of oldUploads) {
        if (upload.file_path) {
          try {
            await fs.unlink(upload.file_path);
          } catch (fileError) {
            console.error(`Error deleting old file ${upload.file_path}:`, fileError);
          }
        }
      }

      // Create new upload record
      await connection.execute(
        `INSERT INTO withdrawals_deposits_uploads (
          transaction_id,
          file_name,
          file_path,
          file_type,
          file_size,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          req.user.id
        ]
      );
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'تم تحديث المعاملة بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating withdrawal/deposit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث المعاملة',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// Delete withdrawal/deposit
app.delete('/api/withdrawals-deposits/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if transaction exists and belongs to user
    const [existingTransaction] = await connection.execute(
      'SELECT id FROM withdrawals_deposits WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existingTransaction.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'المعاملة غير موجودة' 
      });
    }

    // Delete upload files first
    const [uploads] = await connection.execute(
      'SELECT file_path FROM withdrawals_deposits_uploads WHERE transaction_id = ?',
      [id]
    );

    // Delete files from disk
    for (const upload of uploads) {
      if (upload.file_path) {
        try {
          await fs.unlink(upload.file_path);
        } catch (fileError) {
          console.error(`Error deleting file ${upload.file_path}:`, fileError);
        }
      }
    }

    // Delete upload records
    await connection.execute(
      'DELETE FROM withdrawals_deposits_uploads WHERE transaction_id = ?',
      [id]
    );

    // Delete transaction
    await connection.execute(
      'DELETE FROM withdrawals_deposits WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'تم حذف المعاملة بنجاح'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting withdrawal/deposit:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في حذف المعاملة',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// Get expense statistics
app.get('/api/miscellaneous-expenses/statistics', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    const queryParams = [req.user.id];
    
    if (startDate && endDate) {
      dateFilter = 'AND date BETWEEN ? AND ?';
      queryParams.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = 'AND date >= ?';
      queryParams.push(startDate);
    } else if (endDate) {
      dateFilter = 'AND date <= ?';
      queryParams.push(endDate);
    }

    // Get total statistics
    const [totalStats] = await pool.execute(
      `SELECT 
        COUNT(*) as totalCount,
        SUM(amount) as totalAmount,
        AVG(amount) as averageAmount,
        MIN(amount) as minAmount,
        MAX(amount) as maxAmount
       FROM miscellaneous_expenses 
       WHERE user_id = ? ${dateFilter}`,
      queryParams
    );

    // Get category breakdown
    const [categoryStats] = await pool.execute(
      `SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total,
        AVG(amount) as average
       FROM miscellaneous_expenses 
       WHERE user_id = ? ${dateFilter}
       GROUP BY category 
       ORDER BY total DESC`,
      queryParams
    );

    // Get monthly breakdown
    const [monthlyStats] = await pool.execute(
      `SELECT 
        DATE_FORMAT(date, '%Y-%m') as month,
        COUNT(*) as count,
        SUM(amount) as total
       FROM miscellaneous_expenses 
       WHERE user_id = ? ${dateFilter}
       GROUP BY DATE_FORMAT(date, '%Y-%m') 
       ORDER BY month DESC 
       LIMIT 12`,
      queryParams
    );

    res.json({
      success: true,
      data: {
        total: totalStats[0],
        byCategory: categoryStats,
        byMonth: monthlyStats
      }
    });
  } catch (error) {
    console.error('Error fetching expense statistics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في جلب إحصائيات المصروفات',
      details: error.message 
    });
  }
});



// Create invoice endpoint
app.post('/api/invoices', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes,
      terms,
      projectName,
      invoiceTypeCode,
      invoiceTypeName,
      discount_rate,
      interest_rate,
      items,
    } = req.body;

    console.log('Invoice request body:', JSON.stringify(req.body, null, 2));

    const invoiceNumber = `INV-${Date.now()}`;
    const uuid = uuidv4();
    const params = [
      invoiceNumber,
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes || null,
      terms || null,
      projectName || null,
      req.user.id,
      uuid,
      invoiceTypeCode || '388',
      invoiceTypeName || '0100000',
      discount_rate ?? null,
      interest_rate ?? null,
    ];
    console.log('Invoice query params:', params);

    const [result] = await connection.execute(
      `INSERT INTO invoices (
        invoice_number, company_id, issue_date, supply_date, due_date, 
        total_amount, vat_amount, status, notes, terms, project_name, 
        created_by, uuid, invoice_type_code, invoice_type_name, discount_rate, interest_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    const invoiceId = result.insertId;

    for (const item of items) {
    const itemParams = [
      invoiceId,
      item.description,
      item.code || null,
      item.quantity,
      item.base_unit_price ?? item.unit_price, // Added
      item.unit_price,
      item.vat_rate,
      item.vat_amount,
      item.total_amount,
      item.discount_rate ?? null,
      item.interest_rate ?? null,
      item.total_vat_amount ?? item.vat_amount, // Added
      item.price_after_tax ?? (item.unit_price + item.vat_amount), // Added
    ];
    console.log('Invoice item params:', itemParams);
    await connection.execute(
      `INSERT INTO invoice_items (
        invoice_id, description, code, quantity, base_unit_price, unit_price,
        vat_rate, vat_amount, total_amount, discount_rate, interest_rate,
        total_vat_amount, price_after_tax
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      itemParams
    );
  }

    await connection.commit();
    res.status(201).json({
      message: 'تم إنشاء الفاتورة بنجاح',
      invoiceId,
      invoiceNumber,
      uuid,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'فشل في إنشاء الفاتورة' });
  } finally {
    connection.release();
  }
});

// Get all invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    console.log('User ID:', req.user.id);
    const [invoices] = await pool.execute(
      `SELECT 
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.invoice_type_code,
        i.invoice_type_name,
        i.created_at,
        i.updated_at,
        c.name as customer_name,
        c.vat_number as customer_vat_number
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.created_by = ?
      ORDER BY i.issue_date DESC`, // Changed to issue_date
      [req.user.id]
    );

    console.log('Fetched invoices:', invoices);
    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching invoices:', {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
    });
    res.status(500).json({ error: 'فشل في جلب الفواتير' });
  }
});


async function fetchInvoiceFromDatabase(invoiceId, userId) {
  try {
    // Fetch the invoice, related company (buyer), and user (seller) data
    const [invoiceRows] = await pool.execute(
      `
      SELECT 
        i.id,
        i.company_id,
        i.invoice_number,
        i.issue_date,
        i.supply_date,
        i.invoice_type_code, -- Added
        i.invoice_type_name, -- Added
        c.name AS customer_name,
        c.vat_number AS customer_vat_number,
        c.name,
        c.vat_number,
        c.cr_number,
        c.street_name,
        c.city,
        c.postal_code,
        c.neighborhood_name,
        u.company_name AS seller_name,
        u.tax_register AS seller_vat_number,
        u.commercial_register AS seller_cr_number,
        u.city AS seller_city,
        u.postal_code AS seller_postal_code,
        u.address AS seller_address,
        u.building_number AS seller_building_number,
        u.neighborhood_name AS seller_neighborhood_name
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = ? AND i.created_by = ?
      `,
      [invoiceId, userId]
    );

    if (invoiceRows.length === 0) {
      throw new Error('Invoice not found or user not authorized');
    }

    const invoiceData = invoiceRows[0];

    // Fetch the invoice items
    const [itemsRows] = await pool.execute(
      `
      SELECT description, quantity, unit_price, vat_rate, vat_amount
      FROM invoice_items
      WHERE invoice_id = ?
      `,
      [invoiceId]
    );

    return {
      id: invoiceData.id,
      company_id: invoiceData.company_id,
      invoice_number: invoiceData.invoice_number,
      issue_date: invoiceData.issue_date,
      supply_date: invoiceData.supply_date,
      invoice_type_code: invoiceData.invoice_type_code, // Added
      invoice_type_name: invoiceData.invoice_type_name, // Added
      customer_name: invoiceData.customer_name,
      customer_vat_number: invoiceData.customer_vat_number,
      seller: {
        name: invoiceData.seller_name || 'Unknown Seller',
        vat_number: invoiceData.seller_vat_number || '300000000000000',
        cr_number: invoiceData.seller_cr_number || '0000000000',
        street_name: invoiceData.seller_address || 'Unknown Street',
        building_number: invoiceData.seller_building_number || '1234',
        city: invoiceData.seller_city || 'Unknown City',
        postal_code: invoiceData.seller_postal_code || '00000',
        neighborhood_name: invoiceData.seller_neighborhood_name || 'Unknown Neighborhood',
      },
      company: {
        name: invoiceData.name,
        vat_number: invoiceData.vat_number,
        cr_number: invoiceData.cr_number,
        street_name: invoiceData.street_name || 'Unknown Street',
        building_number: '1234',
        city: invoiceData.city || 'Unknown City',
        postal_code: invoiceData.postal_code || '00000',
        neighborhood_name: invoiceData.neighborhood_name || 'Unknown Neighborhood',
      },
      items: itemsRows.map(item => ({
        description: item.description || 'Unknown Item',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        vat_rate: item.vat_rate || 15,
        vat_amount: item.vat_amount || 0,
      })),
    };
  } catch (error) {
    console.error('Error fetching invoice from database:', error);
    throw error;
  }
}

//Get Invoice XML Endpoint
app.get('/api/invoices/:id/xml', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const invoiceId = req.params.id;
    const userId = req.user.id;

    // Fetch invoice details from the database
    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.supply_date,
        i.due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.icv,
        i.uuid,
        i.zatca_invoice_hash,
        i.invoice_type_code, -- Added
        i.invoice_type_name, -- Added
        u.company_name AS seller_name,
        u.tax_register AS seller_vat_number,
        u.commercial_register AS seller_cr_number,
        u.address AS seller_street_name,
        u.city AS seller_city,
        u.postal_code AS seller_postal_code,
        u.building_number AS seller_building_number,
        c.name AS company_name,
        c.vat_number AS company_vat_number,
        c.cr_number AS company_cr_number,
        c.street_name AS company_street_name,
        c.city AS company_city,
        c.postal_code AS company_postal_code
      FROM invoices i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [invoiceId, userId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const invoiceData = invoices[0];

    // Fetch invoice items
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoiceId]
    );

    // Fetch previous invoice hash if available
    const [previousInvoice] = await connection.execute(
      `SELECT zatca_invoice_hash 
       FROM invoices 
       WHERE company_id = ? AND id < ? AND zatca_invoice_hash IS NOT NULL 
       ORDER BY id DESC LIMIT 1`,
      [invoiceData.company_id, invoiceId]
    );
    const previousInvoiceHash = previousInvoice.length > 0 && previousInvoice[0].zatca_invoice_hash
      ? previousInvoice[0].zatca_invoice_hash
      : 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

    // Map database data to the invoice format
    const invoice = {
      id: String(invoiceData.id),
      invoice_number: invoiceData.invoice_number,
      issue_date: new Date(invoiceData.issue_date),
      supply_date: invoiceData.supply_date ? new Date(invoiceData.supply_date) : undefined,
      icv: invoiceData.icv || '1',
      uuid: invoiceData.uuid,
      invoice_type_code: invoiceData.invoice_type_code || '388', // Added
      invoice_type_name: invoiceData.invoice_type_name || '0100000', // Added
      seller: {
        name: invoiceData.seller_name || 'غير محدد',
        vat_number: invoiceData.seller_vat_number,
        cr_number: invoiceData.seller_cr_number,
        street_name: invoiceData.seller_street_name || 'غير محدد',
        building_number: invoiceData.seller_building_number || '1234',
        city: invoiceData.seller_city || 'غير محدد',
        postal_code: invoiceData.seller_postal_code || '00000',
      },
      company: {
        name: invoiceData.company_name,
        vat_number: invoiceData.company_vat_number,
        cr_number: invoiceData.company_cr_number,
        street_name: invoiceData.company_street_name || invoiceData.address || 'غير محدد',
        building_number: '1234',
        city: invoiceData.company_city || 'غير محدد',
        postal_code: invoiceData.company_postal_code || '00000',
      },
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price),
        vat_rate: parseFloat(item.vat_rate),
        vat_amount: parseFloat(item.vat_amount),
      })),
    };

    // Validate required fields
    if (!invoice.seller.vat_number || !invoice.company.vat_number) {
      throw new Error('رقم تسجيل الضريبة للبائع أو المشتري مفقود');
    }

    // Generate the XML
    const { xml } = await generateZatcaInvoiceXML(invoice, previousInvoiceHash);

    // Set headers and send XML response
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice.invoice_number}.xml`);
    res.send(xml);
  } catch (error) {
    console.error('Error generating invoice XML:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'فشل في إنشاء ملف XML للفاتورة', details: error.message });
  } finally {
    connection.release();
  }
});

// Get single invoice with details
app.get('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    console.log('Fetching invoice ID:', req.params.id);
    console.log('User ID:', req.user.id);
    await connection.beginTransaction();

    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        DATE_FORMAT(i.issue_date, '%Y-%m-%d') as issue_date,
        DATE_FORMAT(i.supply_date, '%Y-%m-%d') as supply_date,
        DATE_FORMAT(i.due_date, '%Y-%m-%d') as due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.created_at,
        i.qr_code,
        i.zatca_invoice_hash,
        c.name as company_name,
        c.vat_number as company_vat_number,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email,
        c.type as company_type
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      console.log('No invoice found for ID:', req.params.id);
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const invoice = invoices[0];
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        base_unit_price,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount,
        code,
        discount_rate,
        interest_rate,
        total_vat_amount,
        price_after_tax
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoice.id]
    );

    const response = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      supply_date: invoice.supply_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount,
      vat_amount: invoice.vat_amount,
      status: invoice.status,
      notes: invoice.notes,
      terms: invoice.terms,
      project_name: invoice.project_name,
      company_id: invoice.company_id,
      created_at: invoice.created_at,
      qr_code: invoice.qr_code,
      zatca_invoice_hash: invoice.zatca_invoice_hash,
      company: {
        name: invoice.company_name,
        vat_number: invoice.company_vat_number,
        address: invoice.company_address,
        city: invoice.company_city,
        postal_code: invoice.company_postal_code,
        phone: invoice.company_phone,
        email: invoice.company_email,
        type: invoice.company_type,
      },
      items: items,
    };

    await connection.commit();
    console.log('Response sent:', response);
    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Error fetching invoice details:', {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
    });
    res.status(500).json({ error: 'فشل في جلب تفاصيل الفاتورة' });
  } finally {
    connection.release();
  }
});
// Update full invoice
app.patch('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes,
      terms,
      projectName,
      invoiceTypeCode,
      invoiceTypeName,
      discount_rate,
      interest_rate,
      items,
    } = req.body;

    console.log('Update invoice request body:', JSON.stringify(req.body, null, 2));

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    // Update invoice
    const params = [
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes || null,
      terms || null,
      projectName || null,
      invoiceTypeCode || '388',
      invoiceTypeName || '0100000',
      discount_rate ?? null,
      interest_rate ?? null,
      req.params.id,
    ];
    console.log('Update invoice query params:', params);

    await connection.execute(
      `UPDATE invoices SET
        company_id = ?, issue_date = ?, supply_date = ?, due_date = ?, 
        total_amount = ?, vat_amount = ?, status = ?, 
        notes = ?, terms = ?, project_name = ?,
        invoice_type_code = ?, invoice_type_name = ?,
        discount_rate = ?, interest_rate = ?
      WHERE id = ?`,
      params
    );

    // Delete existing items
    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [
      req.params.id,
    ]);

    // Insert updated items
    for (const item of items) {
      const itemParams = [
        req.params.id,
        item.description,
        item.code || null,
        item.quantity,
        item.unit_price,
        item.vat_rate,
        item.vat_amount,
        item.total_amount,
        item.discount_rate ?? null,
        item.interest_rate ?? null,
      ];
      console.log('Update invoice item params:', itemParams);
      await connection.execute(
        `INSERT INTO invoice_items (
          invoice_id, description, code, quantity, unit_price,
          vat_rate, vat_amount, total_amount, discount_rate, interest_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemParams
      );
    }

    await connection.commit();
    res.json({ message: 'تم تعديل الفاتورة بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'فشل في تعديل الفاتورة' });
  } finally {
    connection.release();
  }
});

// Update invoice status
app.patch('/api/invoices/:id/status', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { status } = req.body;

    if (
      !['draft', 'issued', 'paid', 'cancelled', 'certified'].includes(status)
    ) {
      return res.status(400).json({ error: 'حالة الفاتورة غير صالحة' });
    }

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    await connection.execute('UPDATE invoices SET status = ? WHERE id = ?', [
      status,
      req.params.id,
    ]);

    res.json({ message: 'تم تحديث حالة الفاتورة بنجاح' });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'فشل في تحديث حالة الفاتورة' });
  } finally {
    connection.release();
  }
});

// Delete invoice
app.delete('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    // Delete invoice items first
    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [
      req.params.id,
    ]);

    // Delete invoice
    await connection.execute('DELETE FROM invoices WHERE id = ?', [
      req.params.id,
    ]);

    await connection.commit();
    res.json({ message: 'تم حذف الفاتورة بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'فشل في حذف الفاتورة' });
  } finally {
    connection.release();
  }
});

// Update invoice payment status
app.patch('/api/invoices/:id/payment-status', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { payment_status, paid_amount } = req.body;

    // Validate invoice belongs to user
    const [invoiceCheck] = await connection.execute(
      'SELECT id, total_amount, payment_status as current_payment_status, paid_amount as current_paid_amount FROM invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    const invoice = invoiceCheck[0];
    const totalAmount = parseFloat(invoice.total_amount);
    const currentPaidAmount = parseFloat(invoice.current_paid_amount) || 0;
    const newPaidAmount = parseFloat(paid_amount) || 0;

    // Calculate balance change
    const balanceChange = newPaidAmount - currentPaidAmount;

    // Update invoice
    await connection.execute(
      'UPDATE invoices SET payment_status = ?, paid_amount = ? WHERE id = ?',
      [payment_status, newPaidAmount, id]
    );

    // Update company balance if there's a change
    if (balanceChange !== 0) {
      await connection.execute(
        `UPDATE company_settings 
         SET current_balance = current_balance + ?
         WHERE user_id = ?`,
        [balanceChange, req.user.id]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'تم تحديث حالة الدفع بنجاح'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice payment status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث حالة الدفع',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});



// In E:\a\project-2-5-2025\project\server\index.js
// Replace the /api/invoices/:id/regenerate-pdf endpoint with:
app.post('/api/invoices/:id/regenerate-pdf', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || status !== 'certified') {
      return res.status(400).json({ error: 'يجب تحديد الحالة كـ "موثقة"' });
    }

    await connection.beginTransaction();

    // Fetch invoice
    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        DATE_FORMAT(i.issue_date, '%Y-%m-%d') as issue_date,
        DATE_FORMAT(i.supply_date, '%Y-%m-%d') as supply_date,
        DATE_FORMAT(i.due_date, '%Y-%m-%d') as due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.created_at,
        i.qr_code,
        i.zatca_invoice_hash,
        i.invoice_type_code,
        i.invoice_type_name,
        c.name as company_name,
        c.vat_number as company_vat_number,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email,
        c.type as company_type
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const invoice = invoices[0];

    // Fetch invoice items
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoice.id]
    );

    // Log invoice data to debug undefined values
    console.log('Invoice data:', {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      supply_date: invoice.supply_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount,
      vat_amount: invoice.vat_amount,
      status: invoice.status,
      notes: invoice.notes,
      terms: invoice.terms,
      project_name: invoice.project_name,
      company_id: invoice.company_id,
      qr_code: invoice.qr_code,
      zatca_invoice_hash: invoice.zatca_invoice_hash,
      invoice_type_code: invoice.invoice_type_code,
      invoice_type_name: invoice.invoice_type_name,
      company_name: invoice.company_name,
      company_vat_number: invoice.company_vat_number,
      company_address: invoice.company_address,
    });

    // Update invoice status to certified
    await connection.execute(
      'UPDATE invoices SET status = ? WHERE id = ?',
      [status, id]
    );

    // Prepare invoice object for generateArabicInvoicePDF
    const updatedInvoice = {
      id: invoice.id,
      invoice_number: invoice.invoice_number || '',
      issue_date: invoice.issue_date || new Date().toISOString().split('T')[0],
      supply_date: invoice.supply_date || new Date().toISOString().split('T')[0],
      due_date: invoice.due_date || new Date().toISOString().split('T')[0],
      total_amount: parseFloat(invoice.total_amount) || 0,
      vat_amount: parseFloat(invoice.vat_amount) || 0,
      status: status,
      notes: invoice.notes || null,
      terms: invoice.terms || null,
      project_name: invoice.project_name || null,
      company_id: invoice.company_id || null,
      created_at: invoice.created_at || new Date().toISOString(),
      qr_code: invoice.qr_code || null,
      zatca_invoice_hash: invoice.zatca_invoice_hash || null,
      invoice_type_code: invoice.invoice_type_code || '388',
      invoice_type_name: invoice.invoice_type_name || '0100000',
      company: {
        name: invoice.company_name || '',
        vat_number: invoice.company_vat_number || '',
        address: invoice.company_address || '',
        city: invoice.company_city || null,
        postal_code: invoice.company_postal_code || null,
        phone: invoice.company_phone || null,
        email: invoice.company_email || null,
        type: invoice.company_type || null,
      },
      items: items.map(item => ({
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        vat_rate: parseFloat(item.vat_rate) || 0,
        vat_amount: parseFloat(item.vat_amount) || 0,
        total_amount: parseFloat(item.total_amount) || 0,
      })),
    };

    // Log updatedInvoice to confirm no undefined values
    console.log('Updated invoice for PDF:', updatedInvoice);

    await connection.commit();

    // Call generateArabicInvoicePDF
    await generateArabicInvoicePDF(
      { body: { invoice: updatedInvoice }, user: req.user, headers: req.headers },
      res
    );
  } catch (error) {
    await connection.rollback();
    console.error('Error regenerating PDF:', error);
    res.status(500).json({ error: 'فشل في إعادة إنشاء الفاتورة', details: error.message });
  } finally {
    connection.release();
  }
}); 


// Get user profile
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT company_name, commercial_register, tax_register, email, phone, 
              address, building_number, city, postal_code, neighborhood_name,
              code, category, description, other_seller_id, website, mobile_phone,
              country, street_name, additional_building_number, beneficiary_name,
              bank_name, iban
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const user = users[0];
    res.json({
      company_name: user.company_name || '',
      commercial_register: user.commercial_register || '',
      tax_register: user.tax_register || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      building_number: user.building_number || '',
      city: user.city || '',
      postal_code: user.postal_code || '',
      neighborhood_name: user.neighborhood_name || '',
      code: user.code || '',
      category: user.category || '',
      description: user.description || '',
      other_seller_id: user.other_seller_id || '',
      website: user.website || '',
      mobile_phone: user.mobile_phone || '',
      country: user.country || '',
      street_name: user.street_name || '',
      additional_building_number: user.additional_building_number || '',
      beneficiary_name: user.beneficiary_name || '',
      bank_name: user.bank_name || '',
      iban: user.iban || '',
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات المستخدم' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  const {
    companyName,
    commercialRegister,
    taxRegister,
    email,
    phone,
    address,
    buildingNumber,
    city,
    postalCode,
    neighborhoodName,
    code,
    category,
    description,
    otherSellerId,
    website,
    mobilePhone,
    country,
    streetName,
    additionalBuildingNumber,
    beneficiaryName,
    bankName,
    iban,
  } = req.body;

  try {
    // Start building the SQL query and parameters dynamically
    let updateFields = [];
    let queryParams = [];

    // Only add fields that are provided (not undefined or empty)
    if (companyName?.trim()) {
      updateFields.push('company_name = ?');
      queryParams.push(companyName.trim());
    }

    if (commercialRegister?.trim()) {
      if (commercialRegister.length !== 10 || !/^\d{10}$/.test(commercialRegister)) {
        return res.status(400).json({ error: 'رقم السجل التجاري يجب أن يكون 10 أرقام' });
      }
      updateFields.push('commercial_register = ?');
      queryParams.push(commercialRegister.trim());
    }

    if (taxRegister?.trim()) {
      if (taxRegister.length !== 15 || !/^3\d{14}$/.test(taxRegister)) {
        return res.status(400).json({ error: 'رقم التسجيل الضريبي يجب أن يبدأ بـ 3 ويكون 15 رقمًا' });
      }
      updateFields.push('tax_register = ?');
      queryParams.push(taxRegister.trim());
    }

    if (email?.trim()) {
      // Basic email format validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
      }
      updateFields.push('email = ?');
      queryParams.push(email.trim().toLowerCase());
    }

    if (phone?.trim()) {
      if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ error: 'رقم هاتف الشركة يجب أن يكون 10 أرقام' });
      }
      updateFields.push('phone = ?');
      queryParams.push(phone.trim());
    }

    if (address?.trim()) {
      updateFields.push('address = ?');
      queryParams.push(address.trim());
    }

    if (buildingNumber?.trim()) {
      updateFields.push('building_number = ?');
      queryParams.push(buildingNumber.trim());
    }

    if (city?.trim()) {
      updateFields.push('city = ?');
      queryParams.push(city.trim());
    }

    if (postalCode?.trim()) {
      updateFields.push('postal_code = ?');
      queryParams.push(postalCode.trim());
    }

    if (neighborhoodName?.trim()) {
      updateFields.push('neighborhood_name = ?');
      queryParams.push(neighborhoodName.trim());
    }

    if (code?.trim()) {
      updateFields.push('code = ?');
      queryParams.push(code.trim());
    }

    if (category?.trim()) {
      updateFields.push('category = ?');
      queryParams.push(category.trim());
    }

    if (description?.trim()) {
      updateFields.push('description = ?');
      queryParams.push(description.trim());
    }

    if (otherSellerId?.trim()) {
      updateFields.push('other_seller_id = ?');
      queryParams.push(otherSellerId.trim());
    }

    if (website?.trim()) {
      updateFields.push('website = ?');
      queryParams.push(website.trim());
    }

    if (mobilePhone?.trim()) {
      if (mobilePhone.length !== 10 || !/^\d{10}$/.test(mobilePhone)) {
        return res.status(400).json({ error: 'رقم الجوال يجب أن يكون 10 أرقام' });
      }
      updateFields.push('mobile_phone = ?');
      queryParams.push(mobilePhone.trim());
    }

    if (country?.trim()) {
      updateFields.push('country = ?');
      queryParams.push(country.trim());
    }

    if (streetName?.trim()) {
      updateFields.push('street_name = ?');
      queryParams.push(streetName.trim());
    }

    if (additionalBuildingNumber?.trim()) {
      updateFields.push('additional_building_number = ?');
      queryParams.push(additionalBuildingNumber.trim());
    }

    if (beneficiaryName?.trim()) {
      updateFields.push('beneficiary_name = ?');
      queryParams.push(beneficiaryName.trim());
    }

    // Bank name is optional
    if (typeof bankName === 'string') {
      updateFields.push('bank_name = ?');
      queryParams.push(bankName.trim() || null); // Store empty string as NULL
    }

    // IBAN is required for ZATCA compliance
    if (typeof iban === 'string') {
      const trimmedIban = iban.trim();
      if (trimmedIban) {
        // Validate Saudi IBAN: SA + 22 digits
        if (!/^SA\d{22}$/.test(trimmedIban) || trimmedIban.length !== 24) {
          return res.status(400).json({ error: 'رقم الآيبان يجب أن يبدأ بـ SA ويتبعه 22 رقمًا' });
        }
        updateFields.push('iban = ?');
        queryParams.push(trimmedIban);
      } else {
        updateFields.push('iban = ?');
        queryParams.push(null); // Allow clearing IBAN
      }
    }

    // Add user ID as the last parameter
    queryParams.push(req.user.id);

    // If no fields to update, return early
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'لم يتم تقديم أي بيانات للتحديث' });
    }

    // Construct and execute the SQL query
    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `;

    await pool.execute(query, queryParams);

    // If email was updated, mark as unverified and generate new verification code
    if (email?.trim()) {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes

      await pool.execute(
        'UPDATE users SET is_verified = false, verification_code = ?, verification_expiry = ? WHERE id = ?',
        [verificationCode, verificationExpiry, req.user.id]
      );

      // TODO: Send verification email with new code
    }

    res.json({
      message: 'تم تحديث البيانات بنجاح',
      requiresVerification: email?.trim() ? true : false,
    });
  } catch (error) {
    console.error('Error updating user profile:', error);

    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    }

    res.status(500).json({ error: 'فشل في تحديث البيانات' });
  }
});



// Start server with error handling and startup time logging
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('Server is running! 🚀');
});

// Lazy-load puppeteer to reduce startup time
let puppeteerBrowser = null;
async function getPuppeteerBrowser() {
  if (!puppeteerBrowser) {
    const puppeteer = require('puppeteer');
    puppeteerBrowser = await puppeteer.launch();
  }
  return puppeteerBrowser;
}

const startTime = Date.now();
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}. Startup took ${Date.now() - startTime}ms`);
}).on('error', (err) => {
  console.error('Server startup error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please free the port or choose another.`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  prisma.$disconnect().then(() => {
    console.log('Prisma disconnected');
  });
  pool.end((err) => {
    if (err) {
      console.error('Error closing MySQL pool:', err);
    } else {
      console.log('MySQL pool closed');
    }
    if (puppeteerBrowser) {
      puppeteerBrowser.close().then(() => {
        console.log('Puppeteer browser closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  prisma.$disconnect().then(() => {
    console.log('Prisma disconnected');
  });
  pool.end((err) => {
    if (err) {
      console.error('Error closing MySQL pool:', err);
    } else {
      console.log('MySQL pool closed');
    }
    if (puppeteerBrowser) {
      puppeteerBrowser.close().then(() => {
        console.log('Puppeteer browser closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});
