const mysql = require('mysql2/promise');
const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
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

// Utility functions to handle number formatting
const formatNumber = (value) => {
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  return isNaN(numericValue) ? 0 : numericValue;
};

const formatCurrency = (amount) => {
  const numericAmount = formatNumber(amount);
  return `${numericAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} <span style="font-family: 'saudi_riyal'"></span>`;
};

const formatQuantity = (quantity) => {
  const numericQuantity = formatNumber(quantity);
  if (numericQuantity % 1 === 0) {
    return numericQuantity.toLocaleString('en-US');
  }
  return numericQuantity.toFixed(0);
};

const formatDiscount = (discount) => {
  const numericDiscount = formatNumber(discount);
  return `${numericDiscount.toFixed(0)}%`;
};

function toArabicDigits(number) {
  return String(number).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// Construct customer address from street_name, neighborhood_name, and city
const getCustomerAddress = (company) => {
  const parts = [
    company?.street_name || '',
    company?.neighborhood_name ? ` ${company.neighborhood_name}` : '',
    company?.city || '',
  ].filter(part => part);
  return parts.length > 0 ? parts.join(', ') : 'لا يوجد عنوان متاح';
};

const getCustomerAddressEnglish = (company) => {
  const parts = [
    company?.street_name || '',
    company?.neighborhood_name || '',
    company?.city || '',
  ].filter(part => part);
  return parts.length > 0 ? parts.join(', ') : 'No address available';
};

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

const generateQRCode = async (invoice, user) => {
  try {
    console.log('Generating QR code with inputs:', { invoice, user });

    // Validate inputs
    if (!invoice || !user || !invoice.issue_date) {
      console.error('Invalid invoice or user data:', { invoice, user });
      return null;
    }

    // Ensure valid date
    const date = new Date(invoice.issue_date);
    if (isNaN(date.getTime())) {
      console.error('Invalid issue_date:', invoice.issue_date);
      return null;
    }

    // Convert total_amount and vat_amount to numbers
    const totalAmountNum = formatNumber(invoice.total_amount);
    const vatAmountNum = formatNumber(invoice.vat_amount);

    // Validate numeric values
    if (isNaN(totalAmountNum) || isNaN(vatAmountNum)) {
      console.error('Invalid total_amount or vat_amount:', {
        total_amount: invoice.total_amount,
        vat_amount: invoice.vat_amount,
      });
      return null;
    }

    // Create TLV data for QR code according to ZATCA standards
    const sellerName = toTLV(1, user.company_name || 'شركة المعايير العصرية لتقنية المعلومات');
    const vatNumber = toTLV(2, user.tax_register || '');
    const timestamp = toTLV(3, date.toISOString());
    const totalAmount = toTLV(4, totalAmountNum.toFixed(2));
    const vatAmount = toTLV(5, vatAmountNum.toFixed(2));

    // Combine all TLV data
    const qrData = new Uint8Array(
      sellerName.length + vatNumber.length + timestamp.length + totalAmount.length + vatAmount.length
    );
    
    let offset = 0;
    qrData.set(sellerName, offset);
    offset += sellerName.length;
    qrData.set(vatNumber, offset);
    offset += vatNumber.length;
    qrData.set(timestamp, offset);
    offset += timestamp.length;
    qrData.set(totalAmount, offset);
    offset += totalAmount.length;
    qrData.set(vatAmount, offset);

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

    console.log('QR code generated successfully:', qrCodeDataURL.substring(0, 50) + '...');
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

// Endpoint to generate Arabic PDF
const generateArabicInvoicePDF = async (req, res) => {
  const { invoice } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'Invoice data is required' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'غير مصرح لك بالوصول: بيانات المستخدم غير متوفرة' });
  }

  try {
    // Log the full invoice object for debugging
    console.log('Received invoice data:', JSON.stringify(invoice, null, 2));

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

    // Construct full address for seller
    const fullAddress = user
      ? [
          user.neighborhood_name ? `حي ${user.neighborhood_name}` : '',
          user.city ? `${user.city}` : '',
        ].filter(part => part).join(', ') || 'لا يوجد عنوان متاح'
      : 'لا يوجد عنوان متاح';
    
    const fullAddressEnglish = "Al-Sulaymania, Tabuk";
    const fullCustomerAddressEnglish = "King Khalid Road, Al-Faisaliah, Tabuk";
    const fullBankNameEnglish = "BSF";

    // Fetch customer data from companies table using companyId or company_id
    let companyData = invoice.company || {};
    const companyId = invoice.companyId || invoice.company_id; // Check both
    if (companyId) {
      const [companies] = await pool.execute(
        `SELECT id, name, vat_number, street_name, neighborhood_name, city, 
                address, postal_code, phone, email, type
         FROM companies WHERE id = ?`,
        [companyId]
      );
      if (companies.length > 0) {
        companyData = companies[0];
        console.log('Fetched company data from DB:', companyData);
      } else {
        console.warn('No company found for companyId:', companyId);
      }
    } else {
      console.warn('No companyId or company_id provided, using invoice.company:', companyData);
    }

    // Log the final company data used
    console.log('Final invoice company data:', companyData);

    // Generate QR Code
    const qrCodeDataURL = await generateQRCode(invoice, user);
    if (!qrCodeDataURL) {
      console.warn('QR code generation failed, using fallback');
    }

    // Load watermark as base64
    const watermarkPath = path.join(__dirname, 'watermark.png');
    let watermarkUrl = null;
    console.log('Watermark path:', watermarkPath);
    console.log('Watermark file exists:', fs.existsSync(watermarkPath));
    if (invoice.status === 'draft' && fs.existsSync(watermarkPath)) {
      try {
        const watermarkBuffer = fs.readFileSync(watermarkPath);
        watermarkUrl = `data:image/png;base64,${watermarkBuffer.toString('base64')}`;
      } catch (err) {
        console.error('Error reading watermark file:', err.message);
      }
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Enhanced HTML content with modern styling
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة ضريبية</title>
          <style>

            .watermark {
              position: fixed; /* Apply to all pages */
              top: 45%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg); /* Center precisely */
              width: 210mm; /* A4 width */
              height: 297mm; /* A4 height */
              display: flex; /* Reinforce centering */
              justify-content: center;
              align-items: center;
              background-image: ${watermarkUrl ? `url(${watermarkUrl})` : 'none'};
              background-repeat: no-repeat; /* No repetition */
              background-size: contain; /* Fit within dimensions */
              background-position: center; /* Explicit center */
              opacity: 0.3; /* Less opaque */
              pointer-events: none;
              z-index: 10;
            }
              
            /* === Fonts === */
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

            /* === Header Section === */
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

            .header .company-info h1 {
              margin-bottom: 2px;
              margin-top: -1px;
              direction: inherit;
            }

            .header .company-info p {
              margin: 2px 0;
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

            /* === Title Section === */
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

            /* === Info Grid with QR === */
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

            .info-section strong {
              color: #2c5d5a;
              font-weight: 600;
            }

            .qr-section {
              width: 25%;
              display: flex;
              align-items: center;
              justify-content: center;
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

            /* === Buyer Information - Inline Version === */
            .buyer-info {
              background: #fff;
              border: 1px solid #15921b;
              border-radius: 8px;
              margin-bottom: 13px; /* back to original */
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .buyer-content {
              display: flex;
              padding: 5px; /* back to original */
              border-bottom: 1px solid #e2e8f0;
            }

            .buyer-content:last-child {
              border-bottom: none;
            }

            .buyer-content div {
              width: 80%;
              padding: 5px; /* back to original */
            }

            .buyer-content .text-right {
              text-align: right;
              direction: rtl;
            }

            .buyer-content .text-left {
              text-align: left;
              direction: ltr;
            }

            .buyer-content .inline-content {
              background: #f8f9fa;
              border-radius: 4px;
              padding: 5px; /* back to original */
              font-size: 11px; /* back to original */
              color: #2c5d5a;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .buyer-content .inline-content .label {
              color: #15921b;
              font-weight: bold;
              font-size: 12px; /* back to original */
              white-space: nowrap;
            }

            .buyer-content .inline-content .value {
              color: #2c5d5a;
              font-weight: 500;
            }

            /* === Table Section === */
            .table-container {
              margin-bottom: 13px;
              overflow-x: auto;
              border: 1px solid #15921b;
              border-radius: 8px;
            }

            .table-container h3 {
              font-size: 12px;
              color: #15921b;
              font-weight: bold;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
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

            .items-table tr:hover {
              background-color: #e8f5f4;
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

            /* === Totals Section === */
            .totals-section {
              display: flex;
              justify-content: space-between;
              gap: 3px;
            }

            .totals-box, .info-box {
              width: 280px;
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 5px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              margin-right: 363px;
            }

            .total-row, .info-row {
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

            .total-row:nth-child(2) {
              border-bottom: none;
            }

            .total-label, .info-label {
              color: #374151;
              font-weight: 500;
            }

            .total-amount {
              color: #2c5d5a;
              font-weight: 600;
              font-family: 'Courier New', monospace;
            }

            .info-value {
              color: #2c5d5a;
              font-weight: 500;
              text-align: left;
              max-width: 180px;
              word-wrap: break-word;
            }

            /* === Summary Section === */
            .summary {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 13px;
            }

            .summary-box {
              width: 50%;
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .summary-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #e2e8f0;
              font-size: 12px;
            }

            .summary-row:last-child {
              border-bottom: none;
              border-top: 2px solid #15861b;
              padding-top: 12px;
              font-weight: bold;
              font-size: 14px;
              color: #2c5d5a;
            }

            .summary-label {
              color: #374151;
              font-weight: 500;
            }

            .summary-amount {
              color: #2c5d5a;
              font-weight: 600;
              font-family: 'Courier New', monospace;
            }

            /* === Terms Section === */
            .terms {
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 13px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .terms h3 {
              font-size: 12px;
              color: #15861b;
              font-weight: bold;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .terms-content {
              display: flex;
              padding: 8px;
            }

            .terms-content div {
              width: 50%;
              padding: 8px;
            }

            .terms-content .text-right {
              text-align: right;
              direction: rtl;
            }

            .terms-content .text-left {
              text-align: left;
              direction: ltr;
            }

            .terms-content .bg-gray {
              background: #f8f9fa;
              border-radius: 4px;
              padding: 8px;
              font-size: 11px;
              color: #2c5d5a;
              font-weight: 500;
            }

            /* === Bank Info Section === */
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

            /* === Notes Section === */
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

            /* === Footer === */
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

            .footer strong {
              color: #2c5d5a;
            }

            /* === Print-specific styles === */
            @media print {
              .document {
                padding: 10mm;
              }
              
              .header {
                break-inside: avoid;
              }
              
              .items-table {
                break-inside: avoid;
              }
              
              .summary {
                break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="document">
          ${watermarkUrl ? `<div class="watermark"></div>` : ''}
            <!-- Header Section -->
            <div class="header">
              <!-- Arabic Company Info (Right) -->
              <div class="company-info ar">
                <h1>${user.company_name}</h1>
                <p><strong>الرقم الضريبي:</strong> ${toArabicDigits(user.tax_register || '')}</p>
                <p><strong>السجل التجاري:</strong> ${toArabicDigits(user.commercial_register || '')}</p>
                <p><strong>العنوان:</strong> ${fullAddress}</p>
              </div>

              <!-- Logo (Center) -->
              <div class="logo-container">
                <img src="${invoice.companyLogo || 'http://localhost:5173/msit-logo.png'}" alt="Company Logo" crossOrigin="anonymous" />
              </div>

              <!-- English Company Info (Left) -->
              <div class="company-info en">
                <h1>Modern Standards Information Technology</h1>
                <p><strong>Tax No.:</strong> ${user.tax_register || 'N/A'}</p>
                <p><strong>C.R:</strong> ${user.commercial_register || 'N/A'}</p>
                <p><strong>Address:</strong> ${fullAddressEnglish}</p>
              </div>
            </div>

            <!-- Title Section -->
            <div class="title-section">
              <h1>فاتورة ضريبية Tax Invoice</h1>
            </div>

            <!-- Info Grid with QR Code -->
            <div class="info-grid">
              <!-- Arabic Info (Right) -->
              <div class="info-section ar">
                <div>
                  <h3>الرقم التسلسلي</h3>
                  <p>${invoice.invoice_number || 'غير محدد'}</p>
                </div>
                <div>
                  <h3>تاريخ إصدار الفاتورة</h3>
                  <p>${new Date(invoice.issue_date || '').toLocaleDateString('ar-SA', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }) || 'غير محدد'}</p>
                </div>
                <div>
                  <h3>تاريخ التوريد</h3>
                  <p>${new Date(invoice.issue_date || '').toLocaleDateString('ar-SA', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }) || 'غير محدد'}</p>
                </div>
              </div>

              <!-- QR Code (Center) -->
              <div class="info-box-center">
              <div class="qr-code">
                ${qrCodeDataURL ? `<img src="${qrCodeDataURL}" alt="QR Code" style="width: 98px; height: 98px;" />` : 
                  '<p style="color: red; font-size: 12px;">Failed to generate QR Code</p>'}
              </div>
            </div>

              <!-- English Info (Left) -->
              <div class="info-section en">
                <div>
                  <h3>Invoice Reference Number (IRN)</h3>
                  <p>${invoice.invoice_number || 'Not specified'}</p>
                </div>
                <div>
                  <h3>Issue Date</h3>
                  <p>${new Date(invoice.issue_date || '').toISOString().split('T')[0] || 'Not specified'}</p>
                </div>
                <div>
                  <h3>Supply Date</h3>
                  <p>${new Date(invoice.issue_date || '').toISOString().split('T')[0] || 'Not specified'}</p>
                </div>
              </div>
            </div>

            <!-- Buyer Information Section -->
            <div class="buyer-info">
              <!-- اسم العميل -->
              <div class="buyer-content">
                <div class="text-right">
                  <div class="inline-content">
                    <span class="label">اسم العميل:</span>
                    <span class="value">${invoice.company?.name || 'شركة نماذج فاتورة المحدودة'}</span>
                  </div>
                </div>
                <div class="text-left">
                  <div class="inline-content">
                    <span class="label">Buyer Name:</span>
                    <span class="value">${invoice.company?.name || 'Fatoora Samples LTD'}</span>
                  </div>
                </div>
              </div>
            
              <!-- رقم ضريبة القيمة المضافة -->
              <div class="buyer-content">
                <div class="text-right">
                  <div class="inline-content">
                    <span class="label">الرقم الضريبي:</span>
                    <span class="value">${toArabicDigits(invoice.company?.vat_number || '399999999800003')}</span>
                  </div>
                </div>
                <div class="text-left">
                  <div class="inline-content">
                    <span class="label">VAT No:</span>
                    <span class="value">${invoice.company?.vat_number || '399999999800003'}</span>
                  </div>
                </div>
              </div>
            
              <!-- العنوان -->
              <div class="buyer-content">
                <div class="text-right">
                  <div class="inline-content">
                    <span class="label">العنوان:</span>
                    <span class="value">${getCustomerAddress(companyData)}</span>
                  </div>
                </div>
                <div class="text-left">
                  <div class="inline-content">
                    <span class="label">Address:</span>
                    <span class="value">${fullCustomerAddressEnglish}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Items Table -->
            <div class="table-container">

              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">#</th>
                    <th style="width: 250px;">الوصف<br>Description</th>
                    <th style="width: 60px;">الكمية<br>Quantity</th>
                    <th style="width: 80px;">السعر قبل الضريبة<br>Unit Price</th>
                    <th style="width: 90px;">الاجمالي<br>Subtotal Ex</th>
                  </tr>
                </thead>
                <tbody>
                  ${invoice.items?.map((item, index) => {
                    const subtotal = item.quantity * item.unit_price;
                    const totalWithVat = subtotal + item.vat_amount;
                    return `
                      <tr>
                        <td>${index + 1}</td>
                        <td class="description-cell">${item.description || 'لا يوجد وصف'}</td>
                        <td class="number-cell">${formatQuantity(item.quantity)}</td>
                        <td class="number-cell">${formatCurrency(item.unit_price)}</td>
                        <td class="number-cell">${formatCurrency(subtotal)}</td>
                      </tr>
                    `;
                  }).join('') || '<tr><td colspan="8" style="text-align: center; color: #666;">لا توجد عناصر متاحة</td></tr>'}
                </tbody>
              </table>
            </div>

          <!-- Totals Box -->
              <div class="totals-box">
                <div class="total-row">
                  <span class="total-label">الاجمالي الفرعي قبل الضريبة:<br>Subtotal Excl. VAT</span>
                  <span class="total-amount">${formatCurrency((invoice.total_amount || 0) - (invoice.vat_amount || 0))}</span>
                </div>

                <div class="total-row">
                  <span class="total-label">قيمة الضريبة (15%):<br>VAT</span>
                  <span class="total-amount">${formatCurrency(invoice.vat_amount || 0)}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">الاجمالي شامل الضريبة:<br>Total Incl. VAT</span>
                  <span class="total-amount">${formatCurrency(invoice.total_amount || 0)}</span>
                </div>
              </div>
            </div>

        <!-- Bank Information -->
        <div class="bank-info-section">
          <div class="bank-info-content">
            <div class="bank-info-right">
              <h3 class="bank-info-title">معلومات البنك</h3>
              <div class="bank-info-item"><strong>اسم البنك:</strong> ${user.bank_name || 'غير محدد'}</div>
              <div class="bank-info-item"><strong>الايبان:</strong> ${toArabicDigits(user.iban || 'غير محدد')}</div>
              <div class="bank-info-item"><strong>اسم المستفيد:</strong> شركة المعايير العصرية لتقنية المعلومات</div>
            </div>
            <div class="bank-info-left">
              <h3 class="bank-info-title">Bank Information</h3>
              <div class="bank-info-item"><strong>Bank Name:</strong> ${fullBankNameEnglish}</div>
              <div class="bank-info-item"><strong>IBAN:</strong> ${user.iban || 'N/A'}</div>
              <div class="bank-info-item"><strong>Beneficiary Name:</strong> Modern Standards Information Technology</div>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="notes">
        <h3>ملاحظات إضافية</h3>
        <p>${invoice.notes ? `${invoice.notes}` : 'لا توجد ملاحظات إضافية.'}</p>
        </div>

        <!-- Footer -->
        <div class="footer">
        <p>© ${new Date().getFullYear()} شركة المعايير العصرية لتقنية المعلومات - جميع الحقوق محفوظة</p>
        </div>
        </div>
      </body>
      </html>
    `;

    // Set the content and generate PDF
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({
      path: `Invoice-${invoice.invoice_number}.pdf`,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await browser.close();

    // Send the PDF as a downloadable file
    res.download(`Invoice-${invoice.invoice_number}.pdf`, () => {
      // Clean up the file after sending
      fs.unlinkSync(`Invoice-${invoice.invoice_number}.pdf`);
    });
  } catch (error) {
    console.error('Error generating Arabic Invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
};

module.exports = { generateArabicInvoicePDF };