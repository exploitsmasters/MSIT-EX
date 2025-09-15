import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Plus, Trash2, Search } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Select, { components, SingleValueProps } from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ar } from 'date-fns/locale';
import { format, parse } from 'date-fns';
import CreateInvoiceCustomerModal, { CustomerFormData } from './CreateInvoiceCustomerModal';

interface Sale {
  id: number;
  invoice_number: string;
  issueDate: string;
  supplyDate?: string;
  dueDate: string;
  total: number | string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled' | 'certified';
  customerName: string;
  customerVatNumber: string;
  createdAt: string;
  projectName: string | null;
  companyId?: number;
  notes?: string | null;
  terms?: string | null;
  qr_code?: string;
  zatca_invoice_hash?: string;
  invoice_type_code?: string;
  invoice_type_name?: string;
  discount_rate?: number | null;
  interest_rate?: number | null;
  company?: {
    name: string;
    vat_number: string;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    phone?: string | null;
    email?: string | null;
    type?: 'individual' | 'company';
  };
  items: {
    description: string;
    quantity: number;
    base_unit_price: number;
    unitPrice: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    code?: string;
    discount_rate?: number | null;
    interest_rate?: number | null;
    total_vat_amount?: number;
    price_after_tax?: number;
  }[];
}

interface InvoiceItem {
  id: number;
  description: string;
  code: string;
  quantity: number;
  baseUnitPrice: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  totalVatAmount: number;
  priceAfterTax: number;
  totalAmount: number;
  discountRate: number;
  interestRate: number;
  totalAfterTax: number;
}

interface Customer {
  id: number;
  name: string;
  vatNumber: string;
  crNumber: string;
  type: 'individual' | 'company';
  email?: string;
  phone?: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  code: string;
  supplierName: string;
}

interface OptionType {
  value: number | string;
  label: string;
  price?: number;
  code?: string;
  supplierName?: string;
  isSelectAll?: boolean;
}

interface Project {
  id: number;
  name: string;
}

const SingleValue = ({ children, ...props }: SingleValueProps<OptionType>) => (
  <components.SingleValue {...props}>{children}</components.SingleValue>
);

