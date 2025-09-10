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
  })} ê`;
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

// Endpoint to generate Arabic PDF
const generateEnglishInvoicePDF = async (req, res) => {
  const { invoice } = req.body;

  if (!invoice) {
    return res.status(400).json({ error: 'Invoice data is required' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'غير مصرح لك بالوصول: بيانات المستخدم غير متوفرة' });
  }

  try {
    // Fetch user profile
    const [users] = await pool.execute(
      `SELECT tax_register, commercial_register, building_number, street_name, additional_building_number, neighborhood_name, city, bank_name, iban, company_name
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const user = users[0];

    // Construct full address matching frontend logic
    const fullAddress = user
      ? [
          user.neighborhood_name ? `حي ${user.neighborhood_name}` : '',
          user.city ? `${user.city}` : '',
        ].filter(part => part).join(', ') || 'لا يوجد عنوان متاح'
      : 'لا يوجد عنوان متاح';
    const fullAddressEnglish = "Al-Sulaymania, Tabuk";
    const fullBankNameEnglish = "BSF";

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Generate HTML content based on invoice data with enhanced styling
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; margin: 0; padding: 0; }
          .container { width: 210mm; margin: 0 auto; padding: 5mm; box-sizing: border-box; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .header-left, .header-right { width: 45%; }
          .header-left { text-align: left; direction: ltr; }
          .header-right { text-align: right; }
          .title-section { text-align: center; margin-bottom: 20px; }
          .title-section h1 { color: #24c8fd; font-size: 24px; font-weight: bold; }
          .info-box { display: flex; justify-content: space-between; align-items: stretch; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
          .info-box-right, .info-box-left { width: 33%; display: flex; flex-direction: column; justify-content: space-between; }
          .info-box-right { text-align: right; }
          .info-box-left { text-align: left; direction: ltr; }
          .info-box-center { width: 33%; display: flex; align-items: center; justify-content: center; }
          .qr-code { width: 150px; height: 150px; background: white; border-radius: 8px; padding: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .buyer-info { background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
          .buyer-header { display: flex; justify-content: space-between; padding: 12px; background: #f7fafc; border-bottom: 1px solid #e2e8f0; }
          .buyer-header div { width: 50%; }
          .buyer-header .text-right { text-align: right; }
          .buyer-header .text-left { text-align: left; direction: ltr; }
          .buyer-content { display: flex; padding: 8px; border-bottom: 1px solid #e2e8f0; }
          .buyer-content div { width: 50%; }
          .buyer-content .text-right { text-align: right; padding-left: 8px; }
          .buyer-content .text-left { text-align: left; padding-right: 8px; direction: ltr; }
          .buyer-content .bg-gray { background: #edf2f7; border-radius: 8px; padding: 8px; }
          .table-container { margin-bottom: 16px; }
          .table-container h3 { font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: right; }
          th { background: #718096; color: white; }
          .summary { display: flex; justify-content: flex-end; margin-bottom: 16px; }
          .summary-box { width: 50%; background: #f7fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
          .summary-box div { display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #e2e8f0; }
          .summary-box div:last-child { border-bottom: none; }
          .summary-box span { font-size: 14px; }
          .summary-box .font-bold { font-weight: bold; }
          .terms, .notes { margin-bottom: 16px; }
          .terms h3, .notes h3 { font-weight: bold; margin-bottom: 8px; }
          .bank-info { display: flex; justify-content: space-between; margin-bottom: 16px; }
          .bank-info-right, .bank-info-left { width: 45%; }
          .bank-info-right { text-align: right; }
          .bank-info-left { text-align: left; direction: ltr; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; color: #718096; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="header-right">
              <h2>${user.company_name}</h2>
              <p>الرقم الضريبي: ${toArabicDigits(user.tax_register || '')}</p>
              <p>السجل التجاري: ${toArabicDigits(user.commercial_register || '')}</p>
              <p>العنوان: ${fullAddress}</p>
            </div>
            <div class="header-left">
              <h2>Modern Standards Information Technology</h2>
              <p>Tax No.: ${user.tax_register || 'N/A'}</p>
              <p>C.R: ${user.commercial_register || 'N/A'}</p>
              <p>Address: ${fullAddressEnglish}</p>
            </div>
          </div>

          <!-- Title Section -->
          <div class="title-section">
            <h1>فاتورة ضريبية Tax invoice</h1>
          </div>

          <!-- Info Box with QR -->
          <div class="info-box">
            <div class="info-box-right">
              <div>
                <p class="font-bold">الرقم التسلسلي</p>
                <p>${invoice.invoice_number || 'غير محدد'}</p>
              </div>
              <div>
                <p class="font-bold">تاريخ اصدار الفاتورة</p>
                <p>${new Date(invoice.issue_date || '').toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }) || 'غير محدد'}</p>
              </div>
              <div>
                <p class="font-bold">تاريخ التوريد</p>
                <p>${new Date(invoice.issue_date || '').toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }) || 'غير محدد'}</p>
              </div>
            </div>
            <div class="info-box-center">
              <div class="qr-code">
                <img src="${invoice.qr_code || 'data:image/png;base64,...'}" alt="QR Code" style="width: 150px; height: 150px;" />
              </div>
            </div>
            <div class="info-box-left">
              <div>
                <p class="font-bold">Invoice reference number (IRN)</p>
                <p>${invoice.invoice_number || 'غير محدد'}</p>
              </div>
              <div>
                <p class="font-bold">Issue Date</p>
                <p>${new Date(invoice.issue_date || '').toISOString().split('T')[0] || 'غير محدد'}</p>
              </div>
              <div>
                <p class="font-bold">Supply Date</p>
                <p>${new Date(invoice.issue_date || '').toISOString().split('T')[0] || 'غير محدد'}</p>
              </div>
            </div>
          </div>

          <!-- Buyer Information Section -->
          <div class="buyer-info">
            <div class="buyer-header">
              <div class="text-right">
                <h2 class="font-bold">تحديد هوية العميل</h2>
                <p class="text-xs text-gray">اسم العميل</p>
              </div>
              <div class="text-left">
                <h2 class="font-bold">Buyer Identification</h2>
                <p class="text-xs text-gray">Buyer Name</p>
              </div>
            </div>
            <div class="buyer-content">
              <div class="text-right">
                <div class="bg-gray">${invoice.company?.name || 'شركة نماذج فاتورة المحدودة'}</div>
              </div>
              <div class="text-left">
                <div class="bg-gray">${invoice.company?.name || 'Fatoora Samples LTD'}</div>
              </div>
            </div>
            <div class="buyer-content">
              <div class="text-right">
                <p class="font-bold">رقم تسجيل ضريبة القيمة المضافة</p>
              </div>
              <div class="text-left">
                <p class="font-bold">VAT Registration Number</p>
              </div>
            </div>
            <div class="buyer-content">
              <div class="text-right">
                <div class="bg-gray">${invoice.company?.vat_number || '399999999800003'}</div>
              </div>
              <div class="text-left">
                <div class="bg-gray">${invoice.company?.vat_number || '399999999800003'}</div>
              </div>
            </div>
            <div class="buyer-content">
              <div class="text-right">
                <p class="font-bold">العنوان</p>
              </div>
              <div class="text-left">
                <p class="font-bold">Address</p>
              </div>
            </div>
            <div class="buyer-content">
              <div class="text-right">
                <div class="bg-gray">${invoice.company?.address || 'الامير سلطان'}</div>
              </div>
              <div class="text-left">
                <div class="bg-gray">${invoice.company?.address || 'Prince Sultan'}</div>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div class="table-container">
            <h3>معلومات وبيانات السلعة أو الخدمة / Items Line</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>وصف السلعة أو الخدمة</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>معدل ضريبة القيمة المضافة</th>
                  <th>مبلغ ضريبة القيمة المضافة</th>
                  <th>إجمالي المبلغ غير شامل ضريبة القيمة المضافة</th>
                  <th>إجمالي المبلغ شامل ضريبة القيمة المضافة</th>
                </tr>
                <tr>
                  <th></th>
                  <th>Product or Service Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>VAT Rate</th>
                  <th>VAT Amount</th>
                  <th>Subtotal Exclusive of VAT</th>
                  <th>Subtotal Inclusive of VAT</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items?.map((item, index) => {
                  const subtotal = item.quantity * item.unit_price;
                  const totalWithVat = subtotal + item.vat_amount;
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${item.description || 'لا يوجد وصف'}</td>
                      <td>${formatQuantity(item.quantity)}</td>
                      <td>${formatCurrency(item.unit_price)}</td>
                      <td>${item.vat_rate}%</td>
                      <td>${formatCurrency(item.vat_amount)}</td>
                      <td>${formatCurrency(subtotal)}</td>
                      <td>${formatCurrency(totalWithVat)}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="8">لا توجد عناصر متاحة</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Summary Section -->
          <div class="summary">
            <div class="summary-box">
              <div>
                <span class="font-bold">المبلغ الخاضع للضريبة (غير شامل ضريبة القيمة المضافة)</span>
                <span>${formatCurrency((invoice.total_amount || 0) - (invoice.vat_amount || 0))}</span>
              </div>
              <div>
                <span class="font-bold">اجمالى مبلغ ضريبة القيمة المضافة</span>
                <span>${formatCurrency(invoice.vat_amount || 0)}</span>
              </div>
              <div>
                <span class="font-bold">إجمالي قيمة الفاتورة (شامل ضريبة القيمة المضافة)</span>
                <span>${formatCurrency(invoice.total_amount || 0)}</span>
              </div>
            </div>
          </div>

          <!-- Payment Terms -->
          <div class="terms">
            <h3>شروط الدفع / Payment Terms</h3>
            <div class="buyer-content">
              <div class="text-right">
                <div class="bg-gray">نقدًا</div>
              </div>
              <div class="text-left">
                <div class="bg-gray">Cash</div>
              </div>
            </div>
          </div>

          <!-- Bank Information -->
          <div class="bank-info">
            <div class="bank-info-right">
              <h3>معلومات البنك</h3>
              <p>اسم البنك: ${user.bank_name || 'غير محدد'}</p>
              <p>الايبان: ${toArabicDigits(user.iban || 'غير محدد')}</p>
              <p>اسم المستفيد: شركة المعايير العصرية لتقنية المعلومات</p>
            </div>
            <div class="bank-info-left">
              <h3>Bank Information</h3>
              <p>Bank Name: ${fullBankNameEnglish}</p>
              <p>IBAN: ${user.iban || 'N/A'}</p>
              <p>Beneficiary Name: Modern Standards Information Technology</p>
            </div>
          </div>

          <!-- Notes -->
          <div class="notes">
            <h3>ملاحظات إضافية</h3>
            <p>${invoice.notes ? `${invoice.notes}` : 'لا توجد ملاحظات إضافية.'}</p>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>تم إصدار هذه الفاتورة إلكترونياً وهي معتمدة من هيئة الزكاة والضريبة والجمارك</p>
            <p>© ${new Date().getFullYear()} شركة المعايير العصرية لتقنية المعلومات - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Set the content and generate PDF
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: `Invoice-${invoice.invoice_number}.pdf`,
      format: 'A4',
      printBackground: true,
      margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
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

module.exports = { generateEnglishInvoicePDF };