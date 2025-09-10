const mysql = require('mysql2/promise');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { TextEncoder } = require('util');
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

// Utility functions
const formatNumber = (value) => {
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  return isNaN(numericValue) ? 0 : numericValue;
};

const formatCurrency = (amount) => {
  const numericAmount = formatNumber(amount);
  return `${numericAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} <span style="font-family: 'saudi_riyal'"></span>`;
};

const formatQuantity = (quantity) => {
  const numericQuantity = formatNumber(quantity);
  if (numericQuantity % 1 === 0) {
    return numericQuantity.toLocaleString('en-US');
  }
  return numericQuantity.toFixed(0);
};

function toArabicDigits(number) {
  return String(number).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// QR Code generation function
const toTLV = (tag, value) => {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const length = valueBytes.length;
  const tlv = new Uint8Array(2 + length);
  tlv[0] = tag;
  tlv[1] = length;
  tlv.set(valueBytes, 2);
  return tlv;
};

const generateQRCode = async (installations, user, totalAmount, vatAmount) => {
  try {
    const date = new Date();
    
    // Create TLV data for QR code according to ZATCA standards
    const sellerName = toTLV(1, user.company_name || 'شركة المعايير العصرية لتقنية المعلومات');
    const vatNumber = toTLV(2, user.tax_register || '399999999900003');
    const timestamp = toTLV(3, date.toISOString());
    const totalAmountTLV = toTLV(4, totalAmount.toFixed(2));
    const vatAmountTLV = toTLV(5, vatAmount.toFixed(2));

    // Combine all TLV data
    const qrData = new Uint8Array(
      sellerName.length + vatNumber.length + timestamp.length + totalAmountTLV.length + vatAmountTLV.length
    );
    
    let offset = 0;
    qrData.set(sellerName, offset);
    offset += sellerName.length;
    qrData.set(vatNumber, offset);
    offset += vatNumber.length;
    qrData.set(timestamp, offset);
    offset += timestamp.length;
    qrData.set(totalAmountTLV, offset);
    offset += totalAmountTLV.length;
    qrData.set(vatAmountTLV, offset);

    // Convert to base64
    const base64Data = Buffer.from(qrData).toString('base64');
    
    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(base64Data, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

// Generate Installations Invoice PDF
const generateInstallationsInvoicePDF = async (req, res) => {
  const { installations } = req.body;

  if (!installations || !Array.isArray(installations) || installations.length === 0) {
    return res.status(400).json({ error: 'بيانات التركيبات مطلوبة' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'غير مصرح لك بالوصول: بيانات المستخدم غير متوفرة' });
  }

  try {
    // Fetch user profile
    const [users] = await pool.execute(
      `SELECT tax_register, commercial_register, building_number, street_name, 
              additional_building_number, neighborhood_name, city, bank_name, 
              iban, company_name
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const user = users[0];

    // Calculate totals
    const subtotal = installations.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const vatRate = 0.15; // 15% VAT
    const vatAmount = subtotal * vatRate;
    const totalAmount = subtotal + vatAmount;

    // Generate invoice number
    const invoiceNumber = `INST-${Date.now()}`;

    // Construct full address
    const fullAddress = user
      ? [
          user.neighborhood_name ? `حي ${user.neighborhood_name}` : '',
          user.city ? `${user.city}` : '',
        ].filter(part => part).join(', ') || 'لا يوجد عنوان متاح'
      : 'لا يوجد عنوان متاح';
    
    const fullAddressEnglish = "Al-Sulaymania, Tabuk";

    // Generate QR Code
    const qrCodeDataURL = await generateQRCode(installations, user, totalAmount, vatAmount);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // HTML content for installations invoice
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة تركيبات</title>
          <style>
            @font-face {
              font-family: 'Almarai';
              src: url('/fonts/Almarai-Regular.ttf') format('truetype');
              font-weight: normal;
              font-style: normal;
            }

            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: 'Almarai', sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #333;
              background: #fff;
              direction: rtl;
            }

            .document {
              width: 190mm;
              max-width: 190mm;
              margin: 0 auto;
              padding: 15mm;
              background: #fff;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border: 1px solid #15921b;
              border-radius: 0.5rem;
              padding: 8px;
              width: 100%;
              text-align: center;
              margin-bottom: 13px;
              background: #f8fffe;
            }

            .company-info {
              width: 30%;
              font-size: 12px;
            }

            .company-info.ar {
              text-align: right;
              direction: rtl;
              font-family: 'Almarai', sans-serif;
            }

            .company-info.en {
              text-align: left;
              direction: ltr;
            }

            .company-info.ar h1 {
              font-size: 12px !important;
              color: #15921b !important;
              text-align: right;
              direction: rtl;
            }

            .company-info.en h1 {
              font-size: 9px !important;
              color: #15921b !important;
              text-align: left;
              direction: ltr;
            }

            .logo-container {
              width: 40%;
              display: flex;
              justify-content: center;
              align-items: center;
            }

            .logo-container img {
              width: 32mm;
            }

            .title-section {
              text-align: center;
              margin-bottom: 13px;
              padding: 8px;
              background: #f1f5f9;
              border-radius: 6px;
              border: 1px solid #d1d5db;
              border-left: 4px solid #15921b;
              border-right: 4px solid #15921b;
            }

            .title-section h1 {
              font-size: 16px;
              font-weight: bold;
              color: #15921b;
              text-transform: uppercase;
              letter-spacing: 1px;
            }

            .info-grid {
              display: flex;
              justify-content: space-between;
              align-items: stretch;
              background: #f1f5f9;
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 5px;
              margin-bottom: 13px;
              border-left: 4px solid #15921b;
              border-right: 4px solid #15921b;
            }

            .info-section {
              width: 33%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            .info-section.ar {
              text-align: right;
              direction: rtl;
            }

            .info-section.en {
              text-align: left;
              direction: ltr;
            }

            .info-section h3 {
              font-size: 10px;
              color: #15921b;
              font-weight: bold;
              margin-bottom: 2px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .info-section p {
              font-size: 11px;
              margin-bottom: 2px;
              color: #555;
            }

            .qr-code {
              width: 110px;
              height: 110px;
              background: white;
              border-radius: 8px;
              margin-top: 5px;
              padding: 8px;
              border: 1px solid rgb(184, 187, 190);
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .qr-code img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }

            .table-container {
              margin-bottom: 13px;
              overflow-x: auto;
              border: 1px solid #15921b;
              border-radius: 8px;
            }

            .items-table {
              width: 100%;
              border-collapse: collapse;
              border-radius: 6px;
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .items-table th {
              background: linear-gradient(135deg, #69bf4a 0%, #15861b 100%);
              color: white;
              font-weight: 600;
              padding: 8px 4px;
              text-align: center;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }

            .items-table td {
              padding: 8px;
              text-align: center;
              font-size: 11px;
              border: 1px solid #e2e8f0;
            }

            .items-table tr:nth-child(even) {
              background-color: #f8f9fa;
            }

            .description-cell {
              text-align: right !important;
              max-width: 200px;
              word-wrap: break-word;
              white-space: pre-wrap;
              direction: rtl;
            }

            .number-cell {
              text-align: center !important;
              font-family: 'Courier New', monospace;
              font-weight: 600;
              white-space: nowrap;
            }

            .totals-box {
              width: 280px;
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 5px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              margin-right: 363px;
            }

            .total-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 3px 0;
              border-bottom: 1px solid #15861b;
              font-size: 10px;
            }

            .total-row:last-child {
              border-bottom: none;
              border-top: 2px solid #15861b;
              padding-top: 3px;
              margin-top: 3px;
              font-weight: bold;
              font-size: 10px;
              color: #2c5d5a;
            }

            .total-label {
              color: #374151;
              font-weight: 500;
            }

            .total-amount {
              color: #2c5d5a;
              font-weight: 600;
              font-family: 'Courier New', monospace;
            }

            .bank-info-section {
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 13px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              width: 90%;
              margin-right: 35px;
            }

            .bank-info-content {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }

            .bank-info-left, .bank-info-right {
              width: 45%;
            }

            .bank-info-right {
              text-align: right;
              direction: rtl;
            }

            .bank-info-left {
              text-align: left;
              direction: ltr;
            }

            .bank-info-title {
              font-size: 12px;
              font-weight: bold;
              color: #15861b;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .bank-info-item {
              font-size: 11px;
              margin-bottom: 8px;
              color: #555;
            }

            .bank-info-item strong {
              color: #2c5d5a;
              font-weight: 600;
            }

            .notes {
              background: #f8f9fa;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              padding: 15px;
              margin-bottom: 20px;
              border-left: 4px solid #15861b;
              border-right: 4px solid #15861b;
              margin-right: 35px;
              width: 90%;
            }

            .notes h3 {
              font-size: 12px;
              color: #15861b;
              font-weight: bold;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .notes p {
              font-size: 11px;
              line-height: 1.6;
              color: #555;
              text-align: right;
              direction: rtl;
            }

            .footer {
              text-align: center;
              padding: 15px;
              background: #f1f5f9;
              border-radius: 6px;
              border-top: 3px solid #15861b;
              margin-top: 20px;
              margin-right: 35px;
              width: 90%;
            }

            .footer p {
              font-size: 10px;
              color: #64748b;
              margin: 0;
              line-height: 1.4;
              direction: rtl;
            }

            @media print {
              .document {
                padding: 10mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="document">
            <!-- Header Section -->
            <div class="header">
              <div class="company-info ar">
                <h1>${user.company_name || 'شركة المعايير العصرية لتقنية المعلومات'}</h1>
                <p><strong>الرقم الضريبي:</strong> ${toArabicDigits(user.tax_register || '399999999900003')}</p>
                <p><strong>السجل التجاري:</strong> ${toArabicDigits(user.commercial_register || '1010123456')}</p>
                <p><strong>العنوان:</strong> ${fullAddress}</p>
              </div>

              <div class="logo-container">
                <img src="http://localhost:5173/msit-logo.png" alt="Company Logo" crossOrigin="anonymous" />
              </div>

              <div class="company-info en">
                <h1>Modern Standards Information Technology</h1>
                <p><strong>Tax No.:</strong> ${user.tax_register || '399999999900003'}</p>
                <p><strong>C.R:</strong> ${user.commercial_register || '1010123456'}</p>
                <p><strong>Address:</strong> ${fullAddressEnglish}</p>
              </div>
            </div>

            <!-- Title Section -->
            <div class="title-section">
              <h1>فاتورة تركيبات Installations Invoice</h1>
            </div>

            <!-- Info Grid with QR Code -->
            <div class="info-grid">
              <div class="info-section ar">
                <div>
                  <h3>رقم الفاتورة</h3>
                  <p>${invoiceNumber}</p>
                </div>
                <div>
                  <h3>تاريخ الإصدار</h3>
                  <p>${new Date().toLocaleDateString('ar-SA', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</p>
                </div>
                <div>
                  <h3>نوع الفاتورة</h3>
                  <p>فاتورة تركيبات</p>
                </div>
              </div>

              <div class="qr-code">
                ${qrCodeDataURL ? `<img src="${qrCodeDataURL}" alt="QR Code" style="width: 98px; height: 98px;" />` : 
                  '<p style="color: red; font-size: 12px;">Failed to generate QR Code</p>'}
              </div>

              <div class="info-section en">
                <div>
                  <h3>Invoice Number</h3>
                  <p>${invoiceNumber}</p>
                </div>
                <div>
                  <h3>Issue Date</h3>
                  <p>${new Date().toISOString().split('T')[0]}</p>
                </div>
                <div>
                  <h3>Invoice Type</h3>
                  <p>Installations Invoice</p>
                </div>
              </div>
            </div>

            <!-- Items Table -->
            <div class="table-container">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">#</th>
                    <th style="width: 250px;">اسم التركيب<br>Installation Name</th>
                    <th style="width: 60px;">الكمية<br>Quantity</th>
                    <th style="width: 80px;">السعر<br>Unit Price</th>
                    <th style="width: 90px;">الاجمالي<br>Subtotal</th>
                    <th style="width: 150px;">المشروع<br>Project</th>
                  </tr>
                </thead>
                <tbody>
                  ${installations.map((item, index) => {
                    const subtotal = item.quantity * item.price;
                    return `
                      <tr>
                        <td>${index + 1}</td>
                        <td class="description-cell">${item.name || 'تركيب غير محدد'}</td>
                        <td class="number-cell">${formatQuantity(item.quantity)}</td>
                        <td class="number-cell">${formatCurrency(item.price)}</td>
                        <td class="number-cell">${formatCurrency(subtotal)}</td>
                        <td class="description-cell">${item.project_name || 'غير محدد'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Totals Box -->
            <div class="totals-box">
              <div class="total-row">
                <span class="total-label">الاجمالي قبل الضريبة:<br>Subtotal Excl. VAT</span>
                <span class="total-amount">${formatCurrency(subtotal)}</span>
              </div>
              <div class="total-row">
                <span class="total-label">قيمة الضريبة (15%):<br>VAT</span>
                <span class="total-amount">${formatCurrency(vatAmount)}</span>
              </div>
              <div class="total-row">
                <span class="total-label">الاجمالي شامل الضريبة:<br>Total Incl. VAT</span>
                <span class="total-amount">${formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <!-- Bank Information -->
            <div class="bank-info-section">
              <div class="bank-info-content">
                <div class="bank-info-right">
                  <h3 class="bank-info-title">معلومات البنك</h3>
                  <div class="bank-info-item"><strong>اسم البنك:</strong> ${user.bank_name || 'بنك البلاد'}</div>
                  <div class="bank-info-item"><strong>الايبان:</strong> ${toArabicDigits(user.iban || 'SA1234567890123456789012')}</div>
                  <div class="bank-info-item"><strong>اسم المستفيد:</strong> ${user.company_name || 'شركة المعايير العصرية لتقنية المعلومات'}</div>
                </div>
                <div class="bank-info-left">
                  <h3 class="bank-info-title">Bank Information</h3>
                  <div class="bank-info-item"><strong>Bank Name:</strong> BSF</div>
                  <div class="bank-info-item"><strong>IBAN:</strong> ${user.iban || 'SA1234567890123456789012'}</div>
                  <div class="bank-info-item"><strong>Beneficiary Name:</strong> Modern Standards Information Technology</div>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div class="notes">
              <h3>ملاحظات إضافية</h3>
              <p>فاتورة تركيبات وصيانة معدات تقنية المعلومات. جميع التركيبات تم تنفيذها وفقاً للمواصفات المطلوبة.</p>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p>© ${new Date().getFullYear()} ${user.company_name || 'شركة المعايير العصرية لتقنية المعلومات'} - جميع الحقوق محفوظة</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Set the content and generate PDF
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await browser.close();

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="installations-invoice-${invoiceNumber}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating installations invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate installations invoice PDF', details: error.message });
  }
};

module.exports = { generateInstallationsInvoicePDF };