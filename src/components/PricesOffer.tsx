import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '/node_modules/@abdulrysr/saudi-riyal-new-symbol-font/style.css';
import {
  Search,
  Plus,
  Calendar,
  ChevronDown,
  MoreVertical,
  Mail,
  ClipboardList,
  History,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Upload,
  Eye,
  Trash,
  Loader2,
  AlertCircle,
  CheckCircle,
  Filter,
  FileCheck,
  Check,
  Edit,
  MessageCircle,
  X,
  Building2,
  ArrowLeft,
  DollarSign,
  Package,
  BarChart3,
  FileText
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import OfferPreview from './OfferPreview';
import EditQuotationModal from './EditQuotationModal';
import ConfirmationModal from './ConfirmationModal';
import ProformaInvoicePreview from './ProformaInvoicePreview';



const formatPrice = (value: number): string => {
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};

interface QuotationSummary {
  totalQuotations: number;
  totalAmount: number;
  averageAmount: number;
}

interface Project {
  id: number;
  name: string;
}

interface QuotationItem {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  discount_rate: number;
  price_after_tax: number;
  interest_rate: number;
  base_unit_price: number;
  price_before_tax: number;
  code: string;
  
}
  
interface Company {
    id: number;
    name: string;
    vat_number: string;
    address: string;
    city: string;
    postal_code: string;
    phone: string;
    email: string;
  }
  
 
interface Quotation {
  id: number;
  number: string;
  issueDate: string;
  expiryDate: string;
  totalAmount: number;
  vatAmount: number;
  notes: string | null;
  terms?: string;
  createdAt: string;
  customerName: string;
  customerVatNumber: string;
  items: QuotationItem[];
  company?: Company;
  company_name?: Company;
  company_id?: number;
  interest_rate: number;
  discount_rate: number;
  discount_on_total_percent?: number;
  discount_on_total_amount?: number;
  status: string;
  project_id?: number;
  projectName?: string;
  profitAmount: number;
  // Additional fields from API
  company_address?: string;
  company_city?: string;
  company_postal_code?: string;
  company_phone?: string;
  company_email?: string;
  // Proforma-specific fields (optional)
  deliveryTerms?: string;
  paymentTerms?: string;
  validity?: string;
  deliveryLocation?: string;
  deliveryPeriod?: string;
  warranty?: string;
  deliveryCharges?: number;
}

type SearchType = 'quotationNumber' | 'issueDate' | 'expiryDate';

function PricesOffer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<QuotationSummary>({
    totalQuotations: 0,
    totalAmount: 0,
    averageAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [originalQuotation, setOriginalQuotation] = useState<Quotation | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [selectedQuotations, setSelectedQuotations] = useState<number[]>([]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [success, setSuccess] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState<number | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [quotationToSend, setQuotationToSend] = useState<Quotation | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [showProjectView, setShowProjectView] = useState(
    location.state?.showProjectView || false
  );
  const [showProformaPreview, setShowProformaPreview] = useState(false);
  const [proformaQuotation, setProformaQuotation] = useState<Quotation | null>(null);

  // Dropdown states for convert button
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  

  // API functions
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects/dropdown', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && Array.isArray(data.data)) {
          setProjects(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      const queryParams = new URLSearchParams({
        search: searchQuery,
        type: selectedType,
        status: selectedStatus,
        customer: selectedCustomer,
      });

      if (selectedProject) queryParams.append('projectId', selectedProject);
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
      if (showDueOnly) queryParams.append('dueOnly', 'true');

      const response = await fetch(
        `http://localhost:3000/api/quotations?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('فشل في جلب بيانات عروض الأسعار');
      }

      const data = await response.json();

      const transformedQuotations = data.quotations.map((q: any) => {
      const normalizedItems = Array.isArray(q.items)
        ? q.items.map((it: any) => ({
            description: it.description || '',
            code: it.code || '',
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            base_unit_price: Number(it.base_unit_price) || 0,
            vat_rate: Number(it.vat_rate) || 15,
            vat_amount: Number(it.vat_amount) || 0,
            total_amount: Number(it.total_amount) || 0,
            discount_rate: Number(it.discount_rate) || 0,
            price_after_tax: Number(it.price_after_tax) || 0,
            interest_rate: Number(it.interest_rate) || 0,
            price_before_tax: Number(it.price_before_tax) || 0,
          }))
        : [];

      const profitFromApi = q.profit_amount != null ? Number(q.profit_amount) : null;
      const profit = profitFromApi ?? computeProfitFromItems(normalizedItems, q.discount_on_total_percent || 0);

      return {
        ...q,
        createdAt: q.created_at,
        items: normalizedItems,
        totalAmount: Number(q.total),
        vatAmount: Number(q.vatAmount),
        status: q.status,
        profitAmount: Number(profit) || 0,
        discount_on_total_percent: Number(q.discount_on_total_percent) || 0, // Add this line
      };
    });


      setQuotations(transformedQuotations);
      
      // Calculate summary
      const totalQuotations = transformedQuotations.length;
      const totalAmount = transformedQuotations.reduce((sum: number, q: any) => sum + (q.totalAmount + q.vatAmount), 0);
      const averageAmount = totalQuotations > 0 ? totalAmount / totalQuotations : 0;
      
      setSummary({
        totalQuotations,
        totalAmount,
        averageAmount
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات');
      toast.error(err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuotationDetails = async (quotation: Quotation) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('يرجى تسجيل الدخول');
      }
      const response = await fetch(
        `http://localhost:3000/api/quotations/${quotation.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل في جلب تفاصيل عرض السعر');
      }

      const quotationData = await response.json();
      console.log('Fetched Quotation Data:', quotationData);

      const transformedQuotation: Quotation = {
        ...quotationData,
        createdAt: quotationData.created_at,
        totalAmount: Number(quotationData.totalAmount),
        vatAmount: Number(quotationData.vatAmount),
        status: quotationData.status || 'draft', // Default to 'draft' if undefined
        discount_rate: Number(quotationData.discount_rate) || 0,
        interest_rate: Number(quotationData.interest_rate) || 0,
        terms: quotationData.terms || '',
        company_id: quotationData.company_name?.id || quotationData.company_id,
        items: quotationData.items.map((item: any) => ({
          description: item.description || '',
          code: item.code || '', // Add code
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          base_unit_price: Number(item.base_unit_price) || 0, // Add base_unit_price
          vat_rate: Number(item.vat_rate) || 15,
          vat_amount: Number(item.vat_amount) || 0,
          total_amount: Number(item.total_amount) || 0,
          discount_rate: Number(item.discount_rate) || 0,
          price_after_tax: Number(item.price_after_tax) || 0,
          interest_rate: Number(item.interest_rate) || 0,
          price_before_tax: Number(item.price_before_tax) || 0, // Add if needed
        })),
      };

      console.log('Transformed Quotation:', transformedQuotation);
      return transformedQuotation;
    } catch (error) {
      console.error('Error fetching quotation details:', error);
      setError(error instanceof Error ? error.message : 'فشل في جلب تفاصيل عرض السعر');
      toast.error(error instanceof Error ? error.message : 'فشل في جلب تفاصيل عرض السعر');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchQuotations();
  }, [searchQuery, selectedType, selectedStatus, selectedCustomer, selectedProject, startDate, endDate, showDueOnly]);

  const handlePreview = async (quotation: Quotation) => {
    const quotationData = await fetchQuotationDetails(quotation);
    if (quotationData) {
      setSelectedQuotation(quotationData);
      setShowPreview(true);
    }
  };

  const handleEdit = async (quotation: Quotation) => {
    const quotationData = await fetchQuotationDetails(quotation);
    if (quotationData) {
      setSelectedQuotation(quotationData);
      setOriginalQuotation({ ...quotationData });
      setShowEditModal(true);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      const response = await fetch(
        `http://localhost:3000/api/quotations/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 403 || response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('companyName');
        navigate('/', { replace: true });
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'فشل في حذف عرض السعر');
      }

      setSuccess('تم حذف عرض السعر بنجاح');
      toast.success('تم حذف عرض السعر بنجاح');
      setTimeout(() => setSuccess(''), 3000);
      fetchQuotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في حذف عرض السعر');
      toast.error(err instanceof Error ? err.message : 'فشل في حذف عرض السعر');
    }
  };


  const handleProformaInvoice = async (quotation: Quotation) => {
  const quotationData = await fetchQuotationDetails(quotation);
  if (quotationData) {
    // Add proforma-specific fields
      const proformaData = {
      ...quotationData,
      company: quotationData.company_name || {
        id: quotationData.company_id || 0,
        name: quotationData.customerName || '',
        vat_number: quotationData.customerVatNumber || '',
        address: quotationData.company_address || '',
        city: quotationData.company_city || '',
        postal_code: quotationData.company_postal_code || '',
        phone: quotationData.company_phone || '',
        email: quotationData.company_email || '',
      },
      deliveryTerms: 'FOB Destination',
      paymentTerms: 'Net 30',
      validity: '2 Weeks',
      deliveryLocation: 'Tabuk',
      deliveryPeriod: '1 Week',
      warranty: 'Manufacturer Standard',
      deliveryCharges: 0,
      status: 'proforma'
    };
    setProformaQuotation(proformaData);
    setShowProformaPreview(true);
  }
};


  const handleBulkDelete = async () => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      setLoading(true);
      const deletePromises = selectedRows.map((id) =>
        fetch(`http://localhost:3000/api/quotations/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      const responses = await Promise.all(deletePromises);

      for (const response of responses) {
        if (response.status === 403 || response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('companyName');
          navigate('/', { replace: true });
          return;
        }
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'فشل في حذف بعض عروض الأسعار');
        }
      }

      setSuccess('تم حذف جميع عروض الأسعار المحددة بنجاح');
      toast.success('تم حذف جميع عروض الأسعار المحددة بنجاح');
      setTimeout(() => setSuccess(''), 3000);
      setSelectedRows([]);
      fetchQuotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في حذف عروض الأسعار');
      toast.error(err instanceof Error ? err.message : 'فشل في حذف عروض الأسعار');
    } finally {
      setLoading(false);
      setIsBulkDeleteModalOpen(false);
    }
  };

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) {
      console.warn('Date string is null or undefined');
      return 'N/A';
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return 'N/A';
    }

    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar: 'islamic',
    });
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'issued':
        return 'bg-blue-100 text-blue-800';
      case 'certified':
        return 'bg-purple-100 text-purple-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'مدفوع';
      case 'draft':
        return 'مسودة';
      case 'issued':
        return 'مصدر';
      case 'certified':
        return 'مصدق';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  };

  const handleRowSelect = (id: number) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedRows(
      selectedRows.length === quotations.length ? [] : quotations.map((quotation) => quotation.id)
    );
  };

  const handleWhatsAppClick = (quotation: Quotation) => {
    setQuotationToSend(quotation);
    setShowWhatsAppModal(true);
  };

  const computeProfitFromItems = (items: QuotationItem[] = [], globalDiscountPercent: number = 0) => {
  // Calculate subtotal from items
  const subtotal = items.reduce((sum, item) => {
    const basePrice = Number(item.base_unit_price || 0);
    const interestRate = Number(item.interest_rate || 0);
    const discountRate = Number(item.discount_rate || 0);
    const quantity = Number(item.quantity || 0);
    
    // Apply interest and discount to get final unit price
    const priceAfterInterest = basePrice * (1 + interestRate / 100);
    const unitPriceAfterDiscount = priceAfterInterest * (1 - discountRate / 100);
    
    return sum + (unitPriceAfterDiscount * quantity);
  }, 0);
  
  // Apply global discount
  const finalSellingAmount = subtotal * (1 - globalDiscountPercent / 100);
  
  // Calculate total cost
  const totalCost = items.reduce((sum, item) => {
    return sum + (Number(item.base_unit_price || 0) * Number(item.quantity || 0));
  }, 0);
  
  // Profit = Final Selling Amount - Total Cost
  return finalSellingAmount - totalCost;
};


  const handleWhatsAppSend = () => {
    if (!quotationToSend || !whatsAppNumber) {
      toast.error('يرجى إدخال رقم واتساب صالح');
      return;
    }

    setIsSending(true);
    try {
      const cleanedNumber = whatsAppNumber.replace(/[^0-9]/g, '');
      const formattedNumber = cleanedNumber.startsWith('966') ? cleanedNumber : `966${cleanedNumber}`;
      const quotationUrl = `http://localhost:3000/quotations/${quotationToSend.id}`;
      const message = `مرحباً، إليك عرض سعر رقم ${quotationToSend.number} بقيمة ${formatPrice(quotationToSend.totalAmount)} ريال سعودي. يمكنك عرض التفاصيل هنا: ${quotationUrl}`;
      const encodedMessage = encodeURIComponent(message);
      const whatsAppUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;

      if (window.open(whatsAppUrl, '_blank')) {
        toast.success('تم فتح واتساب بنجاح');
      } else {
        toast.error('فشل في فتح واتساب، يرجى التأكد من التطبيق');
      }

      setShowWhatsAppModal(false);
      setWhatsAppNumber('');
      setQuotationToSend(null);
    } catch (err) {
      setError('فشل في إرسال عرض السعر عبر واتساب');
      toast.error('فشل في إرسال عرض السعر عبر واتساب');
    } finally {
      setIsSending(false);
    }
  };

  const handleWhatsAppCancel = () => {
    setShowWhatsAppModal(false);
    setWhatsAppNumber('');
    setQuotationToSend(null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedCustomer('all');
    setSelectedProject('');
    setStartDate('');
    setEndDate('');
    setShowDueOnly(false);
  };

  const handleProjectClick = (projectId: number, projectName: string) => {
    navigate(`/dashboard/project-quotations/${projectId}`, { 
      state: { 
        projectName, 
        fromProjectView: true
      } 
    });
  };

  // Get unique projects from quotations for the project view
  const getProjectsWithQuotations = () => {
    const projectMap = new Map();
    
    quotations.forEach(quotation => {
      if (quotation.project_id && quotation.projectName) {
        if (!projectMap.has(quotation.project_id)) {
          projectMap.set(quotation.project_id, {
            id: quotation.project_id,
            name: quotation.projectName,
            totalAmount: 0,
            quotationCount: 0
          });
        }
        const project = projectMap.get(quotation.project_id);
        project.totalAmount += quotation.totalAmount + quotation.vatAmount;
        project.quotationCount += 1;
      }
    });

    return Array.from(projectMap.values());
  };

  // Clear location state after using it
  useEffect(() => {
    if (location.state?.showProjectView) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Normalize dates to YYYY-MM-DD format for comparison
  const normalizeDate = (date: string): string => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  // Compare original and edited quotation to detect if unchanged
  const isUnchanged = (original: Quotation, edited: Quotation): boolean => {
    const topLevelUnchanged =
      original.id === edited.id &&
      original.number === edited.number &&
      normalizeDate(original.issueDate) === normalizeDate(edited.issueDate) &&
      normalizeDate(original.expiryDate) === normalizeDate(edited.expiryDate) &&
      (original.customerName || '').trim() === (edited.customerName || '').trim() &&
      (original.customerVatNumber || '').trim() === (edited.customerVatNumber || '').trim() &&
      Math.round(original.totalAmount * 100) === Math.round(edited.totalAmount * 100) &&
      Math.round(original.vatAmount * 100) === Math.round(edited.vatAmount * 100) &&
      (original.notes || '').trim() === (edited.notes || '').trim() &&
      normalizeDate(original.createdAt) === normalizeDate(edited.createdAt) &&
      (original.company_id || 0) === (edited.company_id || 0) &&
      (original.discount_rate || 0) === (edited.discount_rate || 0) &&
      (original.interest_rate || 0) === (edited.interest_rate || 0) &&
      (original.terms || '').trim() === (edited.terms || '').trim();

    const originalItems = original.items || [];
    const editedItems = edited.items || [];

    if (originalItems.length !== editedItems.length) {
      return false;
    }

    const itemsUnchanged = originalItems.every((originalItem, index) => {
      const editedItem = editedItems[index];
      if (!editedItem) {
        return false;
      }

      return (
        (originalItem.description || '').trim() === (editedItem.description || '').trim() &&
        (originalItem.quantity || 0) === (editedItem.quantity || 0) &&
        Math.round((originalItem.unit_price || 0) * 100) === Math.round((editedItem.unit_price || 0) * 100) &&
        (originalItem.vat_rate || 0) === (editedItem.vat_rate || 0) &&
        Math.round((originalItem.vat_amount || 0) * 100) === Math.round((editedItem.vat_amount || 0) * 100) &&
        Math.round((originalItem.total_amount || 0) * 100) === Math.round((editedItem.total_amount || 0) * 100) &&
        (originalItem.discount_rate || 0) === (editedItem.discount_rate || 0) &&
        Math.round((originalItem.price_after_tax || 0) * 100) === Math.round((editedItem.price_after_tax || 0) * 100) &&
        (originalItem.interest_rate || 0) === (editedItem.interest_rate || 0)
      );
    });

    return topLevelUnchanged && itemsUnchanged;
  };

  if (showProjectView) {
    const projectsWithQuotations = getProjectsWithQuotations();
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowProjectView(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">عروض الأسعار حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض عروض الأسعار مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithQuotations.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id, project.name)}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
                <span className="text-sm text-gray-500">{project.quotationCount} عرض</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-2xl font-bold text-purple-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي العروض</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">عروض الأسعار</h1>
          <p className="text-gray-600 mt-1">إدارة عروض الأسعار والمقاولات</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowProjectView(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2"
          >
            <Building2 className="h-4 w-4" />
            تصنيف بحسب المشروع
          </button>
          <button
            onClick={() => navigate('/dashboard/create-offer')}
            className="bg-[#4A3B85] text-white px-4 py-2 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة عرض سعر
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي العروض</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalAmount.toFixed(2)} ر.س</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">عدد العروض</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalQuotations}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Package className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">متوسط العرض</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary.averageAmount.toFixed(2)} ر.س
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="البحث في العروض..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
            />
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
          >
            <option value="">جميع المشاريع</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
          >
            <option value="all">جميع الحالات</option>
            <option value="draft">مسودة</option>
            <option value="issued">مصدر</option>
            <option value="certified">مصدق</option>
            <option value="paid">مدفوع</option>
            <option value="cancelled">ملغي</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
            placeholder="من تاريخ"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
            placeholder="إلى تاريخ"
          />

          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200"
          >
            مسح الفلاتر
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <CheckCircle className="h-5 w-5 ml-2" />
          {success}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 ml-2" />
          {error}
        </div>
      )}

      {/* Quotations Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85] mx-auto"></div>
            <p className="mt-2 text-gray-500">جاري التحميل...</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد عروض أسعار</h3>
            <p className="text-gray-500">لم يتم العثور على عروض أسعار تطابق المعايير المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-12 px-6 py-3">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                      checked={
                        selectedRows.length === quotations.length && quotations.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الرقم
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    العميل
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تاريخ الإصدار
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تاريخ الانتهاء
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الارباح
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجمالي
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotations.map((quotation) => (
                  <tr key={quotation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                        checked={selectedRows.includes(quotation.id)}
                        onChange={() => handleRowSelect(quotation.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {quotation.number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {quotation.customerName}
                      </div>
                      {quotation.customerVatNumber && (
                        <div className="text-sm text-gray-500">
                          {quotation.customerVatNumber}
                        </div>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(quotation.issueDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(quotation.expiryDate)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      (quotation.profitAmount ?? computeProfitFromItems(quotation.items || [], quotation.discount_on_total_percent || 0)) < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatPrice(
                        quotation.profitAmount ??
                        computeProfitFromItems(quotation.items || [], quotation.discount_on_total_percent || 0)
                      )} ر.س
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatPrice(quotation.totalAmount + quotation.vatAmount)} ر.س
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(quotation.status)}`}>
                        {getStatusText(quotation.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                        onClick={() => handleProformaInvoice(quotation)}
                        className="text-purple-600 hover:text-purple-900 ml-2"
                        title="تحويل إلى فاتورة أولية"
                      >
                        <FileCheck className="h-4 w-4" />
                      </button>

                        <button
                          onClick={() => handleEdit(quotation)}
                          className="text-[#4A3B85] hover:text-[#5A4B95] ml-2"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setQuotationToDelete(quotation.id);
                            setIsDeleteModalOpen(true);
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handlePreview(quotation)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleWhatsAppClick(quotation)}
                          className="text-green-600 hover:text-green-900"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Delete Button */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg border p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              تم تحديد {selectedRows.length} عنصر
            </span>
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center gap-2"
            >
              <Trash className="h-4 w-4" />
              حذف المحدد
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onConfirm={() => {
          if (quotationToDelete) {
            handleDelete(quotationToDelete);
            setIsDeleteModalOpen(false);
          }
        }}
        onCancel={() => setIsDeleteModalOpen(false)}
        message="هل أنت متأكد أنك تريد حذف عرض السعر هذا؟"
      />

      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onConfirm={handleBulkDelete}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
        message="هل أنت متأكد أنك تريد حذف جميع عروض الأسعار المحددة؟"
      />

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              إرسال عرض السعر عبر واتساب
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم الواتساب
                </label>
                <input
                  type="tel"
                  value={whatsAppNumber}
                  onChange={(e) => setWhatsAppNumber(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleWhatsAppCancel}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 ml-3"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleWhatsAppSend}
                className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center"
                disabled={!whatsAppNumber || isSending}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  'إرسال'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview and Edit Modals */}
      {showPreview && selectedQuotation && (
        <OfferPreview
          quotation={selectedQuotation}
          onClose={() => {
            setShowPreview(false);
            setSelectedQuotation(null);
          }}
        />
      )}

      
      {showEditModal && selectedQuotation && originalQuotation && (
        <EditQuotationModal
          quotation={selectedQuotation}
          onClose={() => {
            setShowEditModal(false);
            setSelectedQuotation(null);
            setOriginalQuotation(null);
          }}
          onSave={async (updatedQuotation: Quotation) => {
          setSelectedQuotation(updatedQuotation);
          if (originalQuotation && isUnchanged(originalQuotation, updatedQuotation)) {
            toast.info('لم تقم بإدخال أي تعديلات لحفظها');
            setShowEditModal(false);
            setSelectedQuotation(null);
            setOriginalQuotation(null);
            return;
          }

          try {
            const token = localStorage.getItem('token');
            if (!token) {
              throw new Error('يرجى تسجيل الدخول');
            }

            // CRITICAL: Include ALL required fields for the backend
            const payload = {
              issue_date: updatedQuotation.issue_date || updatedQuotation.issueDate,
              expiry_date: updatedQuotation.expiry_date || updatedQuotation.expiryDate,
              total_amount: updatedQuotation.totalAmount || updatedQuotation.total_amount,
              vat_amount: updatedQuotation.vatAmount || updatedQuotation.vat_amount,
              notes: updatedQuotation.notes || null,
              customer_name: updatedQuotation.customer_name || updatedQuotation.customerName,
              discount_rate: updatedQuotation.discount_rate || 0,
              interest_rate: updatedQuotation.interest_rate || 0,
              discount_on_total_percent: updatedQuotation.discount_on_total_percent || 0, // CRITICAL!
              discount_on_total_amount: updatedQuotation.discount_on_total_amount || 0,
              terms: updatedQuotation.terms || null,
              company_id: updatedQuotation.company_id,
              project_id: updatedQuotation.project_id || null,
              items: updatedQuotation.items.map((item) => ({
                description: item.description || '',
                code: item.code || '',
                quantity: Number(item.quantity || 1),
                unit_price: Number(item.unit_price || 0),
                base_unit_price: Number(item.base_unit_price || 0), // CRITICAL!
                vat_rate: Number(item.vat_rate || 15),
                vat_amount: Number(item.vat_amount || 0),
                total_amount: Number(item.total_amount || 0),
                discount_rate: Number(item.discount_rate || 0),
                price_after_tax: Number(item.price_after_tax || 0),
                interest_rate: Number(item.interest_rate || 0),
                price_before_tax: Number(item.price_before_tax || 0),
              })),
            };

            console.log('Sending PATCH request with payload:', JSON.stringify(payload, null, 2));

            const response = await fetch(
              `http://localhost:3000/api/quotations/${updatedQuotation.id}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'فشل في حفظ التعديلات');
            }

            toast.success('تم تعديل عرض السعر بنجاح');
            fetchQuotations();
          } catch (error) {
            setError(error instanceof Error ? error.message : 'فشل في تعديل عرض السعر');
            toast.error(error instanceof Error ? error.message : 'فشل في تعديل عرض السعر');
          } finally {
            setShowEditModal(false);
            setSelectedQuotation(null);
            setOriginalQuotation(null);
          }
        }}
        />
      )}

      {/* Proforma Invoice Preview Modal */}
      {showProformaPreview && proformaQuotation && (
        <ProformaInvoicePreview
          quotation={proformaQuotation as any}
          onClose={() => {
            setShowProformaPreview(false);
            setProformaQuotation(null);
          }}
        />
      )}

    </div>
  );
}

export default PricesOffer;