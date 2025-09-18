const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/auth');
require('dotenv').config();

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

// Convert quotation to tax invoice
router.post('/quotations/convert-to-invoice', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { quotationId } = req.body;

    if (!quotationId) {
      return res.status(400).json({ error: 'معرف عرض السعر مطلوب' });
    }

    // Fetch quotation details
    const [quotationRows] = await connection.execute(`
      SELECT 
        q.id,
        q.quotation_number,
        q.company_id,
        q.issue_date,
        q.expiry_date,
        q.total_amount,
        q.vat_amount,
        q.notes,
        q.terms,
        q.created_by,
        q.customer_name,
        q.interest_rate,
        q.discount_rate,
        q.discount_on_total_percent,
        q.discount_on_total_amount,
        q.project_id,
        p.name as project_name
      FROM quotations q
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.id = ? AND q.created_by = ?
    `, [quotationId, req.user.id]);

    if (quotationRows.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود' });
    }

    const quotation = quotationRows[0];

    // Fetch quotation items
    const [itemRows] = await connection.execute(`
      SELECT 
        description,
        code,
        quantity,
        unit_price,
        base_unit_price,
        vat_rate,
        vat_amount,
        total_vat_amount,
        total_amount,
        price_after_tax,
        discount_rate,
        interest_rate
      FROM quotation_items
      WHERE quotation_id = ?
    `, [quotationId]);

    // Generate invoice number from quotation number
    // Convert QUO-20250531-1 to INV-20250531-1
    const invoiceNumber = quotation.quotation_number.replace('QUO-', 'INV-');

    // Check if invoice with this number already exists
    const [existingInvoice] = await connection.execute(
      'SELECT id FROM invoices WHERE invoice_number = ?',
      [invoiceNumber]
    );

    if (existingInvoice.length > 0) {
      return res.status(400).json({ error: 'فاتورة بهذا الرقم موجودة بالفعل' });
    }

    // Create invoice
    const uuid = uuidv4();
    const issueDate = new Date().toISOString().split('T')[0];
    const supplyDate = issueDate;
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days from now

    const [invoiceResult] = await connection.execute(`
      INSERT INTO invoices (
        invoice_number,
        company_id,
        issue_date,
        supply_date,
        due_date,
        total_amount,
        vat_amount,
        status,
        notes,
        terms,
        project_name,
        created_by,
        uuid,
        invoice_type_code,
        invoice_type_name,
        discount_rate,
        interest_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceNumber,
      quotation.company_id,
      issueDate,
      supplyDate,
      dueDate,
      quotation.total_amount,
      quotation.vat_amount,
      'draft',
      quotation.notes,
      quotation.terms,
      quotation.project_name,
      req.user.id,
      uuid,
      '388',
      '0100000',
      quotation.discount_rate || 0,
      quotation.interest_rate || 0
    ]);

    const invoiceId = invoiceResult.insertId;

    // Insert invoice items
    for (const item of itemRows) {
      await connection.execute(`
        INSERT INTO invoice_items (
          invoice_id,
          description,
          code,
          quantity,
          unit_price,
          base_unit_price,
          vat_rate,
          vat_amount,
          total_vat_amount,
          total_amount,
          price_after_tax,
          discount_rate,
          interest_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        invoiceId,
        item.description,
        item.code || '',
        item.quantity,
        item.unit_price,
        item.base_unit_price || item.unit_price,
        item.vat_rate,
        item.vat_amount,
        item.total_vat_amount || item.vat_amount,
        item.total_amount,
        item.price_after_tax || (item.unit_price + item.vat_amount),
        item.discount_rate || 0,
        item.interest_rate || 0
      ]);
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'تم تحويل عرض السعر إلى فاتورة ضريبية بنجاح',
      invoiceId,
      invoiceNumber,
      uuid
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error converting quotation to invoice:', error);
    res.status(500).json({ 
      error: 'فشل في تحويل عرض السعر إلى فاتورة ضريبية',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

module.exports = router;