function CreateInvoice() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Sale | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerType, setCustomerType] = useState<'individual' | 'company'>('individual');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const selectRefs = useRef<(ReactSelectRef | null)[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 1,
      description: '',
      code: 'غير محدد',
      quantity: 1,
      baseUnitPrice: 0,
      unitPrice: 0,
      vatRate: 15,
      vatAmount: 0,
      totalVatAmount: 0,
      priceAfterTax: 0,
      totalAmount: 0,
      discountRate: 0,
      interestRate: 0,
      totalAfterTax: 0,
    },
  ]);
  const [dueDate, setDueDate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [supplyDate, setSupplyDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(['']);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [menuIsOpen, setMenuIsOpen] = useState<boolean[]>([]);
  const [globalDiscountRate, setGlobalDiscountRate] = useState(0);
  const [globalInterestRate, setGlobalInterestRate] = useState(0);

  type ReactSelectRef = {
    focus: () => void;
  };

  const fetchInvoice = async () => {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/invoices/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setInvoiceToEdit(data);
      } else {
        toast.error('فشل في جلب الفاتورة');
      }
    } catch (error) {
      console.error('Error fetching invoice:', error);
      toast.error('حدث خطأ أثناء جلب الفاتورة');
    }
  };

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:3000/api/customers?search=${encodeURIComponent(customerSearchQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers);
      } else {
        toast.error('فشل في جلب العملاء');
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('حدث خطأ أثناء جلب العملاء');
    }
  };

  const fetchProducts = async (page: number, search: string = '') => {
    try {
      const token = localStorage.getItem('token');
      const isSupplierSearch = search && !/\d/.test(search);
      const limit = isSupplierSearch ? 1000 : 20;
      const response = await fetch(
        `http://localhost:3000/api/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&fields=name,price,code,supplierName`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const newProducts = data.products.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          code: p.code || 'غير محدد',
          supplierName: p.supplierName || 'غير محدد',
        }));
        setProducts(prev => (page === 1 ? newProducts : [...prev, ...newProducts]));
        setHasMoreProducts(newProducts.length === limit && !isSupplierSearch);
      } else {
        toast.error('فشل في جلب المنتجات');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
      toast.error('حدث خطأ أثناء جلب المنتجات');
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects);
      } else {
        toast.error('فشل في جلب المشاريع');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('حدث خطأ أثناء جلب المشاريع');
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchProducts(1, productSearchQuery);
    fetchProjects();
    if (id) {
      fetchInvoice();
    }
  }, [customerSearchQuery, productSearchQuery, id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.customer-search-container')) {
        setShowCustomerSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuIsOpen(new Array(items.length).fill(false));
  }, [items.length]);

  useEffect(() => {
    if (invoiceToEdit) {
      const invoiceItems = Array.isArray(invoiceToEdit.items) && invoiceToEdit.items.length > 0
        ? invoiceToEdit.items.map((item, index) => ({
            id: index + 1,
            description: item.description || '',
            code: item.code || 'غير محدد',
            quantity: item.quantity || 1,
            baseUnitPrice: item.base_unit_price || item.unitPrice || 0,
            unitPrice: item.unitPrice || 0,
            vatRate: item.vatRate || 15,
            vatAmount: item.vatAmount || 0,
            totalVatAmount: item.total_vat_amount || item.vatAmount || 0,
            priceAfterTax: item.price_after_tax || (item.unitPrice || 0) + (item.vatAmount || 0),
            totalAmount: item.totalAmount || 0,
            discountRate: item.discount_rate || 0,
            interestRate: item.interest_rate || 0,
            totalAfterTax: 0, // Will be calculated in calculateItemTotals
          }))
        : [
            {
              id: 1,
              description: '',
              code: 'غير محدد',
              quantity: 1,
              baseUnitPrice: 0,
              unitPrice: 0,
              vatRate: 15,
              vatAmount: 0,
              totalVatAmount: 0,
              priceAfterTax: 0,
              totalAmount: 0,
              discountRate: 0,
              interestRate: 0,
              totalAfterTax: 0,
            },
          ];
      setItems(invoiceItems.map(calculateItemTotals));
      setCustomerName(invoiceToEdit.customerName || '');
      setCustomerType(invoiceToEdit.company?.type || 'individual');
      setCustomerEmail(invoiceToEdit.company?.email ?? '');
      setCustomerPhone(invoiceToEdit.company?.phone ?? '');
      setSelectedCustomer({
        id: invoiceToEdit.companyId ?? 0,
        name: invoiceToEdit.customerName || '',
        vatNumber: invoiceToEdit.customerVatNumber || '',
        crNumber: '',
        type: invoiceToEdit.company?.type || 'individual',
        email: invoiceToEdit.company?.email ?? undefined,
        phone: invoiceToEdit.company?.phone ?? undefined,
      });
      setCustomerSearchQuery(invoiceToEdit.customerName || '');
      setIssueDate(invoiceToEdit.issueDate?.split('T')[0] || '');
      setSupplyDate(invoiceToEdit.supplyDate?.split('T')[0] || '');
      setDueDate(invoiceToEdit.dueDate?.split('T')[0] || '');
      setNotes(invoiceToEdit.notes ?? '');
      setTerms(invoiceToEdit.terms ? invoiceToEdit.terms.split('\n') : ['']);
      setSelectedProject(
        invoiceToEdit.projectName
          ? { id: 0, name: invoiceToEdit.projectName }
          : null
      );
    }
  }, [invoiceToEdit]);

  const calculateItemTotals = (item: InvoiceItem): InvoiceItem => {
    const itemInterestRate = item.interestRate || 0;
    const itemDiscountRate = item.discountRate || 0;
    const baseUnitPrice = item.baseUnitPrice;
    const adjustedUnitPrice = item.baseUnitPrice * (1 + itemInterestRate / 100);
    const unitPriceAfterDiscount = adjustedUnitPrice * (1 - itemDiscountRate / 100);
    const vatAmount = Number((unitPriceAfterDiscount * (item.vatRate / 100)).toFixed(3));
    const priceAfterTax = Number((unitPriceAfterDiscount + vatAmount).toFixed(2));
    const subtotal = item.quantity * unitPriceAfterDiscount;
    const totalVatAmount = Number((subtotal * (item.vatRate / 100)).toFixed(3));
    const totalAmount = Number((subtotal).toFixed(2));
    const totalAfterTax = Number((item.quantity * priceAfterTax).toFixed(2));

    console.log(`Item: ${item.description}, baseUnitPrice: ${baseUnitPrice}, unitPrice: ${unitPriceAfterDiscount}, vatAmount: ${vatAmount}, totalAmount: ${totalAmount}, totalAfterTax: ${totalAfterTax}`);

    return {
      ...item,
      baseUnitPrice,
      unitPrice: unitPriceAfterDiscount,
      vatAmount,
      priceAfterTax,
      totalVatAmount,
      totalAmount,
      discountRate: itemDiscountRate,
      interestRate: itemInterestRate,
      totalAfterTax,
    };
  };

  const updateAllItemTotals = () => {
    const newItems = items.map(item => calculateItemTotals(item));
    setItems(newItems);
  };

  useEffect(() => {
    updateAllItemTotals();
  }, [globalDiscountRate, globalInterestRate]);

  useEffect(() => {
    const lastIndex = items.length - 1;
    if (lastIndex >= 0 && selectRefs.current[lastIndex]?.focus) {
      selectRefs.current[lastIndex].focus();
    }
  }, [items.length]);

  const handleAddCustomer = async (customerData: CustomerFormData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerData),
      });
      const data = await response.json();
      if (response.ok) {
        setShowCustomerModal(false);
        fetchCustomers();
        setSelectedCustomer({
          id: data.customerId,
          name: customerData.name,
          vatNumber: customerData.vatNumber,
          crNumber: customerData.crNumber,
          type: customerData.type,
          email: customerData.email,
          phone: customerData.phone,
        });
        setCustomerSearchQuery(customerData.name);
        setCustomerType(customerData.type);
        setCustomerName(customerData.name);
        setCustomerEmail(customerData.email || '');
        setCustomerPhone(customerData.phone || '');
        toast.success('تم إضافة العميل بنجاح');
      } else {
        throw new Error(data.error || 'فشل في إضافة العميل');
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error(error instanceof Error ? error.message : 'فشل في إضافة العميل');
    }
  };

  async function handleSubmit() {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!selectedCustomer || !selectedCustomer.id) {
        toast.error('الرجاء اختيار عميل صالح');
        return;
      }
      if (!issueDate || !supplyDate || !dueDate) {
        toast.error('الرجاء تحديد جميع التواريخ');
        return;
      }
      if (
        items.some(
          item => !item.description || item.quantity <= 0 || item.unitPrice < 0
        )
      ) {
        toast.error('الرجاء إكمال جميع بيانات المنتجات بشكل صحيح');
        return;
      }
      const invoiceData = {
        companyId: selectedCustomer.id,
        issueDate: new Date(issueDate).toISOString(),
        supplyDate: new Date(supplyDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        totalAmount: items.reduce((sum, item) => sum + item.totalAmount + item.totalVatAmount, 0),
        vatAmount: items.reduce((sum, item) => sum + item.totalVatAmount, 0),
        notes: notes || null,
        terms: terms.filter(term => term.trim() !== '').join('\n') || null,
        customerName: selectedCustomer.name || null,
        customerVatNumber: selectedCustomer.vatNumber || null,
        customerEmail: selectedCustomer.email ?? null,
        customerPhone: selectedCustomer.phone ?? null,
        customerType: selectedCustomer.type || 'individual',
        projectName: selectedProject?.name ?? null,
        status: 'draft',
        invoiceTypeCode: '388',
        invoiceTypeName: '0100000',
        discount_rate: globalDiscountRate ?? null,
        interest_rate: globalInterestRate ?? null,
        items: items.map(item => ({
          description: item.description || null,
          code: item.code || null,
          quantity: item.quantity,
          base_unit_price: item.baseUnitPrice,
          unit_price: Number(item.unitPrice.toFixed(3)),
          vat_rate: item.vatRate ?? 15,
          vat_amount: item.vatAmount ?? 0,
          total_amount: item.totalAmount ?? 0,
          discount_rate: item.discountRate || null,
          interest_rate: item.interestRate ?? null,
          total_vat_amount: item.totalVatAmount ?? 0,
          price_after_tax: item.priceAfterTax ?? 0,
          total_after_tax: item.totalAfterTax ?? 0,
        })),
      };

      console.log('invoiceData:', JSON.stringify(invoiceData, null, 2));

      const response = await fetch(
        id ? `http://localhost:3000/api/invoices/${id}` : 'http://localhost:3000/api/invoices',
        {
          method: id ? 'PUT' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(invoiceData),
        }
      );
      const responseData = await response.json();
      if (response.ok) {
        toast.success(`تم ${id ? 'تحديث' : 'إنشاء'} الفاتورة بنجاح`);
        setTimeout(() => {
          navigate('/dashboard/sales');
        }, 2000);
      } else {
        throw new Error(responseData.error || 'فشل في حفظ الفاتورة');
      }
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error(error instanceof Error ? error.message : 'فشل في إنشاء الفاتورة');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl
        pauseOnFocusLoss
        draggable
        pauseOnHover
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          width: '90%',
          maxWidth: '600px',
        }}
      />
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard/sales')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <ArrowRight className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? 'تعديل الفاتورة' : 'إنشاء فاتورة جديدة'}
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/dashboard/sales')}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 disabled:opacity-50"
          >
            {isLoading ? 'جاري الحفظ...' : id ? 'تحديث الفاتورة' : 'حفظ الفاتورة'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="space-y-6">
          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              مدفوع من <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-2 customer-search-container">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  مدفوع من <span className="text-red-500">*</span>
                </label>
                <div className="relative max-w-md">
                  <input
                    type="text"
                    className="form-input pr-12"
                    placeholder="البحث عن عميل"
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setShowCustomerSearch(true);
                    }}
                    onFocus={() => setShowCustomerSearch(true)}
                  />
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  {showCustomerSearch && (
                    <div className="absolute top-full right-0 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                      <div className="max-h-60 overflow-y-auto">
                        {customers.map((customer) => (
                          <button
                            key={customer.id}
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowCustomerSearch(false);
                              setCustomerSearchQuery(customer.name);
                              setCustomerType(customer.type);
                              setCustomerName(customer.name);
                              setCustomerEmail(customer.email || '');
                              setCustomerPhone(customer.phone || '');
                            }}
                            className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50"
                          >
                            {customer.name} {customer.vatNumber}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setShowCustomerSearch(false);
                            setShowCustomerModal(true);
                          }}
                          className="w-full text-right px-4 py-2 text-sm text-[#4A3B85] hover:bg-gray-50"
                        >
                          <Plus className="inline-block h-4 w-4 ml-2" />
                          إضافة عميل جديد
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  نوع العميل
                </label>
                <div className="flex items-center space-x-4 space-x-reverse">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-[#4A3B85]"
                      checked={customerType === 'individual'}
                      onChange={() => setCustomerType('individual')}
                    />
                    <span className="mr-2">فرد</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-[#4A3B85]"
                      checked={customerType === 'company'}
                      onChange={() => setCustomerType('company')}
                    />
                    <span className="mr-2">شركة</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الاسم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="email@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="اختياري"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              تفاصيل الفاتورة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الإصدار
                </label>
                <DatePicker
                  selected={issueDate ? parse(issueDate, 'yyyy-MM-dd', new Date()) : null}
                  onChange={(date: Date | null) => {
                    setIssueDate(date ? format(date, 'yyyy-MM-dd') : '');
                  }}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="يوم/شهر/سنة"
                  locale={ar}
                  className="form-input w-full"
                  wrapperClassName="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ التوريد
                </label>
                <DatePicker
                  selected={supplyDate ? parse(supplyDate, 'yyyy-MM-dd', new Date()) : null}
                  onChange={(date: Date | null) => {
                    setSupplyDate(date ? format(date, 'yyyy-MM-dd') : '');
                  }}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="يوم/شهر/سنة"
                  locale={ar}
                  className="form-input w-full"
                  wrapperClassName="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الاستحقاق
                </label>
                <DatePicker
                  selected={dueDate ? parse(dueDate, 'yyyy-MM-dd', new Date()) : null}
                  onChange={(date: Date | null) => {
                    setDueDate(date ? format(date, 'yyyy-MM-dd') : '');
                  }}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="يوم/شهر/سنة"
                  locale={ar}
                  className="form-input w-full"
                  wrapperClassName="w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                المشروع
              </label>
              <Select
                options={projects.map(project => ({
                  value: project.id,
                  label: project.name,
                }))}
                value={
                  selectedProject
                    ? { value: selectedProject.id, label: selectedProject.name }
                    : null
                }
                onChange={(selected) => {
                  setSelectedProject(
                    selected
                      ? { id: selected.value, name: selected.label }
                      : null
                  );
                }}
                placeholder="اختر مشروع..."
                isClearable
                isSearchable
                className="w-full"
                styles={{
                  control: (base) => ({
                    ...base,
                    borderColor: '#e5e7eb',
                    boxShadow: 'none',
                    '&:hover': { borderColor: '#d1d5db' },
                  }),
                  menu: (base) => ({
                    ...base,
                    zIndex: 100,
                    textAlign: 'right',
                  }),
                }}
              />
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6 mt-6">
            <h4 className="text-md font-medium text-gray-900 mb-2">الشروط</h4>
            <div className="space-y-4">
              {terms.map((term, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-2 text-sm text-gray-600">{index + 1}.</span>
                  <textarea
                    className="form-input flex-1 min-h-[80px] resize-y"
                    value={term}
                    onChange={(e) => {
                      const newTerms = [...terms];
                      newTerms[index] = e.target.value;
                      setTerms(newTerms);
                    }}
                    placeholder="أدخل الشروط هنا..."
                  />
                  <div className="flex flex-col gap-2">
                    {index === terms.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setTerms([...terms, ''])}
                        className="p-2 text-[#4A3B85] hover:bg-gray-100 rounded-lg"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                    {terms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setTerms(terms.filter((_, i) => i !== index))}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6 mt-6" style={{ overflow: 'visible' }}>
            <div className="relative" style={{ overflow: 'visible' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[50px]">#</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[100px]">كود المنتج</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[350px]">المنتج</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">الكمية</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">السعر الأساسي</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">نسبة الفائدة</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">نسبة الخصم</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">السعر قبل الضريبة</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">الضريبة</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">السعر بعد الضريبة</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">الإجمالي</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[120px]">الإجمالي بعد الضريبة</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-[80px]">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{item.code || 'غير محدد'}</td>
                      <td className="px-4 py-3 min-w-[300px]">
                        <Select<OptionType>
                          ref={(el) => { selectRefs.current[index] = el; }}
                          options={[
                            ...(productSearchQuery && products.some(p => p.supplierName.toLowerCase().includes(productSearchQuery.toLowerCase()))
                              ? [{
                                  value: `select-all-${productSearchQuery}`,
                                  label: `اختيار جميع منتجات ${productSearchQuery}`,
                                  isSelectAll: true,
                                  supplierName: productSearchQuery,
                                }]
                              : []),
                            ...products.map(product => ({
                              value: product.id,
                              label: product.name,
                              price: product.price,
                              code: product.code || 'غير محدد',
                              supplierName: product.supplierName || 'غير محدد',
                            }))
                          ]}
                          formatOptionLabel={(option, { context }) => (
                            <span className="flex items-center">
                              {context === 'menu' && option.value === (item.description ? products.find(p => p.name === item.description)?.id : null) && (
                                <span className="ml-2 text-green-500">✓</span>
                              )}
                              {option.isSelectAll
                                ? option.label
                                : `${option.label} - ${option.code || 'غير محدد'} - ${option.supplierName || 'غير محدد'} - ${option.price || 0} ريال`}
                            </span>
                          )}
                          components={{ SingleValue }}
                          value={
                            item.description
                              ? {
                                  value: products.find(p => p.name === item.description)?.id || 0,
                                  label: item.description,
                                  price: item.unitPrice,
                                  code: item.code,
                                  supplierName: products.find(p => p.name === item.description)?.supplierName || 'غير محدد',
                                }
                              : null
                          }
                          onChange={(selected) => {
                            const newItems = [...items];
                            if (selected && selected.isSelectAll) {
                              const supplierProducts = products.filter(p =>
                                p.supplierName.toLowerCase().includes((selected.supplierName || '').toLowerCase())
                              );
                              if (supplierProducts.length === 0) {
                                toast.warn('لا توجد منتجات لهذا المورد');
                                return;
                              }
                              const existingDescriptions = newItems.map(i => i.description);
                              const uniqueSupplierProducts = supplierProducts.filter(
                                p => !existingDescriptions.includes(p.name)
                              );
                              const skippedProducts = supplierProducts.length - uniqueSupplierProducts.length;
                              if (uniqueSupplierProducts.length === 0) {
                                toast.warn('جميع المنتجات لهذا المورد موجودة بالفعل');
                                return;
                              }
                              const firstEmptyIndex = newItems.findIndex(item => !item.description);
                              const maxId = Math.max(...newItems.map(i => i.id), 0);
                              const newRows = uniqueSupplierProducts.reverse().map((product, i) => {
                                const newItem = {
                                  id: maxId + i + 1,
                                  description: product.name,
                                  code: product.code,
                                  quantity: 1,
                                  baseUnitPrice: product.price || 0,
                                  unitPrice: product.price || 0,
                                  discountRate: globalDiscountRate,
                                  interestRate: globalInterestRate,
                                  vatRate: 15,
                                  vatAmount: 0,
                                  totalVatAmount: 0,
                                  priceAfterTax: 0,
                                  totalAmount: 0,
                                  totalAfterTax: 0,
                                };
                                return calculateItemTotals(newItem);
                              });
                              if (newRows.length > 0) {
                                if (firstEmptyIndex !== -1) {
                                  newItems[firstEmptyIndex] = newRows[0];
                                  if (newRows.length > 1) {
                                    newItems.splice(firstEmptyIndex + 1, 0, ...newRows.slice(1));
                                  }
                                } else {
                                  newItems[index] = newRows[0];
                                  if (newRows.length > 1) {
                                    newItems.splice(index + 1, 0, ...newRows.slice(1));
                                  }
                                }
                                setItems(newItems);
                                toast.success(`تم إضافة ${newRows.length} منتج/منتجات جديدة`);
                                if (skippedProducts > 0) {
                                  toast.warn(`${skippedProducts} منتج/منتجات لم تُضف لأنها موجودة بالفعل`);
                                }
                              }
                              setProductSearchQuery('');
                              setTimeout(() => {
                                const nextEmptyIndex = newItems.findIndex(item => !item.description);
                                const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : firstEmptyIndex !== -1 ? firstEmptyIndex : newItems.length - 1;
                                if (selectRefs.current[focusIndex]) {
                                  selectRefs.current[focusIndex].focus();
                                }
                              }, 100);
                            } else if (selected) {
                              const selectedProduct = products.find(p => p.id === selected.value);
                              if (selectedProduct && newItems.some(i => i.description === selectedProduct.name)) {
                                toast.warn(`المنتج "${selectedProduct.name}" موجود بالفعل في الجدول`);
                                return;
                              }

                              newItems[index] = {
                                ...newItems[index],
                                description: selectedProduct?.name || '',
                                code: selectedProduct?.code || 'غير محدد',
                                baseUnitPrice: Number(selected?.price) || 0,
                                unitPrice: Number(selected?.price) || 0,
                                quantity: 1,
                                totalAfterTax: 0,
                              };
                              newItems[index] = calculateItemTotals(newItems[index]);
                              setItems(newItems);
                            } else {
                              newItems[index] = {
                                ...newItems[index],
                                description: '',
                                code: 'غير محدد',
                                baseUnitPrice: 0,
                                unitPrice: 0,
                                totalAfterTax: 0,
                              };
                              newItems[index] = calculateItemTotals(newItems[index]);
                              setItems(newItems);
                            }
                          }}
                          onInputChange={(input, { action }) => {
                            setProductSearchQuery(input);
                            setProductPage(1);
                            if (action === 'input-change' && input === '') {
                              setMenuIsOpen(prev => {
                                const newMenuIsOpen = [...prev];
                                newMenuIsOpen[index] = true;
                                return newMenuIsOpen;
                              });
                            }
                            return input;
                          }}
                          onMenuOpen={() => {
                            setMenuIsOpen(prev => {
                              const newMenuIsOpen = [...prev];
                              newMenuIsOpen[index] = true;
                              return newMenuIsOpen;
                            });
                            if (selectRefs.current[index]) {
                              selectRefs.current[index].focus();
                            }
                          }}
                          onMenuClose={() => {
                            setMenuIsOpen(prev => {
                              const newMenuIsOpen = [...prev];
                              newMenuIsOpen[index] = false;
                              return newMenuIsOpen;
                            });
                          }}
                          menuIsOpen={menuIsOpen[index]}
                          onMenuScrollToBottom={() => {
                            if (hasMoreProducts && !productSearchQuery) {
                              setProductPage(prev => prev + 1);
                              fetchProducts(productPage + 1, productSearchQuery);
                            }
                          }}
                          filterOption={(option, inputValue) => {
                            const searchLower = inputValue.toLowerCase().trim();
                            if (!searchLower) return true;
                            if (option.data.isSelectAll) {
                              return option.data.label.toLowerCase().includes(searchLower);
                            }
                            const codeMatch = (option.data.code || '').toLowerCase().includes(searchLower);
                            const nameMatch = option.data.label.toLowerCase().includes(searchLower);
                            const supplierMatch = (option.data.supplierName || '').toLowerCase().includes(searchLower);
                            const priceMatch = (option.data.price || 0).toString().includes(searchLower);
                            return codeMatch || nameMatch || supplierMatch || priceMatch;
                          }}
                          placeholder="ابحث بالاسم أو الكود..."
                          isClearable
                          isSearchable
                          isDisabled={false}
                          isMulti={false}
                          className="w-full"
                          menuPortalTarget={document.body}
                          styles={{
                            control: (base) => ({
                              ...base,
                              borderColor: '#e5e7eb',
                              boxShadow: 'none',
                              minWidth: '300px',
                              width: '100%',
                              opacity: 1,
                            }),
                            menu: (base) => ({
                              ...base,
                              zIndex: 100,
                              textAlign: 'right',
                            }),
                            menuPortal: (base) => ({
                              ...base,
                              zIndex: 9999,
                            }),
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="number"
                          className="form-input w-full"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index] = {
                              ...newItems[index],
                              quantity: parseFloat(e.target.value) || 1,
                            };
                            newItems[index] = calculateItemTotals(newItems[index]);
                            setItems(newItems);
                          }}
                          min="1"
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.baseUnitPrice).toFixed(2)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="number"
                          className="form-input w-full"
                          value={item.interestRate}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index] = {
                              ...newItems[index],
                              interestRate: parseFloat(e.target.value) || 0,
                            };
                            newItems[index] = calculateItemTotals(newItems[index]);
                            setItems(newItems);
                          }}
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="number"
                          className="form-input w-full"
                          value={item.discountRate}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index] = {
                              ...newItems[index],
                              discountRate: parseFloat(e.target.value) || 0,
                            };
                            newItems[index] = calculateItemTotals(newItems[index]);
                            setItems(newItems);
                          }}
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.unitPrice).toFixed(2)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.vatAmount).toFixed(3)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.priceAfterTax).toFixed(2)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.totalAmount).toFixed(2)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <input
                          type="text"
                          className="form-input w-full bg-gray-100"
                          value={Number(item.totalAfterTax).toFixed(2)}
                          disabled
                        />
                      </td>
                      <td className="px-4 py-3 w-[80px]">
                        <button
                          type="button"
                          onClick={() => {
                            if (items.length > 1) {
                              setItems(items.filter((_, i) => i !== index));
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex justify-between items-start">
                <div className="flex flex-col gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      const newItems = [
                        ...items,
                        {
                          id: items.length + 1,
                          description: '',
                          code: 'غير محدد',
                          quantity: 1,
                          baseUnitPrice: 0,
                          unitPrice: 0,
                          discountRate: globalDiscountRate,
                          interestRate: globalInterestRate,
                          vatRate: 15,
                          vatAmount: 0,
                          totalVatAmount: 0,
                          priceAfterTax: 0,
                          totalAmount: 0,
                          totalAfterTax: 0,
                        },
                      ];
                      setItems(newItems);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-[#4A3B85] hover:bg-gray-100 rounded-lg"
                  >
                    <Plus className="h-5 w-5" />
                    إضافة منتج جديد
                  </button>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-gray-700 text-right w-24 whitespace-nowrap flex items-center">
                        نسبة الخصم
                      </label>
                      <input
                        type="number"
                        className="form-input w-24 mr-5 rounded-lg"
                        min="0"
                        max="100"
                        value={globalDiscountRate}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setGlobalDiscountRate(value);
                          const newItems = items.map(item => {
                            const updatedItem = {
                              ...item,
                              discountRate: value,
                            };
                            return calculateItemTotals(updatedItem);
                          });
                          setItems(newItems);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-gray-700 text-right w-24 whitespace-nowrap flex items-center">
                        نسبة الفائدة
                      </label>
                      <input
                        type="number"
                        className="form-input w-24 mr-5 rounded-lg"
                        min="0"
                        step="0.10"
                        value={globalInterestRate}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setGlobalInterestRate(value);
                          const newItems = items.map(item => {
                            const updatedItem = {
                              ...item,
                              interestRate: value,
                            };
                            return calculateItemTotals(updatedItem);
                          });
                          setItems(newItems);
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-6 border-t border-gray-200 py-4">
                  <div className="flex flex-col gap-3 items-end">
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-2">المجموع قبل الضريبة: </span>
                      <span className="text-gray-900 font-medium">
                        {items
                          .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)
                          .toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-14">ضريبة القيمة المضافة (15%): </span>
                      <span className="text-gray-900 font-medium">
                        {items
                          .reduce((sum, item) => sum + Number(item.totalVatAmount || 0), 0)
                          .toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="text-lg font-semibold">
                      <span className="text-gray-600 mr-28">الإجمالي: </span>
                      <span className="text-gray-900">
                        {items
                          .reduce(
                            (sum, item) =>
                              sum +
                              Number(item.totalAmount || 0) +
                              Number(item.totalVatAmount || 0),
                            0
                          )
                          .toFixed(2)} ريال
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-5 mt-5">
                ملاحظات
              </label>
              <textarea
                className="form-input min-h-[100px] bg-gray-50 rounded-md"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
              />
            </div>
          </div>
        </div>

        <CreateInvoiceCustomerModal
          isOpen={showCustomerModal}
          onClose={() => setShowCustomerModal(false)}
          onSubmit={handleAddCustomer}
        />
      </div>
    </div>
  );
}

export default CreateInvoice;