import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Trash2, Search, GripVertical } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Select, { components, SingleValueProps } from 'react-select';
import CreateInvoiceCustomerModal, { CustomerFormData } from './CreateInvoiceCustomerModal';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

interface InvoiceItem {
  id: number;
  description: string;
  code: string;
  quantity: number;
  base_unit_price: number;
  unit_price: number;
  vatRate: number;
  vatAmount: number;
  totalVatAmount: number;
  priceAfterTax: number;
  totalAmount: number;
  discountRate: number;
  interestRate: number;
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
  code: string;
  price: number;
  supplierName: string;
}

interface Project {
  id: number;
  name: string;
}

interface OptionType {
  value: number | string;
  label: string;
  price?: number;
  code?: string;
  supplierName?: string;
  isSelectAll?: boolean;
}

const SingleValue = ({ children, ...props }: SingleValueProps<OptionType>) => (
  <components.SingleValue {...props}>{children}</components.SingleValue>
);

function CreateOffer() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerType, setCustomerType] = useState<'individual' | 'company'>('individual');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [grossAmount, setGrossAmount] = useState(0);
  const selectRefs = useRef<(ReactSelectRef | null)[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 1,
      description: '',
      code: '',
      quantity: 1,
      base_unit_price: 0,
      unit_price: 0,
      vatRate: 15,
      vatAmount: 0,
      totalVatAmount: 0,
      priceAfterTax: 0,
      totalAmount: 0,
      discountRate: 0,
      interestRate: 0,
    },
  ]);
  const [dueDate, setDueDate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(['']);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [globalDiscountRate, setGlobalDiscountRate] = useState(0);
  const [globalInterestRate, setGlobalInterestRate] = useState(0);
  const [globalDiscountOnTotalPercent, setGlobalDiscountOnTotalPercent] = useState(0);
  const [menuIsOpen, setMenuIsOpen] = useState<boolean[]>([]);

  type ReactSelectRef = {
    focus: () => void;
  };

  const testToast = () => {
    toast.success('اختبار الإشعار: هذا إشعار نجاح');
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = newItems.map((item, index) => ({
      ...item,
      id: index + 1,
    }));

    setItems(updatedItems);
    toast.success('تم إعادة ترتيب المنتج بنجاح');
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/projects/dropdown', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setProjects(data.data);
        } else {
          setProjects([]);
        }
      } else {
        toast.error('فشل في جلب المشاريع');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('حدث خطأ أثناء جلب المشاريع');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);


  const fetchProducts = async (page: number, search: string = '') => {
    try {
      const token = localStorage.getItem('token');
      const isSupplierSearch = search && !/\d/.test(search);
      const limit = isSupplierSearch ? 1000 : 20;
      const response = await fetch(
        `http://localhost:3000/api/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&fields=name,supplierName,price`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newProducts = data.products.map((product: any) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          price: product.price,
          supplierName: product.supplierName || 'غير محدد',
        }));
        setProducts(prev => (page === 1 ? newProducts : [...prev, ...newProducts]));
        setHasMoreProducts(newProducts.length === limit && !isSupplierSearch);
      } else {
        toast.error('فشل في جلب المنتجات');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('حدث خطأ أثناء جلب المنتجات');
    }
  };

  useEffect(() => {
    fetchProducts(1, productSearchQuery);
  }, [productSearchQuery]);

  useEffect(() => {
    fetchCustomers();
  }, [customerSearchQuery]);

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

  const calculateItemTotals = (item: InvoiceItem): InvoiceItem => {
  const itemInterestRate = Number(item.interestRate);
  const itemDiscountRate = Number(item.discountRate);
  const baseUnitPrice = Number(item.base_unit_price); // Convert to number
  const adjustedUnitPrice = baseUnitPrice * (1 + itemInterestRate / 100);
  const unitPriceAfterDiscount = adjustedUnitPrice * (1 - itemDiscountRate / 100);
  const vatAmount = Number((unitPriceAfterDiscount * (item.vatRate / 100)).toFixed(3));
  const priceAfterTax = Number((unitPriceAfterDiscount + vatAmount).toFixed(3));
  const subtotal = item.quantity * unitPriceAfterDiscount;
  const totalVatAmount = Number((subtotal * (item.vatRate / 100)).toFixed(3));
  const totalAmount = Number((subtotal).toFixed(3));

  return {
    ...item,
    base_unit_price: baseUnitPrice, // Store as number
    unit_price: adjustedUnitPrice,
    vatAmount,
    priceAfterTax,
    totalVatAmount,
    totalAmount,
    discountRate: itemDiscountRate,
    interestRate: itemInterestRate,
  };
};

  const updateAllItemTotals = () => {
    const newItems = items.map(item => calculateItemTotals(item));
    setItems(newItems);
  };

  useEffect(() => {
    const newItems = items.map(item => ({
      ...item,
      interestRate: globalInterestRate,
      unit_price: item.base_unit_price * (1 + globalInterestRate / 100),
    })).map(calculateItemTotals);
    setItems(newItems);
  }, [globalInterestRate]);

  useEffect(() => {
    const newItems = items.map(item => ({
      ...item,
      discountRate: globalDiscountRate,
    })).map(calculateItemTotals);
    setItems(newItems);
  }, [globalDiscountRate]);

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

  const handleAddAllProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      let allProducts: Product[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `http://localhost:3000/api/products?page=${page}&limit=1000&fields=name,supplierName,price,code`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!response.ok) {
          throw new Error('فشل في جلب المنتجات');
        }
        const data = await response.json();
        const fetchedProducts = data.products.map((p: any) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          price: p.price,
          supplierName: p.supplierName || 'غير محدد',
        }));
        allProducts = [...allProducts, ...fetchedProducts];
        hasMore = fetchedProducts.length === 1000;
        page++;
      }

      const existingDescriptions = items.map(i => i.description);
      const uniqueProducts = allProducts.filter(p => !existingDescriptions.includes(p.name));
      const skippedProducts = allProducts.length - uniqueProducts.length;

      if (uniqueProducts.length === 0) {
        toast.warn('جميع المنتجات موجودة بالفعل في الجدول');
        return;
      }

      const firstEmptyIndex = items.findIndex(item => !item.description);
      const newItems = [...items];
      const maxId = Math.max(...newItems.map(i => i.id), 0);

      const newRows = uniqueProducts.reverse().map((product, i) => ({
        id: maxId + i + 1,
        description: product.name,
        code: product.code,
        quantity: 1,
        base_unit_price: product.price || 0,
        unit_price: (product.price || 0) * (1 + globalInterestRate / 100),
        discountRate: globalDiscountRate,
        interestRate: globalInterestRate,
        vatRate: 15,
        vatAmount: 0,
        totalVatAmount: 0,
        priceAfterTax: 0,
        totalAmount: 0,
      })).map(calculateItemTotals);

      if (firstEmptyIndex !== -1) {
        newItems[firstEmptyIndex] = newRows[0];
        if (newRows.length > 1) {
          newItems.splice(firstEmptyIndex + 1, 0, ...newRows.slice(1));
        }
      } else {
        newItems.push(...newRows);
      }

      setItems(newItems);
      toast.success(`تم إضافة ${newRows.length} منتج/منتجات جديدة`);
      if (skippedProducts > 0) {
        toast.warn(`${skippedProducts} منتج/منتجات لم تُضف لأنها موجودة بالفعل`);
      }

      setTimeout(() => {
        const nextEmptyIndex = newItems.findIndex(item => !item.description);
        const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : firstEmptyIndex !== -1 ? firstEmptyIndex : newItems.length - 1;
        if (selectRefs.current[focusIndex]) {
          selectRefs.current[focusIndex].focus();
        }
      }, 100);
    } catch (error) {
      console.error('Error adding all products:', error);
      toast.error('فشل في إضافة جميع المنتجات');
    }
  };

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

  const handleSubmit = async () => {
  try {
    setIsLoading(true);
    const token = localStorage.getItem('token');

    if (!selectedCustomer) {
      toast.error('الرجاء اختيار العميل');
      return;
    }

    if (!issueDate) {
      toast.error('الرجاء تحديد تاريخ الإصدار');
      return;
    }

    if (
      items.some(
        (item) =>
          !item.description ||
          item.quantity <= 0 ||
          item.base_unit_price == null ||
          item.unit_price == null ||
          item.vatRate == null ||
          item.vatAmount == null ||
          item.totalVatAmount == null ||
          item.priceAfterTax == null ||
          item.totalAmount == null ||
          item.discountRate == null ||
          item.interestRate == null
      )
    ) {
      toast.error('الرجاء إكمال جميع بيانات المنتجات بشكل صحيح');
      return;
    }

    // Calculate actual profit based on final selling prices
    const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const discountOnTotalAmount = subtotal * (globalDiscountOnTotalPercent / 100);
    const finalSellingAmount = subtotal - discountOnTotalAmount;
    
    // Calculate total cost (base prices × quantities)
    const totalCost = items.reduce(
      (sum, item) => sum + (Number(item.base_unit_price || 0) * Number(item.quantity || 0)),
      0
    );
    
    // Profit = Final Selling Amount - Total Cost
    const profitAmount = (finalSellingAmount - totalCost).toFixed(2);

    const grossAmount = Number((subtotal - discountOnTotalAmount).toFixed(3));
    const vatAmount = Number((grossAmount * 0.15).toFixed(3));
    const finalTotal = Number((grossAmount + vatAmount).toFixed(3));

    const quotationData = {
      companyId: selectedCustomer.id,
      issueDate: new Date(issueDate).toISOString().split('T')[0],
      expiryDate: expiryDate ? new Date(expiryDate).toISOString().split('T')[0] : null,
      totalAmount: grossAmount,
      vatAmount,
      grossAmount: grossAmount,
      profitAmount: Number(profitAmount),
      notes,
      terms: terms.filter((term) => term.trim() !== '').join('\n'),
      customerName: selectedCustomer.name,
      interestRate: globalInterestRate,
      discountRate: globalDiscountRate,
      discount_on_total_percent: globalDiscountOnTotalPercent,
      discount_on_total_amount: discountOnTotalAmount,
      projectId: selectedProject?.id || null,
      items: items.map((item) => ({
        description: item.description,
        code: item.code || '',
        quantity: Number(item.quantity.toFixed(2)),
        unitPrice: Number(Number(item.unit_price).toFixed(2)),
        baseUnitPrice: Number(Number(item.base_unit_price).toFixed(2)),
        vatRate: Number(Number(item.vatRate).toFixed(2)),
        vatAmount: Number(Number(item.vatAmount).toFixed(2)),
        totalVatAmount: Number(Number(item.totalVatAmount).toFixed(3)),
        priceAfterTax: Number(Number(item.priceAfterTax).toFixed(3)),
        totalAmount: Number(Number(item.totalAmount).toFixed(2)),
        discountRate: Number(Number(item.discountRate).toFixed(2)),
        interestRate: Number(Number(item.interestRate).toFixed(2)),
      })),
    };

    console.log('Quotation Data:', quotationData);

    const response = await fetch('http://localhost:3000/api/quotations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quotationData),
    });

    const responseData = await response.json();
    console.log('POST /api/quotations response:', responseData);

    if (response.ok) {
      toast.success('تم إنشاء عرض السعر بنجاح');
      setTimeout(() => {
        navigate('/dashboard/prices-offer');
      }, 2000);
    } else {
      throw new Error(responseData.error || 'فشل في حفظ عرض السعر');
    }
  } catch (error) {
    console.error('Error creating quotation:', error);
    toast.error(error instanceof Error ? error.message : 'فشل في إنشاء عرض السعر');
  } finally {
    setIsLoading(false);
  }
};

