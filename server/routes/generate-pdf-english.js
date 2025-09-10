const mysql = require('mysql2/promise');
const puppeteer = require('puppeteer');
const fs = require('fs');
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
  })}`; // ← non-breaking space
};

// &nbsp;SAR

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

// Endpoint to generate English PDF
const generateEnglishPDF = async (req, res) => {
  const { quotation } = req.body;

  if (!quotation) {
    return res.status(400).json({ error: 'Quotation data is required' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized: User data not available' });
  }

  try {
    // Fetch user profile
    const [users] = await pool.execute(
      `SELECT tax_register, commercial_register, building_number, street_name, additional_building_number, neighborhood_name, city, bank_name, iban, company_name
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Construct full address for Arabic
    const fullAddress = user
      ? [
          user.neighborhood_name ? `حي ${user.neighborhood_name}` : '',
          user.city ? `${user.city}` : '',
        ].filter(part => part).join(', ') || 'لا يوجد عنوان متاح'
      : 'لا يوجد عنوان متاح';
    
    // Construct full address for English
    const fullAddressEnglish = "Al-Sulaymania, Tabuk";
    const fullBankNameEnglish = "BSF";

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Generate HTML content for English PDF with centered logo and Arabic/English info
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Quotation PDF - English</title>
          <style>
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
              font-family: 'Arial', 'Helvetica', sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #333;
              background: #fff;
              direction: ltr;
            }

            .document {
              width: 210mm;
              max-width: 210mm;
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
              margin-bottom: 20px;
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
              font-size: 11px !important;
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
              margin-bottom: 20px;
              padding: 5px;
              background: #f1f5f9;
              border-radius: 6px;
              border: 1px solid #d1d5db;
              border-left: 4px solid #15921b;
              border-right: 4px solid #15921b;
            }

            .title-section h1 {
              font-size: 12px;
              font-weight: bold;
              color: #15921b;
              margin-bottom: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }

            .quotation-number {
              font-size: 12px;
              color: #666;
              font-weight: 500;
            }

            .customer-name {
              font-size: 13px;
              color: #2c5d5a;
              font-weight: 600;
              margin-top: 5px;
            }

            /* === Info Grid === */
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24.7rem;
              margin-bottom: 20px;
              padding: 12px;
              background: #f1f5f9;
              border-radius: 6px;
              border: 1px solid #d1d5db;
              border-left: 4px solid #15921b;
              border-right: 4px solid #15921b;
            }

            .info-section h3 {
              font-size: 12px;
              color: #15921b;
              font-weight: bold;
              margin-bottom: 10px;
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

            /* === Table Section === */
            .table-container {
              margin-bottom: 25px;
              overflow-x: auto;
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
              padding: 5px;
              text-align: center;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }

            .items-table td {
              padding: 6px 8px;
              text-align: center;
              font-size: 12px;
              border: 1px solid #e2e8f0;
            }

            .items-table tr:nth-child(even) {
              background-color: #f8f9fa;
            }

            .items-table tr:hover {
              background-color: #e8f5f4;
            }

            .description-cell {
              text-align: left !important;
              max-width: 200px;
              word-wrap: break-word;
              white-space: pre-wrap;
            }

            .number-cell {
              text-align: center !important;
              font-family: 'Courier New', monospace;
              font-weight: 800;
              white-space: nowrap;
            }

            .number-cell .amount,
            .number-cell .currency {
              display: inline-block;
              vertical-align: middle;
            }

            .number-cell .currency {
              font-size: 8px;
              font-weight: 500;
              color: #555;
              margin-left: 2px;
            }

            tbody {
            border: 1px solid red;
            }


            /* === Totals Section === */
            .totals-section {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              margin-bottom: 100px;
            }

            .totals-box, .info-box {
              width: 400px;
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .total-row, .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #15861b;
              font-size: 12px;
            }

            .total-row:last-child {
              border-bottom: none;
              border-top: 2px solid #15861b;
              padding-top: 12px;
              font-weight: bold;
              font-size: 14px;
              color: #2c5d5a;
            }

            .info-row:last-child {
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
              text-align: right;
              max-width: 180px;
              word-wrap: break-word;
            }

            /* === Bank Info Section === */
            .bank-info-section {
              background: #fff;
              border: 1px solid #15861b;
              border-radius: 8px;
              padding: 9px;
              margin-bottom: 25px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .bank-info-message {
              text-align: left;
              margin-bottom: 9px;
              background: #f8fffe;
            }

            .bank-info-message p {
              font-size: 11px;
              line-height: 1.6;
              color: #2c5d5a;
              margin: 0;
            }

            .bank-info-separator-full {
              width: 100%;
              height: 1px;
              background: linear-gradient(90deg, #69bf4a 0%, #15861b 100%);
              margin: 9px 0;
            }

            .bank-info-content {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }

            .bank-info-left, .bank-info-right {
              width: 45%;
            }

            .bank-info-separator {
              width: 2px;
              height: 120px;
              background: linear-gradient(135deg, #69bf4a 0%, #15861b 100%);
              border-radius: 1px;
              margin: 0 20px;
            }

            .bank-info-title {
              font-size: 10px;
              font-weight: bold;
              color: #15861b;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .bank-info-title-2 {
              font-size: 10px;
              font-weight: bold;
              color: #15861b;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .bank-info-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 6px 0;
              border-bottom: 1px solid #e2e8f0;
              font-size: 11px;
            }

            .bank-info-item:last-child {
              border-bottom: none;
            }

            .bank-info-label {
              color: #374151;
              font-weight: 500;
              min-width: 120px;
            }

            .bank-info-value {
              color: #2c5d5a;
              font-weight: 500;
              text-align: right;
              flex: 1;
            }

            .personal-info p {
              font-size: 11px;
              color: #2c5d5a;
              margin-bottom: 8px;
              line-height: 1.4;
            }

            .personal-info .name {
              font-size: 13px;
              font-weight: bold;
              color: #2c5d5a;
              margin-bottom: 4px;
            }

            .personal-info .title {
              font-size: 10px;
              color: #666;
              font-style: italic;
              margin-bottom: 10px;
            }

            /* === Terms and Notes === */
            .terms-notes-section {
              margin-bottom: 20px;
            }

            .section-title {
              font-size: 12px;
              font-weight: bold;
              color: #15861b;
              margin-bottom: 10px;
              padding-bottom: 5px;
              border-bottom: 2px solid #e2e8f0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .content-box {
              background: #f8f9fa;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              padding: 15px;
              margin-bottom: 15px;
              border-left: 4px solid #15861b;
              border-right: 4px solid #15861b;
            }

            .content-box p {
              font-size: 11px;
              line-height: 1.6;
              color: #555;
              margin-bottom: 8px;
            }

            .content-box ol {
              margin-left: 20px;
              font-size: 11px;
              line-height: 1.6;
              color: #555;
            }

            .content-box li {
              margin-bottom: 5px;
            }

            /* === Footer === */
            .footer {
              text-align: center;
              padding: 15px;
              background: #f1f5f9;
              border-radius: 6px;
              border-top: 3px solid #15861b;
              margin-top: 20px;
            }

            .footer p {
              font-size: 10px;
              color: #64748b;
              margin: 0;
              line-height: 1.4;
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
              
              .totals-section {
                break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="document">
            <!-- Header Section -->
            <div class="header">
              <!-- English Company Info (Left) -->
              <div class="company-info en">
                <h1>Modern Standards Information Technology</h1>
                <p><strong>Tax No.:</strong> ${user.tax_register || 'N/A'}</p>
                <p><strong>C.R:</strong> ${user.commercial_register || 'N/A'}</p>
                <p><strong>Address:</strong> ${fullAddressEnglish}</p>
              </div>

              <!-- Logo (Center) -->
              <div class="logo-container">
                <img src="${quotation.companyLogo || 'http://localhost:5173/msit-logo.png'}" alt="Company Logo" crossOrigin="anonymous" />
              </div>

              <!-- Arabic Company Info (Right) -->
              <div class="company-info ar">
                <h1>${user.company_name}</h1>
                <p><strong>الرقم الضريبي:</strong> ${toArabicDigits(user.tax_register || '')}</p>
                <p><strong>السجل التجاري:</strong> ${toArabicDigits(user.commercial_register || '')}</p>
                <p><strong>العنوان:</strong> ${fullAddress}</p>
              </div>
            </div>

            <!-- Title Section -->
            <div class="title-section">
              <h1>Quotation</h1>
              <div class="quotation-number">Quotation No: ${quotation.number || 'N/A'}</div>
              <div class="customer-name">For: ${quotation.customerName || 'N/A'}</div>
            </div>

            <!-- Info Grid -->
            <div class="info-grid">
              <div class="info-section">
                <h3>Quotation Details</h3>
                <p><strong>Issue Date:</strong> ${new Date(quotation.issueDate || '').toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) || 'N/A'}</p>
                <p><strong>Expiry Date:</strong> ${new Date(quotation.expiryDate || '').toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) || 'N/A'}</p>
              </div>
              <div class="info-section">
                <h3>Client Information</h3>
                <p><strong>Company:</strong> ${quotation.customerName || 'N/A'}</p>
                <p><strong>Status:</strong> Pending Approval</p>
              </div>
            </div>

            <!-- Items Table -->
            <div class="table-container">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">#</th>
                    <th style="width: 80px;">Code</th>
                    <th style="width: 300px;">Description</th>
                    <th style="width: 60px;">Qty</th>
                    <th style="width: 80px;">Unit Price</th>
                    <th style="width: 90px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${quotation.items?.map((item, index) => `
                    <tr>
                      <td class="sn">${index + 1}</td>
                      <td>${item.code || 'N/A'}</td>
                      <td class="description-cell">${item.description || 'No description'}</td>
                      <td class="number-cell">${formatQuantity(item.quantity)}</td>
                      <td class="number-cell">${formatCurrency(item.unit_price)}</td>
                      <td class="number-cell">${formatCurrency(item.total_amount)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="8" style="text-align: center; color: #666;">No items available</td></tr>'}
                </tbody>
              </table>
            </div>

            <!-- Totals and Information Section -->
            <div class="totals-section">
              <!-- Information Box -->
              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Validity:</span>
                  <span class="info-value">${quotation.validity || '2 Weeks'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Delivery Location:</span>
                  <span class="info-value">${quotation.deliveryLocation || 'Tabuk'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Delivery Period:</span>
                  <span class="info-value">${quotation.deliveryPeriod || 'Week'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Warranty:</span>
                  <span class="info-value">${quotation.warranty || 'Manufacture Standard'}</span>
                </div>
              </div>

              <!-- Totals Box -->
              <div class="totals-box">
                <div class="total-row">
                  <span class="total-label">Subtotal (Before Tax):</span>
                  <span class="total-amount">${formatCurrency((quotation.totalAmount || 0))}&nbsp;SAR </span>
                </div>
                <div class="total-row">
                  <span class="total-label">Discount:</span>
                  <span class="total-amount">${formatCurrency(quotation.discount_rate || 0)}&nbsp;SAR </span>
                </div>
                <div class="total-row">
                  <span class="total-label">VAT Amount (15%):</span>
                  <span class="total-amount">${formatCurrency(quotation.vatAmount || 0)}&nbsp;SAR </span>
                </div>
                <div class="total-row">
                  <span class="total-label">Total Amount:</span>
                  <span class="total-amount">${formatCurrency((quotation.totalAmount || 0) + (quotation.vatAmount || 0))}&nbsp;SAR </span>
                </div>
              </div>
            </div>

            <!-- Bank Info Section -->
            <div class="bank-info-section">
              <!-- Message at the top -->
              <div class="bank-info-message">
                <p>We hope this offer meets your requirements and we look forward to serving your valued order. In the meantime, if you need any further clarification or assistance, please feel free to contact us — we will be glad to assist you at any time.</p>
              </div>

              <!-- Full width separator -->
              <div class="bank-info-separator-full"></div>

              <!-- Bank Info and Contact Person -->
              <div class="bank-info-content">
                <!-- Bank Info (Left) -->
                <div class="bank-info-left">
                  <div class="bank-info-title">Our Bank Info</div>
                  <div class="bank-info-item">
                    <span class="bank-info-label">Bank Name:</span>
                    <span class="bank-info-value">${fullBankNameEnglish}</span>
                  </div>
                  <div class="bank-info-item">
                    <span class="bank-info-label">IBAN:</span>
                    <span class="bank-info-value">${user.iban || 'N/A'}</span>
                  </div>
                  <div class="bank-info-item">
                    <span class="bank-info-label">Beneficiary Name:</span>
                    <span class="bank-info-value">Modern Standards Information Technology</span>
                  </div>
                </div>

                <!-- Separator -->
                <div class="bank-info-separator"></div>

                <!-- Personal Info (Right) -->
                <div class="bank-info-right">
                  <div class="bank-info-title-2">With Best Regards</div>
                  <div class="personal-info">
                    <p class="name">Mohamed Shaaban</p>
                    <p class="title">Infrastructure Engineer</p>
                    <p>+966553373133</p>
                    <p>m.shaaban@msit.com.sa</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Terms and Notes -->
            <div class="terms-notes-section">
              <div class="section-title">Terms & Conditions</div>
              <div class="content-box">
                ${quotation.terms ? `
                  ${quotation.terms.includes('\n\n') 
                    ? `<ol>${quotation.terms.split('\n\n').filter(term => term.trim()).map(term => `<li>${term}</li>`).join('')}</ol>`
                    : `<ol>${quotation.terms.split('\n').filter(term => term.trim()).map(term => `<li>${term}</li>`).join('')}</ol>`
                  }
                ` : '<p>No specific terms and conditions provided.</p>'}
              </div>

              <div class="section-title">Additional Notes</div>
              <div class="content-box">
                ${quotation.notes ? `<p>${quotation.notes}</p>` : '<p>No additional notes provided.</p>'}
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p>
                <strong>Modern Standards Information Technology</strong><br>
                Address: Tabuk - King Fahd Street - Al-Sulaymania | 
                Mobile: 0555373133 | 
                Email: info@msit.com.sa
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Set the content and generate PDF
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: `Quotation-${quotation.number}-EN.pdf`,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await browser.close();

    // Send the PDF as a downloadable file
    res.download(`Quotation-${quotation.number}-EN.pdf`, () => {
      // Clean up the file after sending
      fs.unlinkSync(`Quotation-${quotation.number}-EN.pdf`);
    });
  } catch (error) {
    console.error('Error generating English PDF:', error);
    res.status(500).json({ error: 'Failed to generate English PDF', details: error.message });
  }
};

module.exports = { generateEnglishPDF };