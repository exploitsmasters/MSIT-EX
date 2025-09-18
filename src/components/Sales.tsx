import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  FileText,
  Printer
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import InvoicePreview from './InvoicePreview';

const formatPrice = (value: number): string => {
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};

interface InvoiceSummary {
  totalInvoices: number;
  totalAmount: number;
  averageAmount: number;
}

interface Project {
  id: number;
  name: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  base_unit_price: number;
  interest_rate: number;
  code?: string;
  discount_rate?: number;
  total_vat_amount?: number;
  price_after_tax?: number;
}

interface Company {
  name: string;
  vat_number: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  type: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  issue_date: string;
  supply_date: string;
  due_date: string;
  total_amount: number;
  vat_amount: number;
  status: 'draft' | 'issued' | 'paid' | 'cancelled' | 'certified';
  notes?: string | null;
  terms?: string | null;
  project_name?: string;
  created_at: string;
  updated_at: string;
  company_id: number;
  customer_name: string;
  customer_vat_number: string;
  invoice_type_code: string;
  invoice_type_name: string;
  company: Company;
  items?: InvoiceItem[];
  qr_code?: string;
  zatca_invoice_hash?: string;
}

function Sales() {
  const navigate = useNavigate();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({
    totalInvoices: 0,
    totalAmount: 0,
    averageAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [success, setSuccess] = useState('');
  const [showProjectView, setShowProjectView] = useState(
    location.state?.showProjectView || false
  );

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

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      const queryParams = new URLSearchParams({
        search: searchQuery,
        status: selectedStatus,
      });

      if (selectedProject) queryParams.append('projectId', selectedProject);
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);

      const response = await fetch(
        `/api/invoices?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('فشل في جلب بيانات الفواتير');
      }

      const data = await response.json();

      const transformedInvoices = data.invoices.map((invoice: any) => ({
        ...invoice,
        total_amount: Number(invoice.total_amount),
        vat_amount: Number(invoice.vat_amount),
      }));

      setInvoices(transformedInvoices);
      
      // Calculate summary
      const totalInvoices = transformedInvoices.length;
      const totalAmount = transformedInvoices.reduce((sum: number, inv: any) => sum + inv.total_amount, 0);
      const averageAmount = totalInvoices > 0 ? totalAmount / totalInvoices : 0;
      
      setSummary({
        totalInvoices,
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

  const fetchInvoiceDetails = async (invoice: Invoice) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('يرجى تسجيل الدخول');
      }
      
      const response = await fetch(`/api/invoices/${invoice.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل في جلب تفاصيل الفاتورة');
      }

      const invoiceData = await response.json();
      console.log('Fetched Invoice Data:', invoiceData);

      const transformedInvoice: Invoice = {
        ...invoiceData,
        total_amount: Number(invoiceData.total_amount),
        vat_amount: Number(invoiceData.vat_amount),
        items: invoiceData.items?.map((item: any) => ({
          description: item.description || '',
          code: item.code || '',
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          base_unit_price: Number(item.base_unit_price) || 0,
          vat_rate: Number(item.vat_rate) || 15,
          vat_amount: Number(item.vat_amount) || 0,
          total_amount: Number(item.total_amount) || 0,
          discount_rate: Number(item.discount_rate) || 0,
          interest_rate: Number(item.interest_rate) || 0,
          total_vat_amount: Number(item.total_vat_amount) || 0,
          price_after_tax: Number(item.price_after_tax) || 0,
        })) || [],
      };

      console.log('Transformed Invoice:', transformedInvoice);
      return transformedInvoice;
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      setError(error instanceof Error ? error.message : 'فشل في جلب تفاصيل الفاتورة');
      toast.error(error instanceof Error ? error.message : 'فشل في جلب تفاصيل الفاتورة');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchInvoices();
  }, [searchQuery, selectedStatus, selectedProject, startDate, endDate]);

  const handlePreview = async (invoice: Invoice) => {
    const invoiceData = await fetchInvoiceDetails(invoice);
    if (invoiceData) {
      setSelectedInvoice(invoiceData);
      setShowPreview(true);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      const response = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 403 || response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('companyName');
        navigate('/', { replace: true });
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'فشل في حذف الفاتورة');
      }

      setSuccess('تم حذف الفاتورة بنجاح');
      toast.success('تم حذف الفاتورة بنجاح');
      setTimeout(() => setSuccess(''), 3000);
      fetchInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في حذف الفاتورة');
      toast.error(err instanceof Error ? err.message : 'فشل في حذف الفاتورة');
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) {
      return 'N/A';
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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
      selectedRows.length === invoices.length ? [] : invoices.map((invoice) => invoice.id)
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSelectedProject('');
    setStartDate('');
    setEndDate('');
  };

  const handleProjectClick = (projectId: number, projectName: string) => {
    navigate(`/dashboard/project-invoices/${projectId}`, { 
      state: { 
        projectName, 
        fromProjectView: true
      } 
    });
  };

  const getProjectsWithInvoices = () => {
    const projectMap = new Map();
    
    invoices.forEach(invoice => {
      if (invoice.project_name) {
        const projectKey = invoice.project_name;
        if (!projectMap.has(projectKey)) {
          projectMap.set(projectKey, {
            name: invoice.project_name,
            totalAmount: 0,
            invoiceCount: 0
          });
        }
        const project = projectMap.get(projectKey);
        project.totalAmount += invoice.total_amount;
        project.invoiceCount += 1;
      }
    });

    return Array.from(projectMap.values());
  };

  useEffect(() => {
    if (location.state?.showProjectView) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  if (showProjectView) {
    const projectsWithInvoices = getProjectsWithInvoices();
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowProjectView(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">الفواتير حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض الفواتير مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithInvoices.map((project, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <span className="text-sm text-gray-500">{project.invoiceCount} فاتورة</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-2xl font-bold text-blue-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي الفواتير</p>
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
          <h1 className="text-2xl font-bold text-gray-900">الفواتير الضريبية</h1>
          <p className="text-gray-600 mt-1">إدارة الفواتير الضريبية والمبيعات</p>
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
            onClick={() => navigate('/dashboard/create-invoice')}
            className="bg-[#4A3B85] text-white px-4 py-2 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة فاتورة
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي الفواتير</p>
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
              <p className="text-sm font-medium text-gray-600">عدد الفواتير</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalInvoices}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Package className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">متوسط الفاتورة</p>
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
              placeholder="البحث في الفواتير..."
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

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85] mx-auto"></div>
            <p className="mt-2 text-gray-500">جاري التحميل...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد فواتير</h3>
            <p className="text-gray-500">لم يتم العثور على فواتير تطابق المعايير المحددة</p>
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
                        selectedRows.length === invoices.length && invoices.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    رقم الفاتورة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    العميل
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تاريخ الإصدار
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تاريخ الاستحقاق
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
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                        checked={selectedRows.includes(invoice.id)}
                        onChange={() => handleRowSelect(invoice.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {invoice.customer_name}
                      </div>
                      {invoice.customer_vat_number && (
                        <div className="text-sm text-gray-500">
                          {invoice.customer_vat_number}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.issue_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatPrice(invoice.total_amount)} ر.س
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(invoice.status)}`}>
                        {getStatusText(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handlePreview(invoice)}
                          className="text-blue-600 hover:text-blue-900 ml-2"
                          title="معاينة الفاتورة"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/dashboard/edit-invoice/${invoice.id}`)}
                          className="text-[#4A3B85] hover:text-[#5A4B95] ml-2"
                          title="تعديل الفاتورة"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="text-red-600 hover:text-red-900"
                          title="حذف الفاتورة"
                        >
                          <Trash className="h-4 w-4" />
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

      {/* Preview Modal */}
      {showPreview && selectedInvoice && (
        <InvoicePreview
          invoice={selectedInvoice}
          onClose={() => {
            setShowPreview(false);
            setSelectedInvoice(null);
          }}
        />
      )}
    </div>
  );
}

export default Sales;