const handleItemChange = (id: number, field: keyof InvoiceItem, value: any) => {
  setItems((prevItems) =>
    prevItems.map((item) =>
      item.id === id
        ? {
            ...item,
            [field]:
              field === 'base_unit_price' ||
              field === 'unit_price' ||
              field === 'quantity' ||
              field === 'vatRate' ||
              field === 'vatAmount' ||
              field === 'totalVatAmount' ||
              field === 'priceAfterTax' ||
              field === 'totalAmount' ||
              field === 'discountRate' ||
              field === 'interestRate'
                ? Number(value) // Convert string to number
                : value,
          }
        : item
    )
  );
};

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
            إنشاء عرض سعر جديد
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={testToast}
            className="px-4 py-2 bg-gray-200 rounded-lg"
          >
            اختبار الإشعار
          </button>
          <button
            onClick={() => navigate('/dashboard/prices-offer')}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 disabled:opacity-50"
          >
            {isLoading ? 'جاري الحفظ...' : 'حفظ عرض السعر'}
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
                  placeholder="05xxxxxxxx"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              تفاصيل عرض السعر
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المشروع
                </label>
                <Select
                  options={projects.map(project => ({
                    value: project.id,
                    label: project.name,
                  }))}
                  value={selectedProject ? { value: selectedProject.id, label: selectedProject.name } : null}
                  onChange={(selected) => setSelectedProject(selected ? { id: selected.value, name: selected.label } : null)}
                  placeholder="اختر مشروع..."
                  isClearable
                  isSearchable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الإصدار <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الانتهاء
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ الاستحقاق
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
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
                    placeholder={`مثال:\nالدفع:\n• دفع قيمة المواد: 100٪ مقدماً بعد الموافقة على العرض.\n• دفع التركيب: مستحق بعد الانتهاء بنجاح والموافقة من العميل.`}
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

          <div className="bg-purple-50 rounded-lg border-2 border-purple-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              المنتجات <span className="text-red-500">*</span>
            </h3>
            

            <div className="overflow-x-auto">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="items">
                  {(provided) => (
                    <div className="min-w-[1200px]"> {/* Add minimum width container */}
                      <table className="w-full divide-y divide-gray-200" {...provided.droppableProps} ref={provided.innerRef}>
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="w-8 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              #
                            </th>
                            <th className="w-80 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              الوصف
                            </th>
                            <th className="w-20 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              الكمية
                            </th>
                            <th className="w-28 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              السعر الاصلي
                            </th>
                            <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              نسبة الفائدة
                            </th>
                            <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              نسبة الخصم
                            </th>
                            <th className="w-28 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              سعر الوحدة بعد الخصم
                            </th>
                            <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              الضريبة للوحدة
                            </th>
                            <th className="w-28 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              السعر بعد الضريبة
                            </th>
                            <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              الإجمالي
                            </th>
                            <th className="w-12 px-2 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {items.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id.toString()} index={index}>
                              {(provided) => (
                                <tr
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                >
                                  <td className="w-8 px-2 py-3 whitespace-nowrap" {...provided.dragHandleProps}>
                                    <GripVertical className="h-4 w-4 text-gray-400" />
                                  </td>
                                  <td className="w-80 px-4 py-3">
                                    <Select<OptionType>
                                      ref={(el) => (selectRefs.current[index] = el)}
                                      options={[
                                        {
                                          value: 'add_all',
                                          label: 'إضافة جميع المنتجات من جميع الموردين',
                                          isSelectAll: true,
                                        },
                                        ...products.map(product => ({
                                          value: product.id,
                                          label: product.name,
                                          price: product.price,
                                          code: product.code,
                                          supplierName: product.supplierName,
                                        })),
                                      ]}
                                      formatOptionLabel={(option) => (
                                        option.isSelectAll ? (
                                          <span>{option.label}</span>
                                        ) : (
                                          <span>
                                            {option.label} - {option.code} - {option.supplierName} - {option.price} ريال
                                          </span>
                                        )
                                      )}
                                      value={item.description ? {
                                        value: products.find(p => p.name === item.description)?.id || 'custom',
                                        label: item.description,
                                        price: item.base_unit_price,
                                        code: item.code,
                                        supplierName: products.find(p => p.name === item.description)?.supplierName || 'غير محدد',
                                      } : null}
                                      onChange={(selected) => {
                                        const newItems = [...items];
                                        if (selected?.value === 'add_all') {
                                          handleAddAllProducts();
                                          return;
                                        } else if (selected) {
                                          const selectedProduct = products.find(p => p.id === selected.value);
                                          newItems[index] = {
                                            ...newItems[index],
                                            description: selectedProduct?.name || '',
                                            code: selectedProduct?.code || '',
                                            base_unit_price: selected?.price || 0,
                                            unit_price: (selected?.price || 0) * (1 + newItems[index].interestRate / 100),
                                          };
                                          newItems[index] = calculateItemTotals(newItems[index]);
                                          setItems(newItems);
                                        } else {
                                          newItems[index] = {
                                            ...newItems[index],
                                            description: '',
                                            code: '',
                                            base_unit_price: 0,
                                            unit_price: 0,
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
                                        const searchLower = inputValue.toLowerCase();
                                        return (
                                          (option.data.isSelectAll && option.data.label.toLowerCase().includes(searchLower)) ||
                                          (!option.data.isSelectAll && (
                                            option.data.label.toLowerCase().includes(searchLower) ||
                                            (option.data.supplierName || '').toLowerCase().includes(searchLower) ||
                                            (option.data.code || '').toLowerCase().includes(searchLower) ||
                                            (option.data.price || 0).toString().includes(searchLower)
                                          ))
                                        );
                                      }}
                                      placeholder="اختر منتج..."
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
                                          fontSize: '14px',
                                          opacity: 1,
                                          whiteSpace: 'normal',
                                          wordBreak: 'break-word',
                                          '&:hover': { borderColor: '#d1d5db' },
                                        }),
                                        menu: (base) => ({
                                          ...base,
                                          zIndex: 1000,
                                          textAlign: 'right',
                                          width: '400px',
                                          minWidth: '400px',
                                          marginTop: '4px',
                                        }),
                                        menuPortal: (base) => ({
                                          ...base,
                                          zIndex: 1000,
                                        }),
                                        menuList: (base) => ({
                                          ...base,
                                          maxHeight: '200px',
                                          overflowY: 'auto',
                                        }),
                                        option: (base, { isSelected }) => ({
                                          ...base,
                                          textAlign: 'right',
                                          whiteSpace: 'normal',
                                          wordBreak: 'break-word',
                                          backgroundColor: isSelected ? '#080c68' : base.backgroundColor,
                                          color: isSelected ? '#ffffff' : base.color,
                                          '&:hover': { backgroundColor: isSelected ? '#080c68' : '#f3f4f6' },
                                        }),
                                        singleValue: (base) => ({
                                          ...base,
                                          whiteSpace: 'normal',
                                          wordBreak: 'break-word',
                                          maxWidth: '100%',
                                        }),
                                        input: (base) => ({
                                          ...base,
                                          opacity: '1',
                                          color: '#000',
                                        }),
                                      }}
                                    />
                                  </td>
                                  <td className="w-20 px-2 py-3">
                                    <input
                                      type="number"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[index] = {
                                          ...newItems[index],
                                          quantity: parseInt(e.target.value) || 0,
                                        };
                                        newItems[index] = calculateItemTotals(newItems[index]);
                                        setItems(newItems);
                                      }}
                                    />
                                  </td>
                                  <td className="w-28 px-2 py-3">
                                    <input
                                      type="number"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      min="0"
                                      step="0.01"
                                      value={item.base_unit_price}
                                      onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[index] = {
                                          ...newItems[index],
                                          base_unit_price: parseFloat(e.target.value) || 0,
                                          unit_price: (parseFloat(e.target.value) || 0) * (1 + newItems[index].interestRate / 100),
                                        };
                                        newItems[index] = calculateItemTotals(newItems[index]);
                                        setItems(newItems);
                                      }}
                                    />
                                  </td>
                                  <td className="w-24 px-2 py-3">
                                    <input
                                      type="number"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      min="0"
                                      step="0.10"
                                      value={item.interestRate}
                                      onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[index] = {
                                          ...newItems[index],
                                          interestRate: parseFloat(e.target.value) || 0,
                                          unit_price: newItems[index].base_unit_price * (1 + (parseFloat(e.target.value) || 0) / 100),
                                        };
                                        newItems[index] = calculateItemTotals(newItems[index]);
                                        setItems(newItems);
                                      }}
                                    />
                                  </td>
                                  <td className="w-24 px-2 py-3">
                                    <input
                                      type="number"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      min="0"
                                      step="0.10"
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
                                    />
                                  </td>
                                  <td className="w-28 px-2 py-3">
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-700"
                                      value={(item.unit_price * (1 - item.discountRate / 100)).toFixed(2)}
                                      disabled
                                      readOnly
                                    />
                                  </td>
                                  <td className="w-24 px-2 py-3">
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-700"
                                      value={item.vatAmount.toFixed(2)}
                                      disabled
                                      readOnly
                                    />
                                  </td>
                                  <td className="w-28 px-2 py-3">
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-700"
                                      value={item.priceAfterTax.toFixed(2)}
                                      disabled
                                      readOnly
                                    />
                                  </td>
                                  <td className="w-24 px-2 py-3">
                                    <input
                                      type="text"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-700"
                                      value={item.totalAmount.toFixed(2)}
                                      disabled
                                      readOnly
                                    />
                                  </td>
                                  <td className="w-12 px-2 py-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (items.length > 1) {
                                          setItems(items.filter((_, i) => i !== index));
                                        }
                                      }}
                                      className="p-1 hover:bg-red-50 rounded-lg"
                                      disabled={items.length === 1}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </button>
                                  </td>
                                </tr>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            <button
              type="button"
              onClick={() => {
                const newItem: InvoiceItem = {
                  id: items.length + 1,
                  description: '',
                  code: '',
                  quantity: 1,
                  base_unit_price: 0,
                  unit_price: 0,
                  discountRate: globalDiscountRate,
                  interestRate: globalInterestRate,
                  vatRate: 15,
                  vatAmount: 0,
                  totalVatAmount: 0,
                  priceAfterTax: 0,
                  totalAmount: 0,
                };
                const newItems = [...items, newItem];
                setItems(newItems);
                setTimeout(() => {
                  const firstEmptyIndex = newItems.findIndex(item => !item.description);
                  if (selectRefs.current[firstEmptyIndex]) {
                    selectRefs.current[firstEmptyIndex].focus();
                  }
                }, 100);
              }}
              className="mt-4 flex items-center text-[#4A3B85] hover:text-[#5A4B95] transition-colors duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              إضافة مادة
            </button>
            <button
              type="button"
              onClick={handleAddAllProducts}
              className="mt-2 flex items-center text-[#4A3B85] hover:text-[#5A4B95] transition-colors duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              إضافة جميع المنتجات من جميع الموردين
            </button>

            <div className="mt-6 border-t border-gray-200 py-4">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <label className="block text-sm font-semibold text-gray-700 text-right w-24">
                        نسبة الخصم
                      </label>
                      <input
                        type="number"
                        className="form-input w-24 rounded-lg"
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
                      <label className="block text-sm font-semibold text-gray-700 text-right w-24">
                        الخصم علي الاجمالي
                      </label>
                      <input
                        type="number"
                        className="form-input w-24 rounded-lg"
                        min="0"
                        max="100"
                        value={globalDiscountOnTotalPercent}
                        onChange={(e) => setGlobalDiscountOnTotalPercent(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="block text-sm font-semibold text-gray-700 text-right w-24">
                        نسبة الفائدة
                      </label>
                      <input
                        type="number"
                        className="form-input w-24 rounded-lg"
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
                              unit_price: item.base_unit_price * (1 + value / 100),
                            };
                            return calculateItemTotals(updatedItem);
                          });
                          setItems(newItems);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 items-end">
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-2">الربح علي المواد : </span>
                      <span className="text-gray-900 font-medium">
                        {(() => {
                          // Calculate actual profit based on final selling prices
                          const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
                          const discountOnTotal = subtotal * (globalDiscountOnTotalPercent / 100);
                          const finalSellingAmount = subtotal - discountOnTotal;
                          
                          // Calculate total cost (base prices × quantities)
                          const totalCost = items.reduce(
                            (sum, item) => sum + (Number(item.base_unit_price || 0) * Number(item.quantity || 0)),
                            0
                          );
                          
                          // Profit = Final Selling Amount - Total Cost
                          const actualProfit = finalSellingAmount - totalCost;
                          return actualProfit.toFixed(2);
                        })()} ريال
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-2">المجموع قبل الضريبة: </span>
                      <span className="text-gray-900 font-medium">
                        {items.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-2">الخصم ({globalDiscountOnTotalPercent}%): </span>
                      <span className="text-gray-900 font-medium">
                        {(items.reduce((sum, item) => sum + item.totalAmount, 0) * (globalDiscountOnTotalPercent / 100)).toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-2">الإجمالي قبل الضريبة (بعد الخصم): </span>
                      <span className="text-gray-900 font-medium">
                        {(() => {
                          const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
                          const discount = subtotal * (globalDiscountOnTotalPercent / 100);
                          return (subtotal - discount).toFixed(2);
                        })()} ريال
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 font-semibold mr-14">ضريبة القيمة المضافة (15%): </span>
                      <span className="text-gray-900 font-medium">
                        {(() => {
                          const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
                          const discount = subtotal * (globalDiscountOnTotalPercent / 100);
                          const gross = subtotal - discount;
                          return (gross * 0.15).toFixed(2);
                        })()} ريال
                      </span>
                    </div>
                    <div className="text-lg font-semibold">
                      <span className="text-gray-600 mr-28">الإجمالي: </span>
                      <span className="text-gray-900">
                        {(() => {
                          const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
                          const discount = subtotal * (globalDiscountOnTotalPercent / 100);
                          const gross = subtotal - discount;
                          const vat = gross * 0.15;
                          return (gross + vat).toFixed(2);
                        })()} ريال
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ملاحظات
            </label>
            <textarea
              className="form-input min-h-[100px] bg-gray-50 rounded-lg"
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
  );
}

export default CreateOffer;