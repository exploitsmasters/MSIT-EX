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

    // Get purchase details for expense creation
    const [purchaseRows] = await connection.execute(
      'SELECT supplier_id, project_id FROM purchase_invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (purchaseRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }

    const purchase = purchaseRows[0];

    // Get supplier name
    const [supplierRows] = await connection.execute(
      'SELECT name FROM suppliers WHERE id = ?',
      [purchase.supplier_id]
    );

    const supplierName = supplierRows.length > 0 ? supplierRows[0].name : 'مورد غير معروف';

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
          item_type,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          item.item_type || 'purchase',
          req.user.id
        ]
      );

      // If item is marked as expense, create miscellaneous expense entry
      if (item.item_type === 'expense') {
        await connection.execute(
          `INSERT INTO miscellaneous_expenses 
           (description, amount, category, date, payment_method, notes, project_id, user_id, from_invoice_breakdown) 
           VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
          [
            `${item.name} - ${supplierName}`,
            totalAmount,
            'من تفريغ فاتورة',
            'تحويل من فاتورة',
            `تم تحويله من تفريغ فاتورة - الكود: ${item.code}`,
            purchase.project_id,
            req.user.id,
            true
          ]
        );
      }
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
        me.original_file_name,
        me.file_path,
        me.file_type,
        me.file_size,
        me.from_invoice_breakdown,
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
    const balanceImpactAmount = processedExpenses
      .filter(expense => !expense.from_invoice_breakdown)
      .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({
      success: true,
      data: processedExpenses,
      summary: {
        totalExpenses: processedExpenses.length,
        totalAmount: totalAmount,
        averageAmount: processedExpenses.length > 0 ? totalAmount / processedExpenses.length : 0,
        balanceImpactAmount
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
       (user_id, description, amount, category, date, payment_method, notes, project_id, original_file_name, file_path, file_type, file_size, from_invoice_breakdown) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        fileData.file_size,
        false
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

    if (existing.length >