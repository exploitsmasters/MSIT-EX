import React, { useRef, useState, useEffect } from 'react';
import { X, Download, Printer, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sale } from '../types/sales';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'react-qr-code';
import { toast } from 'react-toastify';

// Utility function to encode TLV for ZATCA QR code
const toTLV = (tag: number, value: string): Uint8Array => {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const length = valueBytes.length;
  const tlv = new Uint8Array(2 + length);
  tlv[0] = tag;
  tlv[1] = length;
  tlv.set(valueBytes, 2);
  return tlv;
};

// Utility function to convert Uint8Array to Base64 string for QR code
const arrayToBase64 = (array: Uint8Array): string => {
  const binary = Array.from(array)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return btoa(binary);
};

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  base_unit_price: number;
  interest_rate: number;
}

interface Company {
  name: string;
  vat_number: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
}

interface Invoice {
  id: number;
  number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  vat_amount: number;
  status: string;
  notes?: string | null;
  terms?: string | null;
  created_at: string;
  company: Company | undefined;
  items?: InvoiceItem[];
  qr_code?: string | undefined;
  zatca_invoice_hash?: string | undefined;
}

interface InvoicePreviewProps {
  invoice: Invoice;
  onClose: () => void;
  onBack?: () => void;
}

function InvoicePreview({ invoice, onClose, onBack }: InvoicePreviewProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const companyLogo = 'http://localhost:5173/logo-text.png';
  const companyName = 'المعايير العصرية لتقنية المعلومات';
  const [reportingInvoiceId, setReportingInvoiceId] = useState<number | null>(null);

  const sale: Sale = {
  id: invoice.id as number,
  invoice_number: invoice.number,
  issueDate: invoice.issue_date,
  supplyDate: invoice.issue_date, // Fallback to issue_date
  dueDate: invoice.due_date,
  total: invoice.total_amount,
  vat_amount: invoice.vat_amount, // Added required field
  status: invoice.status as 'draft' | 'issued' | 'paid' | 'cancelled' | 'certified',
  customerName: invoice.company?.name || '',
  customerVatNumber: invoice.company?.vat_number || '',
  createdAt: invoice.created_at || new Date().toISOString(),
  projectName: null,
  companyId: undefined,
  notes: invoice.notes || null,
  terms: invoice.terms || null,
  qr_code: invoice.qr_code || undefined,
  zatca_invoice_hash: invoice.zatca_invoice_hash || undefined,
  invoice_type_code: undefined,
  invoice_type_name: undefined,
  certification_status: '', // Added required field
  company: {
    name: invoice.company?.name || companyName,
    vat_number: invoice.company?.vat_number || '399999999900003',
    address: invoice.company?.address || 'الامير سلطان',
    city: invoice.company?.city || null,
    postal_code: invoice.company?.postal_code || null,
    phone: invoice.company?.phone || null,
    email: invoice.company?.email || null,
    type: 'company',
  },
  items: invoice.items?.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    base_unit_price: item.base_unit_price,
    vatRate: item.vat_rate,
    vatAmount: item.vat_amount,
    totalAmount: item.total_amount,
    code: undefined,
    discount_rate: undefined,
    interest_rate: item.interest_rate,
    total_vat_amount: undefined,
    price_after_tax: undefined,
  })) || [],
};

  const handlePrintInvoice = async (sale: Sale) => {
    try {
      console.log(`Starting print for invoice ${sale.id}`);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/invoices/${sale.id}/regenerate-pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: sale.status }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل في جلب الفاتورة');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        console.log(`Iframe loaded for invoice ${sale.id}`);
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        const cleanup = () => {
          console.log(`Cleaning up iframe for invoice ${sale.id}`);
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
          window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 20000);
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ أثناء طباعة الفاتورة';
      console.error(`Print error for invoice ${sale.id}:`, errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (invoice.status === 'certified') return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpi = 96;
    const mmToPx = dpi / 25.4;
    const a4WidthPx = 210 * mmToPx;
    const a4HeightPx = 297 * mmToPx;
    canvas.width = a4WidthPx;
    canvas.height = a4HeightPx;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 230px Tajawal';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';

    const text = 'مــسـودة';
    const centerX = a4WidthPx / 2;
    const centerY = a4HeightPx / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-Math.PI / 4);

    let textWidth = ctx.measureText(text).width;
    let textHeight = 150;
    const diagonalLength = Math.sqrt(a4WidthPx * a4WidthPx + a4HeightPx * a4HeightPx);
    const desiredTextWidth = diagonalLength * 0.8;
    if (textWidth < desiredTextWidth) {
      const newFontSize = (150 * desiredTextWidth) / textWidth;
      ctx.font = `bold ${newFontSize}px Tajawal`;
      textHeight = newFontSize;
    }

    const padding = 18;
    const backgroundWidth = textWidth + padding * 8;
    const backgroundHeight = textHeight + padding * 1;
    const borderRadius = 50;

    ctx.beginPath();
    ctx.moveTo(-backgroundWidth / 2 + borderRadius, -backgroundHeight / 2);
    ctx.lineTo(backgroundWidth / 2 - borderRadius, -backgroundHeight / 2);
    ctx.quadraticCurveTo(backgroundWidth / 2, -backgroundHeight / 2, backgroundWidth / 2, -backgroundHeight / 2 + borderRadius);
    ctx.lineTo(backgroundWidth / 2, backgroundHeight / 2 - borderRadius);
    ctx.quadraticCurveTo(backgroundWidth / 2, backgroundHeight / 2, backgroundWidth / 2 - borderRadius, backgroundHeight / 2);
    ctx.lineTo(-backgroundWidth / 2 + borderRadius, backgroundHeight / 2);
    ctx.quadraticCurveTo(-backgroundWidth / 2, backgroundHeight / 2, -backgroundWidth / 2, backgroundHeight / 2 - borderRadius);
    ctx.lineTo(-backgroundWidth / 2, -backgroundHeight / 2 + borderRadius);
    ctx.quadraticCurveTo(-backgroundWidth / 2, -backgroundHeight / 2, -backgroundWidth / 2 + borderRadius, -backgroundHeight / 2);
    ctx.closePath();

    ctx.save();
    ctx.clip();

    ctx.fillStyle = 'rgba(255, 116, 116, 0.3)';
    ctx.fillRect(-backgroundWidth / 2, -backgroundHeight / 2, backgroundWidth, backgroundHeight);

    const noiseDensity = 1000;
    ctx.fillStyle = 'rgba(252, 0, 0, 0.1)';
    for (let i = 0; i < noiseDensity; i++) {
      const x = -backgroundWidth / 2 + Math.random() * backgroundWidth;
      const y = -backgroundHeight / 2 + Math.random() * backgroundHeight;
      const radius = Math.random() * 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(253, 253, 253, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(text, 0, 0);
    ctx.strokeText(text, 0, 0);

    ctx.restore();

    setWatermarkUrl(canvas.toDataURL('image/png'));

    return () => {
      setWatermarkUrl(null);
    };
  }, [invoice.status]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number | undefined): JSX.Element => {
  if (amount === undefined) {
    return (
      <span className="text-gray-800 font-semibold font-mono" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
        0 ﷼
      </span>
    );
  }
  return (
    <span
      className="text-gray-800 font-semibold font-mono"
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
    >
      {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
    </span>
  );
};

  const formatQuantity = (quantity: number | undefined): JSX.Element => {
  if (quantity === undefined) {
    return (
      <span className="font-mono" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
        0
      </span>
    );
  }
  return (
    <span className="font-mono" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
      {quantity % 1 === 0 ? quantity.toLocaleString('en-US') : quantity.toFixed(0)}
    </span>
  );
};

  const toArabicDigits = (number: string | number): string => {
    return String(number).replace(/\d/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  };

  const downloadPDF = async (language: 'ar' | 'en') => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage');
        alert('يرجى تسجيل الدخول لتحميل PDF');
        return;
      }

      const endpoint = language === 'ar' ? '/api/generate-invoicePDF-ar' : '/api/generate-invoicePDF-en';
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ invoice }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${invoice.number}${language === 'en' ? '-EN' : ''}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error(`Error generating ${language === 'ar' ? 'Arabic' : 'English'} PDF:`, error.message);
      alert(`فشل في تحميل PDF: ${error.message}`);
    }
  };

  const generateBasicQRCode = () => {
    const timestamp = new Date(invoice.issue_date).toISOString();
    const totalAmountNum = Number(invoice.total_amount) || 0;
    const vatAmountNum = Number(invoice.vat_amount) || 0;
    const totalAmount = totalAmountNum.toFixed(2);
    const vatAmount = vatAmountNum.toFixed(2);

    if (isNaN(totalAmountNum) || isNaN(vatAmountNum)) {
      console.warn('Invalid total_amount or vat_amount:', {
        total_amount: invoice.total_amount,
        vat_amount: invoice.vat_amount,
      });
    }

    const sellerNameTLV = toTLV(1, invoice.company?.name || companyName);
    const vatNumberTLV = toTLV(2, invoice.company?.vat_number || '399999999900003');
    const timestampTLV = toTLV(3, timestamp);
    const totalAmountTLV = toTLV(4, totalAmount);
    const vatAmountTLV = toTLV(5, vatAmount);

    const combinedLength =
      sellerNameTLV.length +
      vatNumberTLV.length +
      timestampTLV.length +
      totalAmountTLV.length +
      vatAmountTLV.length;
    const qrData = new Uint8Array(combinedLength);
    let offset = 0;

    qrData.set(sellerNameTLV, offset);
    offset += sellerNameTLV.length;
    qrData.set(vatNumberTLV, offset);
    offset += vatNumberTLV.length;
    qrData.set(timestampTLV, offset);
    offset += timestampTLV.length;
    qrData.set(totalAmountTLV, offset);
    offset += totalAmountTLV.length;
    qrData.set(vatAmountTLV, offset);

    return arrayToBase64(qrData);
  };

  const getQRCode = () => {
    if (invoice.status === 'certified' && invoice.qr_code) {
      return invoice.qr_code;
    }
    return generateBasicQRCode();
  };

  const fullAddress = [
    invoice.company?.address ? `حي ${invoice.company.address}` : '',
    invoice.company?.city ? `${invoice.company.city}` : '',
  ].filter(part => part).join(', ') || 'الأمير سلطان، الرياض';

  const fullAddressEnglish = invoice.company?.address ? `${invoice.company.address}, ${invoice.company?.city || 'Riyadh'}` : 'Prince Sultan, Riyadh';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:bg-transparent print:m-0 print:p-0">
      <style>
        {`
          @media print {
            @page { margin: 6; }
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          }
        `}
      </style>
      {/* Controls fixed on top-right */}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-start gap-2 print:hidden">
        <button
          onClick={onClose}
          className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-full"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col gap-2 items-start">
          <button
            onClick={() => handlePrintInvoice(sale)}
            disabled={reportingInvoiceId === Number(sale.id)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transform transition-transform duration-200 hover:scale-105"
            title="Use this button for the official PDF print"
          >
            طباعة الفاتورة
          </button>
          <button
            onClick={() => downloadPDF('ar')}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transform transition-transform duration-200 hover:scale-105"
          >
            تحميل PDF
          </button>
          <button
            onClick={handleBack}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transform transition-transform duration-200 hover:scale-105"
          >
            رجوع
          </button>
        </div>
      </div>

      <div className="bg-white relative rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto no-scrollbar print:shadow-none print:max-w-none print:max-h-none print:overflow-visible print:w-[210mm] print:min-h-[297mm]">
        {/* Invoice Document */}
        <div className="p-8 print:p-0" dir="rtl" ref={invoiceRef}>
          <div className="max-w-full mx-auto bg-white shadow-sm print:shadow-none print:m-0">
            {/* Watermark for draft invoices */}
            {invoice.status !== 'certified' && (
              <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10 print:relative print:flex print:items-center print:justify-center">
                <div className="transform rotate-45 text-8xl text-green-500 font-bold opacity-30 print:text-6xl">
                  مسودة DRAFT
                </div>
              </div>
            )}

            {/* Header Section */}
            <div className="flex justify-between items-start border border-green-600 rounded-lg p-4 mb-6 bg-green-50 print:bg-white print:p-2 print:m-0">
              <div className="w-1/3 text-right">
                <h1 className="text-lg font-bold text-green-600 mb-2">{companyName}</h1>
                <p className="text-sm mb-1"><strong>الرقم الضريبي:</strong> {toArabicDigits(invoice.company?.vat_number || '399999999900003')}</p>
                <p className="text-sm mb-1"><strong>السجل التجاري:</strong> {toArabicDigits('1010123456')}</p>
                <p className="text-sm"><strong>العنوان:</strong> {fullAddress}</p>
              </div>
              <div className="w-1/3 flex justify-center">
                <img 
                  src={companyLogo || "/api/placeholder/120/80"} 
                  alt="Company Logo" 
                  className="w-35 h-16"
                />
              </div>
              <div className="w-1/3 text-left" dir="ltr">
                <h1 className="text-sm font-bold text-green-600 mb-2">Modern Standards Information Technology</h1>
                <p className="text-xs mb-1"><strong>Tax No.:</strong> {invoice.company?.vat_number || '399999999900003'}</p>
                <p className="text-xs mb-1"><strong>C.R:</strong> 1010123456</p>
                <p className="text-xs"><strong>Address:</strong> {fullAddressEnglish}</p>
              </div>
            </div>

            {/* Title Section */}
            <div className="text-center mb-6 p-4 bg-gray-100 rounded-lg border border-gray-300 border-l-4 border-r-4 border-l-green-600 border-r-green-600 print:bg-white print:p-2 print:m-0">
              <h1 className="text-2xl font-bold text-green-600 tracking-wide">فاتورة ضريبية TAX INVOICE</h1>
            </div>

            {/* Info Grid with QR Code */}
            <div className="flex justify-between items-stretch bg-gray-100 border border-gray-300 rounded-lg p-4 mb-6 border-l-4 border-r-4 border-l-green-600 border-r-green-600 print:bg-white print:p-2 print:m-0">
              <div className="w-1/3 text-right">
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">الرقم التسلسلي</h3>
                  <p className="text-sm text-gray-700">{sale.invoice_number || 'غير محدد'}</p>
                </div>
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">تاريخ إصدار الفاتورة</h3>
                  <p className="text-sm text-gray-700">{formatDate(sale.issueDate) || 'غير محدد'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">تاريخ التوريد</h3>
                  <p className="text-sm text-gray-700">{formatDate(sale.supplyDate || sale.issueDate) || 'غير محدد'}</p>
                </div>
              </div>
              <div className="w-1/4 flex items-center justify-center">
                <div className="w-28 h-28 bg-white border border-gray-300 rounded-lg p-2 shadow-md flex items-center justify-center print:shadow-none print:p-1">
                  <QRCode value={getQRCode()} size={100} className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="w-1/3 text-left" dir="ltr">
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">Invoice Reference Number (IRN)</h3>
                  <p className="text-sm text-gray-700">{sale.invoice_number || 'Not specified'}</p>
                </div>
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">Issue Date</h3>
                  <p className="text-sm text-gray-700">{new Date(sale.issueDate).toISOString().split('T')[0] || 'Not specified'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wide">Supply Date</h3>
                  <p className="text-sm text-gray-700">{new Date(sale.supplyDate || sale.issueDate).toISOString().split('T')[0] || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Buyer Information Section */}
            <div className="bg-white border border-green-600 rounded-lg mb-6 overflow-hidden shadow-md print:shadow-none print:p-2 print:m-0">
              <div className="flex border-b border-gray-200">
                <div className="w-1/2 p-3 text-right">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">اسم العميل:</span>
                    <span className="text-gray-700 font-medium">{sale.customerName || 'شركة نماذج فاتورة المحدودة'}</span>
                  </div>
                </div>
                <div className="w-1/2 p-3 text-left" dir="ltr">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">Buyer Name:</span>
                    <span className="text-gray-700 font-medium">{sale.customerName || 'Fatoora Samples LTD'}</span>
                  </div>
                </div>
              </div>
              <div className="flex border-b border-gray-200">
                <div className="w-1/2 p-3 text-right">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">رقم ض.ق.م:</span>
                    <span className="text-gray-700 font-medium">{toArabicDigits(sale.customerVatNumber || '399999999800003')}</span>
                  </div>
                </div>
                <div className="w-1/2 p-3 text-left" dir="ltr">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">VAT No:</span>
                    <span className="text-gray-700 font-medium">{sale.customerVatNumber || '399999999800003'}</span>
                  </div>
                </div>
              </div>
              <div className="flex">
                <div className="w-1/2 p-3 text-right">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">العنوان:</span>
                    <span className="text-gray-700 font-medium">{fullAddress}</span>
                  </div>
                </div>
                <div className="w-1/2 p-3 text-left" dir="ltr">
                  <div className="bg-gray-100 rounded p-3 flex items-center gap-2 print:bg-white print:p-1">
                    <span className="text-green-600 font-bold text-sm">Address:</span>
                    <span className="text-gray-700 font-medium">{fullAddressEnglish}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-green-600 rounded-lg mb-6 overflow-hidden print:p-2 print:m-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                    <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">#</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">الوصف<br />Description</th>
                    <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">الكمية<br />Quantity</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">السعر الاصلي<br />Base Unit Price</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400"> نسبة هامش الربح<br />Margin %</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">هامش الربح<br />Margin</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">السعر بعد الهامش<br />Unit Price</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center border-r border-green-400">الاجمالي<br />Subtotal Ex</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items?.map((item, index) => {
                    const subtotal = item.quantity * item.unitPrice;
                    const margin = item.unitPrice - item.base_unit_price;
                    
                    return (
                      <tr key={index} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-green-50 transition-colors print:hover:bg-none`}>
                        <td className="px-2 py-3 text-center text-sm border-b border-gray-200">{index + 1}</td>
                        <td className="px-4 py-3 text-right text-sm border-b border-gray-200 max-w-xs break-words whitespace-pre-wrap">
                          {item.description || 'لا يوجد وصف'}
                        </td>
                        <td className="px-2 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          {formatQuantity(item.quantity)}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          {formatCurrency(item.base_unit_price)} {/* Added Base Unit Price */}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          %{item.interest_rate}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          {formatCurrency(margin)}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-mono font-semibold border-b border-gray-200">
                          {formatCurrency(subtotal)}
                        </td>
                      </tr>
                    );
                  }) || (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">لا توجد عناصر متاحة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals Box */}
            <div className="flex justify-end mb-6 print:p-2 print:m-0">
              <div className="w-80 bg-white border border-green-600 rounded-lg p-6 shadow-md print:shadow-none print:p-2">
                <div className="flex justify-between items-center py-2 border-b border-green-600 text-sm">
                  <span className="text-gray-700 font-medium">الاجمالي الفرعي قبل الضريبة:<br />Subtotal Excl. VAT</span>
                  <span className="text-gray-800 font-semibold font-mono">
                    {formatCurrency(Number(sale.total) - invoice.vat_amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-green-600 text-sm">
                  <span className="text-gray-700 font-medium">قيمة الضريبة (15%):<br />VAT</span>
                  <span className="text-gray-800 font-semibold font-mono">{formatCurrency(invoice.vat_amount)}</span>
                </div>
                <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-green-600 text-base font-bold text-gray-800">
                  <span>الاجمالي شامل الضريبة:<br />Total Incl. VAT</span>
                  <span className="font-mono">{formatCurrency(Number(sale.total))}</span>
                </div>
              </div>
            </div>

            {/* Bank Information */}
            <div className="bg-white border border-green-600 rounded-lg p-6 mb-6 shadow-md w-5/7 mr-8 print:shadow-none print:w-full print:mr-0 print:p-2 print:m-0">
              <div className="flex justify-between">
                <div className="w-1/2 text-right">
                  <h3 className="text-sm font-bold text-green-600 mb-4 uppercase tracking-wide">معلومات البنك</h3>
                  <div className="text-sm mb-2 text-gray-700"><strong>اسم البنك:</strong> بنك البلاد</div>
                  <div className="text-sm mb-2 text-gray-700"><strong>الايبان:</strong> {toArabicDigits('SA1234567890123456789012')}</div>
                  <div className="text-sm text-gray-700"><strong>اسم المستفيد:</strong> {companyName}</div>
                </div>
                <div className="w-1/2 text-left" dir="ltr">
                  <h3 className="text-sm font-bold text-green-600 mb-4 uppercase tracking-wide">Bank Information</h3>
                  <div className="text-sm mb-2 text-gray-700"><strong>Bank Name:</strong> BSF</div>
                  <div className="text-sm mb-2 text-gray-700"><strong>IBAN:</strong> SA1234567890123456789012</div>
                  <div className="text-sm text-gray-700"><strong>Beneficiary Name:</strong> Modern Standards Information Technology</div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-6 mb-8 border-l-4 border-r-4 border-l-green-600 border-r-4-green-600 w-5/7 mr-8 print:bg-white print:w-full print:mr-0 print:p-2 print:m-0">
              <h3 className="text-sm font-bold text-green-600 mb-3 uppercase tracking-wide">ملاحظات إضافية</h3>
              <p className="text-sm leading-relaxed text-gray-700 text-right">
                {sale.notes || 'لا توجد ملاحظات إضافية.'}
              </p>
            </div>

            {/* Footer */}
            <div className="text-center p-6 bg-gray-100 rounded-lg border-t-4 border-green-600 w-5/7 mr-8 print:bg-white print:w-full print:mr-0 print:p-2 print:m-0">
              <p className="text-xs text-gray-600 mb-2">تم إصدار هذه الفاتورة إلكترونياً وهي معتمدة من هيئة الزكاة والضريبة والجمارك</p>
              <p className="text-xs text-gray-600">
                © {new Date().getFullYear()} {companyName} - جميع الحقوق محفوظة
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoicePreview;