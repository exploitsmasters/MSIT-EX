import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '/node_modules/@abdulrysr/saudi-riyal-new-symbol-font/style.css';
import { Sale } from '../types/sales';
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
  Loader2,
  AlertCircle,
  CheckCircle,
  Filter,
  FileCheck,
  Check,
  Trash,
  MessageCircle,
  X,
  Edit2,
  Send,
  Printer,
  FileText,
  DollarSign,
  BarChart3,
  Building2,
  ArrowLeft,
} from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';
import CreateInvoice from './CreateInvoice';
import { toast } from 'react-toastify';

const InvoicePreview = lazy(() => import('./InvoicePreview'));

interface Project {
  id: number;
  name: string;
}

interface SalesSummary {
  totalSales: number;
  totalAmount: number;
  totalAmountBeforeVat: number;
  averageAmount: number;
}

type SearchType = 'invoiceNumber' | 'supplyDate' | 'dueDate';

function Sales() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<SalesSummary>({
    totalSales: 0,
    totalAmount: 0,
    totalAmountBeforeVat: 0,
    averageAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Sale | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [showProjectView, setShowProjectView] = useState(
    location.state?.showProjectView || false
  );

  const [showFilters, setShowFilters] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<number | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [invoiceToSend, setInvoiceToSend] = useState<Sale | null>(null);
  const [reportingInvoiceId, setReportingInvoiceId] = useState<number | null>(null);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Sale | null>(null);
  const [showPreviewOptions, setShowPreviewOptions] = useState<number | null>(null);
  const previewRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const moreMenuRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<null | number>(null);
  const [profits, setProfits] = useState(0);
  const [cardLoading, setCardLoading] = useState({
  totalSales: true,
  totalAmountBeforeVat: true,
  profits: true,
  averageAmount: true,
  invoiceCount: true,
  });

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

  useEffect(() => {
  const calculateProfits = async () => {
    setCardLoading(prev => ({ ...prev, profits: true }));
    let invoiceProfit = 0;

    for (const sale of sales) {
      try {
        const response = await fetch(`/api/invoices/${sale.id}`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) continue;
        const data = await response.json();
        data.items.forEach((item: any) => {
          const unitPrice = parseFloat(item.unit_price) || 0;
          const basePrice = parseFloat(item.base_unit_price) || 0;
          const qty = parseFloat(item.quantity) || 0;
          invoiceProfit += (unitPrice - basePrice) * qty;
        });
      } catch (err) {
        console.error('Error fetching invoice details:', err);
      }
    }

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedProject) params.append('projectId', selectedProject);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/installations?${params}`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const installationProfit = data.data.reduce((sum: number, inst: any) => sum + (parseFloat(inst.price) || 0), 0);
        setTimeout(() => {
          setProfits(invoiceProfit + installationProfit);
          setCardLoading(prev => ({ ...prev, profits: false }));
        }, 2000);
      }
    } catch (err) {
      console.error('Error fetching installations:', err);
      setCardLoading(prev => ({ ...prev, profits: false }));
    }
  };

  if (sales.length > 0) {
    calculateProfits();
  } else {
    setProfits(0);
    setCardLoading(prev => ({ ...prev, profits: false }));
  }
}, [sales, searchQuery, selectedProject, startDate, endDate]);

  const fetchSales = async () => {
  try {
    setLoading(true);
    setCardLoading({
      totalSales: true,
      totalAmountBeforeVat: true,
      profits: true,
      averageAmount: true,
      invoiceCount: true,
    });
    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    if (selectedType !== 'all') params.append('type', selectedType);
    if (selectedStatus !== 'all') params.append('status', selectedStatus);
    if (selectedCustomer !== 'all') params.append('customer', selectedCustomer);
    if (selectedProject) params.append('projectId', selectedProject);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (showDueOnly) params.append('dueOnly', 'true');

    const response = await fetch(`/api/invoices?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('فشل في جلب بيانات المبيعات');
    
    const data = await response.json();
    const processedSales = data.invoices.map((invoice: any) => ({
      ...invoice,
      issueDate: invoice.issue_date,
      supplyDate: invoice.supply_date || invoice.issue_date,
      dueDate: invoice.due_date,
      total: parseFloat(invoice.total_amount) || 0,
      vat_amount: parseFloat(invoice.vat_amount) || 0,
      customerName: invoice.customer_name,
      customerVatNumber: invoice.customer_vat_number,
      projectName: invoice.project_name,
      companyId: invoice.company_id,
      notes: invoice.notes,
      terms: invoice.terms,
      qr_code: invoice.qr_code,
      zatca_invoice_hash: invoice.zatca_invoice_hash,
      invoice_type_code: invoice.invoice_type_code,
      invoice_type_name: invoice.invoice_type_name,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at || invoice.created_at,
      items: [],
    }));

    setSales(processedSales);

    const totalAmount = processedSales.reduce((sum: number, sale: Sale) => sum + sale.total, 0);
    const totalAmountBeforeVat = processedSales.reduce((sum: number, sale: Sale) => 
      sum + (sale.total - (sale.vat_amount || 0)), 0);

    setSummary({
      totalSales: processedSales.length,
      totalAmount,
      totalAmountBeforeVat,
      averageAmount: processedSales.length > 0 ? totalAmount / processedSales.length : 0
    });

    setTimeout(() => {
      setCardLoading(prev => ({
        ...prev,
        totalSales: false,
        totalAmountBeforeVat: false,
        averageAmount: false,
        invoiceCount: false,
      }));
    }, 2000);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات');
  } finally {
    setLoading(false);
  }
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
    navigate(`/dashboard/project-sales/${projectId}`, { 
      state: { 
        projectName, 
        fromProjectView: true
      } 
    });
  };

  // Get unique projects from sales for the project view
  const getProjectsWithSales = () => {
    const projectMap = new Map();
    
    sales.forEach(sale => {
      if (sale.projectName) {
        const projectKey = sale.projectName;
        if (!projectMap.has(projectKey)) {
          projectMap.set(projectKey, {
            id: projectKey, // Using project name as ID for now
            name: sale.projectName,
            totalAmount: 0,
            salesCount: 0
          });
        }
        const project = projectMap.get(projectKey);
        project.totalAmount += sale.total;
        project.salesCount += 1;
      }
    });

    return Array.from(projectMap.values());
  };

  useEffect(() => {
    fetchProjects();
    fetchSales();
  }, [searchQuery, selectedType, selectedStatus, selectedCustomer, selectedProject, startDate, endDate, showDueOnly]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (isMoreMenuOpen !== null) {
        const clickedElement = event.target as Node;
        const menuElement = moreMenuRefs.current.get(isMoreMenuOpen);
        if (menuElement && !menuElement.contains(clickedElement)) {
          setIsMoreMenuOpen(null);
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isMoreMenuOpen]);

  // Clear location state after using it
  useEffect(() => {
    if (location.state?.showProjectView) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const downloadXMLFile = (xmlContent: string, fileName: string) => {
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadXML = async (invoice: Sale) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/xml`, {
        headers: getAuthHeaders(),
      });

      const xmlContent = await response.text();

      if (!response.ok) {
        const errorData = JSON.parse(xmlContent);
        throw new Error(errorData.error || 'فشل في تنزيل ملف XML');
      }

      if (!xmlContent || xmlContent.trim() === '') {
        throw new Error('ملف XML فارغ');
      }

      if (!xmlContent.startsWith('<?xml') && !xmlContent.startsWith('<Invoice')) {
        throw new Error('المحتوى المستلم ليس ملف XML صالح');
      }

      downloadXMLFile(xmlContent, `invoice_${invoice.invoice_number}.xml`);
      toast.success(`تم تنزيل ملف XML للفاتورة ${invoice.invoice_number}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ أثناء تنزيل ملف XML';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDownloadSelectedXMLs = async () => {
    if (selectedRows.length === 0) {
      toast.warn('يرجى تحديد فاتورة واحدة على الأقل لتنزيل ملف XML');
      return;
    }

    for (const invoiceId of selectedRows) {
      const invoice = sales.find((sale) => sale.id === invoiceId);
      if (invoice) {
        await handleDownloadXML(invoice);
      }
    }
  };

  const handlePreview = async (sale: Sale) => {
    try {
      const response = await fetch(`/api/invoices/${sale.id}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch invoice details');
      const invoiceData = await response.json();
      setSelectedInvoice({
        ...invoiceData,
        issueDate: invoiceData.issue_date,
        supplyDate: invoiceData.supply_date,
        dueDate: invoiceData.due_date,
        total: Number(invoiceData.total_amount),
        customerName: invoiceData.company.name,
        customerVatNumber: invoiceData.company.vat_number,
        projectName: invoiceData.project_name,
        items: invoiceData.items,
        qr_code: invoiceData.qr_code,
        zatca_invoice_hash: invoiceData.zatca_invoice_hash,
        invoice_type_code: invoiceData.invoice_type_code,
        invoice_type_name: invoiceData.invoice_type_name,
      });
      setShowPreview(true);
      setShowPreviewOptions(null);
    } catch (error) {
      console.error('Preview Error:', error);
      setError('فشل في جلب تفاصيل الفاتورة');
      toast.error('فشل في جلب تفاصيل الفاتورة');
    }
  };

  const handlePrintInvoice = async (sale: Sale) => {
    try {
      const response = await fetch(`/api/invoices/${sale.id}/regenerate-pdf`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
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
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        const cleanup = () => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
          window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 20000);
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ أثناء طباعة الفاتورة';
      toast.error(errorMessage);
    }
  };

  const handleEditInvoice = async (sale: Sale) => {
    try {
      const response = await fetch(`/api/invoices/${sale.id}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch invoice details for editing');
      }

      const invoiceData = await response.json();
      const fullInvoice: Sale = {
        ...invoiceData,
        issueDate: invoiceData.issue_date,
        supplyDate: invoiceData.supply_date,
        dueDate: invoiceData.due_date,
        total: parseFloat(invoiceData.total_amount),
        customerName: invoiceData.company.name,
        customerVatNumber: invoiceData.company.vat_number,
        projectName: invoiceData.project_name,
        companyId: invoiceData.company_id,
        notes: invoiceData.notes,
        terms: invoiceData.terms,
        invoice_type_code: invoiceData.invoice_type_code,
        invoice_type_name: invoiceData.invoice_type_name,
        company: {
          name: invoiceData.company.name,
          vat_number: invoiceData.company.vat_number,
          address: invoiceData.company.address,
          city: invoiceData.company.city,
          postal_code: invoiceData.company.postal_code,
          phone: invoiceData.company.phone,
          email: invoiceData.company.email,
          type: invoiceData.company.type,
        },
        items: invoiceData.items.map((item: any) => ({
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unit_price),
          vatRate: parseFloat(item.vat_rate),
          vatAmount: parseFloat(item.vat_amount),
          totalAmount: parseFloat(item.total_amount),
        })),
      };
      setInvoiceToEdit(fullInvoice);
      setShowCreateInvoiceModal(true);
    } catch (error) {
      console.error('Error fetching invoice details for editing:', error);
      setError('فشل في جلب تفاصيل الفاتورة للتعديل');
    }
  };

  const handleDeleteClick = (id: number) => {
    setInvoiceToDelete(id);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const handleBulkDeleteClick = () => {
    if (selectedRows.length === 0) {
      toast.warn('يرجى تحديد فاتورة واحدة على الأقل لحذفها');
      return;
    }
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      if (isBulkDelete) {
        const deletePromises = selectedRows.map((id) =>
          fetch(`/api/invoices/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }).then((response) => {
            if (!response.ok) {
              return response.json().then((data) => {
                throw new Error(data.error || 'فشل في حذف الفاتورة');
              });
            }
            return id;
          })
        );

        const results = await Promise.all(deletePromises);
        setSales(sales.filter((sale) => !results.includes(sale.id)));
        setSelectedRows([]);
        toast.success('تم حذف الفواتير المحددة بنجاح');
      } else if (invoiceToDelete) {
        const response = await fetch(`/api/invoices/${invoiceToDelete}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'فشل في حذف الفاتورة');
        }

        setSales(sales.filter((sale) => sale.id !== invoiceToDelete));
        setSelectedRows(selectedRows.filter((id) => id !== invoiceToDelete));
        toast.success('تم حذف الفاتورة بنجاح');
      }

      setShowDeleteModal(false);
      setInvoiceToDelete(null);
      setIsBulkDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في حذف الفاتورة');
      toast.error(err instanceof Error ? err.message : 'فشل في حذف الفاتورة');
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setInvoiceToDelete(null);
    setIsBulkDelete(false);
  };

  const handleWhatsAppClick = (sale: Sale) => {
    setInvoiceToSend(sale);
    setShowWhatsAppModal(true);
  };

  const handleWhatsAppSend = () => {
    if (!invoiceToSend || !whatsAppNumber) return;

    const cleanedNumber = whatsAppNumber.replace(/[^0-9]/g, '');
    const formattedNumber = cleanedNumber.startsWith('966') ? cleanedNumber : `966${cleanedNumber}`;
    const invoiceUrl = `${window.location.origin}/invoices/${invoiceToSend.id}`;
    const message = `مرحبًا، إليك فاتورة رقم ${invoiceToSend.invoice_number} بقيمة ${invoiceToSend.total.toLocaleString('ar-SA')} ريال سعودي. يمكنك عرض التفاصيل هنا: ${invoiceUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsAppUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;

    window.open(whatsAppUrl, '_blank');
    setShowWhatsAppModal(false);
    setWhatsAppNumber('');
    setInvoiceToSend(null);
  };

  const handleWhatsAppCancel = () => {
    setShowWhatsAppModal(false);
    setWhatsAppNumber('');
    setInvoiceToSend(null);
  };

  const handleCertifyInvoice = async (sale: Sale) => {
    if (sale.status !== 'draft') {
      toast.warn('يمكن تعميد الفواتير ذات الحالة "مسودة" فقط');
      return;
    }
    try {
      setReportingInvoiceId(sale.id);
      const regenerateResponse = await fetch(`/api/invoices/${sale.id}/regenerate-pdf`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'certified' }),
      });
      if (!regenerateResponse.ok) {
        const errorData = await regenerateResponse.json();
        throw new Error(errorData.error || 'فشل في إعادة إنشاء الفاتورة');
      }

      const updatedInvoiceResponse = await fetch(`/api/invoices/${sale.id}`, {
        headers: getAuthHeaders(),
      });
      if (updatedInvoiceResponse.ok) {
        const updatedInvoiceData = await updatedInvoiceResponse.json();
        setSales((prevSales) =>
          prevSales.map((s) =>
            s.id === sale.id
              ? {
                  ...s,
                  status: updatedInvoiceData.status,
                  qr_code: updatedInvoiceData.qr_code,
                  zatca_invoice_hash: updatedInvoiceData.zatca_invoice_hash,
                }
              : s
          )
        );
        if (selectedInvoice?.id === sale.id) {
          setSelectedInvoice({
            ...selectedInvoice,
            status: updatedInvoiceData.status,
            qr_code: updatedInvoiceData.qr_code,
            zatca_invoice_hash: updatedInvoiceData.zatca_invoice_hash,
          });
        }
      } else {
        setSales((prevSales) =>
          prevSales.map((s) =>
            s.id === sale.id ? { ...s, status: 'certified' } : s
          )
        );
        if (selectedInvoice?.id === sale.id) {
          setSelectedInvoice({ ...selectedInvoice, status: 'certified' });
        }
      }
      toast.success('تم تعميد الفاتورة بنجاح');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ أثناء تعميد الفاتورة';
      toast.error(errorMessage);
    } finally {
      setReportingInvoiceId(null);
    }
  };

  const handleCertifySelectedInvoices = async () => {
    if (selectedRows.length === 0) {
      toast.warn('يرجى تحديد فاتورة واحدة على الأقل للتعميد');
      return;
    }
    const selectedSales = sales.filter((sale) => selectedRows.includes(sale.id));
    const uncertifiedSales = selectedSales.filter((sale) => sale.status === 'draft');
    if (uncertifiedSales.length === 0) {
      toast.warn('جميع الفواتير المحددة مصدقة بالفعل أو ليست بحالة "مسودة"');
      return;
    }
    for (const sale of uncertifiedSales) {
      await handleCertifyInvoice(sale);
    }
  };

  const handleEmailInvoice = (sale: Sale) => {
    toast.info(`جاري إرسال الفاتورة ${sale.invoice_number} بالبريد الإلكتروني`);
  };

  const formatDate = (dateString: string, includeTime = false) => {
    return new Date(dateString).toLocaleDateString('ar-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(includeTime && {
        hour: '2-digit',
        minute: '2-digit',
      }),
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
      selectedRows.length === sales.length ? [] : sales.map((sale) => sale.id)
    );
  };

  const handleCreateInvoiceClose = () => {
    setShowCreateInvoiceModal(false);
    setInvoiceToEdit(null);
    fetchSales();
  };

  const areAllSelectedCertified = () => {
    return selectedRows.length > 0 &&
          selectedRows.every((id) => {
            const sale = sales.find((s) => s.id === id);
            return sale && sale.status === 'certified';
          });
  };

  if (showProjectView) {
    const projectsWithSales = getProjectsWithSales();
    
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
              <h1 className="text-2xl font-bold text-gray-900">المبيعات حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض المبيعات مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithSales.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id, project.name)}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <Building2 className="h-6 w-6 text-green-600" />
                </div>
                <span className="text-sm text-gray-500">{project.salesCount} فاتورة</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-2xl font-bold text-green-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي المبيعات</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المبيعات</h1>
          <p className="text-gray-600 mt-1">إدارة فواتير وعمليات البيع</p>
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
            إنشاء فاتورة جديدة
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي المبيعات</p>
              {cardLoading.totalSales ? (
                <div className="flex items-center justify-center h-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4A3B85]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">{summary.totalAmount.toFixed(2)} ر.س</p>
              )}
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">المبيعات قبل الضريبة</p>
              {cardLoading.totalAmountBeforeVat ? (
                <div className="flex items-center justify-center h-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4A3B85]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">{summary.totalAmountBeforeVat.toFixed(2)} ر.س</p>
              )}
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">الأرباح</p>
              {cardLoading.profits ? (
                <div className="flex items-center justify-center h-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4A3B85]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">{profits.toFixed(2)} ر.س</p>
              )}
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">متوسط المبيعات</p>
              {cardLoading.averageAmount ? (
                <div className="flex items-center justify-center h-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4A3B85]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">{summary.averageAmount.toFixed(2)} ر.س</p>
              )}
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">عدد الفواتير</p>
              {cardLoading.invoiceCount ? (
                <div className="flex items-center justify-center h-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4A3B85]" />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">{summary.totalSales}</p>
              )}
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <FileText className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 ml-2" />
          {error}
        </div>
      )}

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

      {/* Action Buttons */}
      {selectedRows.length > 0 && (
        <div className="flex gap-3">
          {!areAllSelectedCertified() && (
            <button
              onClick={handleCertifySelectedInvoices}
              className="flex items-center px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200"
            >
              <CheckCircle className="h-5 w-5 ml-1" />
              تعميد الفواتير
            </button>
          )}
          <button
            onClick={handleBulkDeleteClick}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
          >
            <Trash className="h-5 w-5 ml-1" />
            مسح الفواتير
          </button>
          <button
            onClick={handleDownloadSelectedXMLs}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
          >
            <Download className="h-5 w-5 ml-1" />
            تنزيل XML
          </button>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85] mx-auto"></div>
            <p className="mt-2 text-gray-500">جاري التحميل...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد فواتير مبيعات</h3>
            <p className="text-gray-500">لم يتم العثور على فواتير تطابق المعايير المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="w-12 px-6 py-3">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                      checked={selectedRows.length === sales.length && sales.length > 0}
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
                    ملاحظات
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
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 text-center">
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#4A3b85]" />
                      <span className="ms-2">جاري...</span>
                    </div>
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 text-center text-gray-500">
                    لا توجد فواتير
                  </td>
                </tr>
              ) : (
                sales.map((sale, index) => {
                  console.log(`Sale ${sale.id} status`, sale.status);
                  return (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4">
                        <input
                          type="checkbox"
                          className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                          checked={selectedRows.includes(sale.id)}
                          onChange={() => handleRowSelect(sale.id)}
                        />
                      </td>
                      <td className="px-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.invoice_number}
                      </td>
                      <td className="px-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{sale.customerName}</div>
                        <div className="text-xs text-gray-500">{sale.customerVatNumber}</div>
                      </td>
                      <td className="px-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.notes || 'غير محدد'}
                      </td>
                      <td className="px-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.issueDate)}
                      </td>
                      <td className="px-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.dueDate)}
                      </td>
                      <td className="px-4 icon-saudi_riyal whitespace-nowrap text-sm text-gray-900">
                        {sale.total?.toLocaleString('en-US')} ريال
                      </td>
                      <td className="px-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(
                            sale.status
                          )}`}
                        >
                          {getStatusText(sale.status)}
                        </span>
                      </td>
                      <td className="px-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="mb-2 flex items-center gap-3">
                          {/* Delete Button */}
                          <div className="group relative flex flex-col items-center">
                            <button
                              onClick={() => handleDeleteClick(sale.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                            >
                              <Trash className="h-4 w-4 text-red-600" />
                            </button>
                            <div className="absolute bottom-full mb-2 px-4 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                              حذف الفاتورة
                            </div>
                            <span className="text-xs text-gray-600">حذف</span>
                          </div>
                          {/* Preview Button */}
                          <div className="group relative flex flex-col items-center">
                            <button
                              onClick={() => handlePreview(sale)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                            >
                              <Eye className="h-4 w-4 text-blue-600" />
                            </button>
                            <div className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                              عرض الفاتورة
                            </div>
                            <div className="text-xs text-gray-600">عرض</div>
                          </div>
                          {/* Certify Button */}
                          {sale.status !== 'certified' && (
                          <div className="group relative flex flex-col items-center">
                            <button
                              onClick={() => handleCertifyInvoice(sale)}
                              disabled={reportingInvoiceId === sale.id}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 disabled:opacity-50"
                            >
                              {reportingInvoiceId === sale.id ? (
                                <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 text-purple-600" />
                              )}
                            </button>
                            <div className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                              تعميد الفاتورة
                            </div>
                            <span className="text-xs text-gray-600">تعميد</span>
                          </div>
                        )}
                        
                          {/* Print Button */}
                          <div className="group relative flex flex-col items-center">
                            <button
                              onClick={() => handlePrintInvoice(sale)}
                              disabled={reportingInvoiceId === sale.id}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 disabled:opacity-50"
                            >
                              <Printer className="h-4 w-4 text-blue-600" />
                            </button>
                            <div className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                              طباعة الفاتورة
                            </div>
                            <span className="text-xs text-gray-600">طباعة</span>
                          </div>
                          {/* Edit Button */}
                          {sale.status !== 'certified' && (
                            <div className="group relative flex flex-col items-center">
                              <button
                                onClick={() => handleEditInvoice(sale)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                              >
                                <Edit2 className="h-4 w-4 text-yellow-600" />
                              </button>
                              <div className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                                تعديل الفاتورة
                              </div>
                              <span className="text-xs text-gray-600">تعديل</span>
                            </div>
                          )}
                          {/* More Options */}
                          <div
                            className="group relative flex flex-col items-center"
                            ref={(e) => {
                              if (e) moreMenuRefs.current.set(sale.id, e);
                              else moreMenuRefs.current.delete(sale.id);
                            }}
                          >
                            <button
                              onClick={() => setIsMoreMenuOpen(isMoreMenuOpen === sale.id ? null : sale.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-600" />
                            </button>
                            <div className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                              المزيد
                            </div>
                            <span className="text-xs text-gray-600">المزيد</span>
                            {isMoreMenuOpen === sale.id && (
                              <div
                                className="absolute left-10  mb-0 w-48 rounded-xl shadow-lg bg-gray-100 ring-0 z-50"
                              >
                                <div className="mt-0">
                                  <button
                                    onClick={() => {
                                      handleEmailInvoice(sale);
                                      setIsMoreMenuOpen(null);
                                    }}
                                    className="w-full flex items-center px-4 py-2 text-sm text-gray-900 hover:bg-gray-200"
                                  >
                                    <Mail className="h-4 w-4 ml-2 text-gray-600" />
                                    إرسال بالبريد الإلكتروني
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleWhatsAppClick(sale);
                                      setIsMoreMenuOpen(null);
                                    }}
                                    className="w-full flex items-center px-4 py-2 text-sm text-gray-900 hover:bg-gray-200"
                                  >
                                    <MessageCircle className="h-4 w-4 ml-2 text-green-600" />
                                    إرسال عبر الواتساب
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDownloadXML(sale);
                                      setIsMoreMenuOpen(null);
                                    }}
                                    className="w-full flex items-center px-4 py-2 text-sm text-gray-900 hover:bg-gray-200"
                                  >
                                    <Download className="h-4 w-4 ml-2 text-gray-600" />
                                    تنزيل ملف XML
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Preview Modal */}
      {showPreview && selectedInvoice && (
        <Suspense fallback={<div className="flex items-center justify-center h-screen">جاري التحميل...</div>}>
          <InvoicePreview
            invoice={selectedInvoice}
            onClose={() => {
              setShowPreview(false);
              setSelectedInvoice(null);
            }}
          />
        </Suspense>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        message={isBulkDelete ? "هل أنت متأكد من حذف الفواتير المحددة؟" : "هل أنت متأكد من حذف هذه الفاتورة؟"}
      />

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                إرسال الفاتورة عبر واتساب
              </h2>
              <button
                onClick={handleWhatsAppCancel}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  رقم الواتساب <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={whatsAppNumber}
                  onChange={(e) => setWhatsAppNumber(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent border-gray-300"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 space-x-reverse pt-4 border-t">
              <button
                type="button"
                onClick={handleWhatsAppCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleWhatsAppSend}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4A3B85] hover:bg-[#5A4B95] rounded-lg flex items-center"
                disabled={!whatsAppNumber}
              >
                إرسال
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Invoice Modal */}
      {showCreateInvoiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <CreateInvoice
            invoiceToEdit={invoiceToEdit}
            onClose={handleCreateInvoiceClose}
          />
        </div>
      )}
    </div>
  );
}

export default Sales;