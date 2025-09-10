import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  Calculator, 
  FileText, 
  Package,
  DollarSign,
  Eye,
  Edit
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface InvoiceItem {
  id?: number;
  name: string;
  code: string;
  quantity: number;
  price_before_vat: number;
  vat_rate: number;
  vat_amount: number;
  price_with_vat: number;
  total_amount: number;
  item_type: 'purchase' | 'expense'; // New field to distinguish item types
}

interface PurchaseInvoice {
  id: number;
  invoice_number: string;
  total_amount: number;
  vat_amount: number;
  supplier_name: string;
  project_name: string;
  notes?: string;
  created_at: string;
  file_url?: string;
}

function InvoiceBreakdown() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const selectRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const defaultVatRate = 15;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchInvoiceDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/purchases/${invoiceId}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoice details');
      }

      const result = await response.json();
      if (result.success) {
        const invoiceData = {
          ...result.data,
          total_amount: parseFloat(result.data.total_amount) || 0,
          vat_amount: parseFloat(result.data.vat_amount) || 0
        };
        setInvoice(invoiceData);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      toast.error('خطأ في جلب تفاصيل الفاتورة');
      handleBackNavigation();
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceItems = async () => {
    try {
      const response = await fetch(`/api/purchases/${invoiceId}/items`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const processedItems = (result.data || []).map((item: any) => ({
            ...item,
            quantity: parseInt(item.quantity) || 0,
            price_before_vat: parseFloat(item.price_before_vat) || 0,
            vat_rate: parseFloat(item.vat_rate) || 0,
            vat_amount: parseFloat(item.vat_amount) || 0,
            price_with_vat: parseFloat(item.price_with_vat) || 0,
            total_amount: parseFloat(item.total_amount) || 0
          }));
          setItems(processedItems);
        }
      }
    } catch (error) {
      console.error('Error fetching invoice items:', error);
      toast.error('خطأ في جلب عناصر الفاتورة');
    }
  };

  const calculateItemTotals = (item: Partial<InvoiceItem>): InvoiceItem => {
    const quantity = Number(item.quantity) || 0;
    const priceBeforeVat = Number(item.price_before_vat) || 0;
    const vatRate = Number(item.vat_rate) || defaultVatRate;

    const vatAmount = priceBeforeVat * vatRate / 100;
    const priceWithVat = priceBeforeVat + vatAmount;
    const totalAmount = quantity * priceWithVat;

    return {
      id: item.id,
      name: item.name || '',
      code: item.code || '',
      quantity,
      price_before_vat: priceBeforeVat,
      vat_rate: vatRate,
      vat_amount: Number(vatAmount.toFixed(2)),
      price_with_vat: Number(priceWithVat.toFixed(2)),
      total_amount: Number(totalAmount.toFixed(2)),
      item_type: item.item_type || 'purchase'
    };
  };

  const addNewItem = () => {
    const newItem: InvoiceItem = {
      name: '',
      code: '',
      quantity: 1,
      price_before_vat: 0,
      vat_rate: defaultVatRate,
      vat_amount: 0,
      price_with_vat: 0,
      total_amount: 0,
      item_type: 'purchase'
    };
    
    const calculatedItem = calculateItemTotals(newItem);
    const newItems = [...items, calculatedItem];
    setItems(newItems);
    
    setTimeout(() => {
      const lastIndex = newItems.length - 1;
      if (selectRefs.current[lastIndex]) {
        selectRefs.current[lastIndex]?.focus();
      }
    }, 100);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    if (['quantity', 'price_before_vat', 'vat_rate'].includes(field)) {
      updatedItems[index] = calculateItemTotals(updatedItems[index]);
    }
    
    setItems(updatedItems);
  };

  const removeItem = (index: number) => {
    if (window.confirm('هل أنت متأكد من حذف هذا العنصر؟')) {
      const updatedItems = items.filter((_, i) => i !== index);
      setItems(updatedItems);
    }
  };

  const saveItems = async () => {
    try {
      setSaving(true);
      
      const validItems = items.filter(item => item.name.trim() && item.quantity > 0);
      
      if (validItems.length === 0) {
        toast.error('يجب إضافة عنصر واحد على الأقل');
        return;
      }

      const response = await fetch(`/api/purchases/${invoiceId}/items`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ items: validItems })
      });

      const result = await response.json();
      
      if (result.success) {
        await fetch(`/api/purchases/${invoiceId}/update-totals`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        
        toast.success('تم حفظ عناصر الفاتورة بنجاح');
        fetchInvoiceItems();
      } else {
        toast.error(result.error || 'خطأ في حفظ العناصر');
      }
    } catch (error) {
      console.error('Error saving items:', error);
      toast.error('خطأ في حفظ العناصر');
    } finally {
      setSaving(false);
    }
  };

  const calculateTotals = () => {
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const totalBeforeVat = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.price_before_vat)), 0);
    const totalVat = Number((totalBeforeVat * defaultVatRate / 100).toFixed(2));
    const totalWithVat = Number((totalBeforeVat + totalVat).toFixed(2));

    return {
      totalQuantity,
      totalBeforeVat: Number(totalBeforeVat.toFixed(2)),
      totalVat,
      totalWithVat
    };
  };

  const handleBackNavigation = () => {
    const returnToProjectView = location.state?.returnToProjectView;
    const returnProjectId = location.state?.returnProjectId;
    const returnProjectName = location.state?.returnProjectName;

    if (returnToProjectView && returnProjectId) {
      navigate(`/dashboard/project-purchases/${returnProjectId}`, {
        state: { 
          projectName: returnProjectName,
          fromProjectView: true 
        }
      });
    } else {
      navigate('/dashboard/purchases');
    }
  };

  const totals = calculateTotals();

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails();
      fetchInvoiceItems();
    }
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85]"></div>
        <p className="mr-3 text-gray-500">جاري التحميل...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">لم يتم العثور على الفاتورة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick rtl />
      <div className="flex items-center gap-4">
        <button
          onClick={handleBackNavigation}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          title="العودة"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">تفريغ الفاتورة</h1>
          <p className="text-gray-600 mt-1">إضافة وإدارة عناصر الفاتورة رقم: {invoice.invoice_number}</p>
        </div>
        <div className="flex gap-3">
          {invoice.file_url && (
            <button
              onClick={() => window.open(invoice.file_url, '_blank')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              عرض الفاتورة
            </button>
          )}
          <button
            onClick={saveItems}
            disabled={saving || items.length === 0}
            className="bg-[#4A3B85] text-white px-4 py-2 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ العناصر'}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">رقم الفاتورة</p>
            <p className="text-lg font-bold text-gray-900">{invoice.invoice_number}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">المورد</p>
            <p className="text-lg font-bold text-gray-900">{invoice.supplier_name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">المشروع</p>
            <p className="text-lg font-bold text-gray-900">{invoice.project_name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">إجمالي الفاتورة</p>
            <p className="text-lg font-bold text-green-600">
              {Number(invoice.total_amount).toFixed(2)} ر.س
            </p>
          </div>
        </div>
        {invoice.notes && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-600">ملاحظات</p>
            <p className="text-gray-900">{invoice.notes}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">عناصر الفاتورة</h3>
            <button
              onClick={addNewItem}
              className="flex items-center text-[#4A3B85] hover:text-[#5A4B95] transition-colors duration-200"
            >
              <Plus className="h-4 w-4 ml-2" />
              إضافة عنصر
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  اسم العنصر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الكود
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الكمية
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  السعر قبل الضريبة
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  نسبة الضريبة %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  قيمة الضريبة
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  السعر مع الضريبة
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الإجمالي
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  نوع العنصر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      ref={el => selectRefs.current[index] = el}
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(index, 'name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                      placeholder="اسم العنصر"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.code}
                      onChange={(e) => updateItem(index, 'code', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                      placeholder="الكود"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.price_before_vat}
                      onChange={(e) => updateItem(index, 'price_before_vat', parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      disabled
                      min="0"
                      max="100"
                      value={item.vat_rate}
                      onChange={(e) => updateItem(index, 'vat_rate', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {Number(item.vat_amount).toFixed(2)} ر.س
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {Number(item.price_with_vat).toFixed(2)} ر.س
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {Number(item.total_amount).toFixed(2)} ر.س
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={item.item_type}
                      onChange={(e) => updateItem(index, 'item_type', e.target.value as 'purchase' | 'expense')}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent text-sm"
                    >
                      <option value="purchase">عنصر شراء</option>
                      <option value="expense">مصروف</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-900 transition-colors duration-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p>لا توجد عناصر في الفاتورة</p>
                    <button
                      onClick={addNewItem}
                      className="mt-2 text-[#4A3B85] hover:text-[#5A4B95] font-medium"
                    >
                      إضافة العنصر الأول
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {items.length > 0 && (
          <div className="border-t bg-gray-50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">إجمالي الكمية</p>
                <p className="text-lg font-bold text-gray-900">{totals.totalQuantity}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">المجموع قبل الضريبة</p>
                <p className="text-lg font-bold text-gray-900">{totals.totalBeforeVat.toFixed(2)} ر.س</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">إجمالي الضريبة</p>
                <p className="text-lg font-bold text-orange-600">{totals.totalVat.toFixed(2)} ر.س</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">المجموع الكلي</p>
                <p className="text-xl font-bold text-green-600">{totals.totalWithVat.toFixed(2)} ر.س</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-center">
        <button
          onClick={addNewItem}
          className="bg-[#4A3B85] text-white px-6 py-3 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2 mx-auto"
        >
          <Plus className="h-5 w-5" />
          إضافة عنصر جديد
        </button>
      </div>
    </div>
  );
}

export default InvoiceBreakdown;