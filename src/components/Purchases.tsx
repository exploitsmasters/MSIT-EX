import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  DollarSign, 
  FileText, 
  BarChart3, 
  Building2, 
  Camera, 
  Upload, 
  Eye,
  Download,
  Calendar,
  User,
  ArrowLeft,
  Package,
  RotateCcw,
  Check,
  X,
  Crop,
  Contrast
} from 'lucide-react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';
import Select from 'react-select';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { DocumentScanner } from './DocumentScanner';

interface Purchase {
  id: number;
  invoice_number: string;
  total_amount: number;
  vat_amount: number;
  supplier_name?: string;
  project_name?: string;
  project_id?: number;
  mission_id?: number;
  mission_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  original_file_name?: string;
  file_path?: string;
  file_type?: string;
  file_url?: string;
  breakdown_total_before_vat: number;
  breakdown_total_vat: number;
  breakdown_total_with_vat: number;
}

interface PurchaseSummary {
  totalPurchases: number;
  totalAmount: number;
  totalAmountBeforeVat: number;
  averageAmount: number;
}

interface Project {
  id: number;
  name: string;
  missions?: ProjectMission[];
}

interface ProjectMission {
  id: number;
  name: string;
  description: string;
  order_index: number;
}

interface Supplier {
  id: number;
  name: string;
}

interface SelectOption {
  value: string;
  label: string;
}

function Purchases() {
  const navigate = useNavigate();
  const location = useLocation();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projectMissions, setProjectMissions] = useState<ProjectMission[]>([]);
  const [summary, setSummary] = useState<PurchaseSummary>({
    totalPurchases: 0,
    totalAmount: 0,
    totalAmountBeforeVat: 0,
    averageAmount: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showProjectView, setShowProjectView] = useState(
    location.state?.showProjectView || false
  );
  
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [showDocumentScanner, setShowDocumentScanner] = useState(false);
  const [scannedDocument, setScannedDocument] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    invoice_number: '',
    supplier_name: '',
    project_id: '',
    mission_id: '',
    notes: '',
    invoice_date: new Date().toISOString().split('T')[0],
    invoice_time: new Date().toTimeString().slice(0, 5)
  });

  const supplierOptions: SelectOption[] = suppliers.map(supplier => ({
    value: supplier.id.toString(),
    label: supplier.name
  }));

  const projectOptions: SelectOption[] = projects.map(project => ({
    value: project.id.toString(),
    label: project.name
  }));

  const missionOptions: SelectOption[] = projectMissions.map(mission => ({
    value: mission.id.toString(),
    label: mission.name
  }));

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const getAuthHeadersMultipart = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedProject) params.append('projectId', selectedProject);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/purchases?${params}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch purchases');
      }

      const result = await response.json();
      if (result.success && result.purchases) {
        const processedPurchases = result.purchases.map((purchase: any) => ({
          ...purchase,
          total_amount: parseFloat(purchase.total_amount) || 0,
          vat_amount: parseFloat(purchase.vat_amount) || 0,
          breakdown_total_before_vat: parseFloat(purchase.breakdown_total_before_vat) || 0,
          breakdown_total_vat: parseFloat(purchase.breakdown_total_vat) || 0,
          breakdown_total_with_vat: parseFloat(purchase.breakdown_total_with_vat) || 0
        }));
        
        setPurchases(processedPurchases);
        
        const totalAmount = processedPurchases.reduce((sum: number, purchase: Purchase) => 
          sum + (purchase.breakdown_total_with_vat > 0 ? purchase.breakdown_total_with_vat : purchase.total_amount), 0);
        
        const totalAmountBeforeVat = processedPurchases.reduce((sum: number, purchase: Purchase) => 
          sum + purchase.breakdown_total_before_vat, 0);
        
        setSummary({
          totalPurchases: processedPurchases.length,
          totalAmount,
          totalAmountBeforeVat,
          averageAmount: processedPurchases.length > 0 ? totalAmount / processedPurchases.length : 0
        });
      }
    } catch (error) {
      console.error('Error fetching purchases:', error);
      toast.error('خطأ في جلب المشتريات');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      console.log('Fetching projects from: /api/projects/with-missions');
      console.log('Token:', localStorage.getItem('token'));
      const response = await fetch('/api/projects/with-missions', {
        headers: getAuthHeaders()
      });
      console.log('Response URL:', response.url);
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.success && data.data && Array.isArray(data.data)) {
        setProjects(data.data);
      } else {
        setProjects([]);
        console.warn('No projects found or invalid response format');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('خطأ في جلب المشاريع: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectMissions = async (projectId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token || !projectId) {
        setProjectMissions([]);
        return;
      }

      const response = await fetch(`/api/projects/${projectId}/missions`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch project missions');
        setProjectMissions([]);
        return;
      }

      const data = await response.json();
      if (data.success && data.data && Array.isArray(data.data)) {
        setProjectMissions(data.data);
      } else {
        setProjectMissions([]);
      }
    } catch (error) {
      console.error('Error fetching project missions:', error);
      toast.error('خطأ في جلب مهام المشروع');
      setProjectMissions([]);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`/api/suppliers/dropdown?search=${searchQuery}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('فشل في جلب بيانات الموردين');
      }
      
      const data = await response.json();
      
      if (data.success && data.data && Array.isArray(data.data)) {
        setSuppliers(data.data);
      } else if (Array.isArray(data)) {
        setSuppliers(data);
      } else {
        setSuppliers([]);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('خطأ في جلب الموردين');
      setSuppliers([]);
    }
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setShowCamera(false);
      
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `invoice-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
          setUploadPreview(imageSrc);
        });
    }
  }, [webcamRef]);

  const handleDocumentScan = useCallback((scannedImageData: string) => {
    setScannedDocument(scannedImageData);
    setShowDocumentScanner(false);
    
    fetch(scannedImageData)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `scanned-invoice-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedFile(file);
        setUploadPreview(scannedImageData);
      });
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.invoice_number || !formData.supplier_name || !formData.project_id || !formData.mission_id) {
      toast.error('جميع الحقول مطلوبة بما في ذلك المشروع والمهمة');
      return;
    }

    try {
      setIsSubmitting(true);
      const formDataToSend = new FormData();
      formDataToSend.append('invoice_number', formData.invoice_number);
      formDataToSend.append('total_amount', '0');
      formDataToSend.append('supplier_name', formData.supplier_name);
      formDataToSend.append('project_id', formData.project_id);
      formDataToSend.append('mission_id', formData.mission_id);
      formDataToSend.append('notes', formData.notes || '');
      formDataToSend.append('invoice_date', formData.invoice_date);
      formDataToSend.append('invoice_time', formData.invoice_time);
      
      if (selectedFile) {
        formDataToSend.append('file', selectedFile);
      }

      const url = editingPurchase 
        ? `/api/purchases/${editingPurchase.id}`
        : '/api/purchases';
      
      const method = editingPurchase ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeadersMultipart(),
        body: formDataToSend
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      toast.success(result.message || 'تم حفظ الفاتورة بنجاح');
      resetForm();
      fetchPurchases();
    } catch (error) {
      console.error('Error saving purchase:', error);
      toast.error(`خطأ في حفظ الفاتورة: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/purchases/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        toast.success(result.message);
        fetchPurchases();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting purchase:', error);
      toast.error('خطأ في حذف الفاتورة');
    }
  };

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      supplier_name: '',
      project_id: '',
      mission_id: '',
      notes: '',
      invoice_date: new Date().toISOString().split('T')[0],
      invoice_time: new Date().toTimeString().slice(0, 5)
    });
    setSelectedFile(null);
    setUploadPreview(null);
    setCapturedImage(null);
    setScannedDocument(null);
    setProjectMissions([]);
    setIsModalOpen(false);
    setEditingPurchase(null);
  };

  const handleEdit = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      invoice_number: purchase.invoice_number,
      supplier_name: purchase.supplier_name || '',
      project_id: purchase.project_id?.toString() || '',
      mission_id: purchase.mission_id?.toString() || '',
      notes: purchase.notes || '',
      invoice_date: new Date(purchase.created_at).toISOString().split('T')[0],
      invoice_time: new Date(purchase.created_at).toTimeString().slice(0, 5)
    });
    
    if (purchase.project_id) {
      fetchProjectMissions(purchase.project_id.toString());
    }
    
    setIsModalOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedProject('');
    setStartDate('');
    setEndDate('');
  };

  const handleFilePreview = (purchase: Purchase) => {
    if (purchase.file_url) {
      window.open(purchase.file_url, '_blank');
    } else if (purchase.file_path) {
      const filename = purchase.file_path.split('/').pop() || purchase.file_path.split('\\').pop();
      window.open(`/uploads/${filename}`, '_blank');
    } else {
      toast.warn('لا يوجد ملف مرفق');
    }
  };

  const handleInvoiceBreakdown = (purchase: Purchase) => {
    navigate(`/dashboard/invoice-breakdown/${purchase.id}`, {
      state: { 
        invoiceNumber: purchase.invoice_number,
        supplierName: purchase.supplier_name,
        projectName: purchase.project_name,
        returnToProjectView: showProjectView
      }
    });
  };

  const handleProjectClick = (projectId: number, projectName: string) => {
    navigate(`/dashboard/project-purchases/${projectId}`, { 
      state: { 
        projectName, 
        fromProjectView: true
      } 
    });
  };

  const getProjectsWithPurchases = () => {
    const projectMap = new Map();
    
    purchases.forEach(purchase => {
      if (purchase.project_id && purchase.project_name) {
        if (!projectMap.has(purchase.project_id)) {
          projectMap.set(purchase.project_id, {
            id: purchase.project_id,
            name: purchase.project_name,
            totalAmount: 0,
            purchaseCount: 0,
            missions: new Set()
          });
        }
        const project = projectMap.get(purchase.project_id);
        project.totalAmount += purchase.breakdown_total_with_vat > 0 ? purchase.breakdown_total_with_vat : purchase.total_amount;
        project.purchaseCount += 1;
        if (purchase.mission_name) {
          project.missions.add(purchase.mission_name);
        }
      }
    });

    return Array.from(projectMap.values()).map(project => ({
      ...project,
      missions: Array.from(project.missions)
    }));
  };

  const handleProjectChange = (selectedOption: SelectOption | null) => {
    const projectId = selectedOption?.value || '';
    setFormData({ ...formData, project_id: projectId, mission_id: '' });
    
    if (projectId) {
      fetchProjectMissions(projectId);
    } else {
      setProjectMissions([]);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  useEffect(() => {
    if (location.state?.showProjectView) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    fetchPurchases();
    fetchProjects();
    fetchSuppliers();
  }, [searchTerm, selectedProject, startDate, endDate]);

  useEffect(() => {
    fetchSuppliers();
  }, [searchQuery]);

  if (showProjectView) {
    const projectsWithPurchases = getProjectsWithPurchases();
    
    return (
      <div className="space-y-6">
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick rtl />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowProjectView(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">المشتريات حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض المشتريات مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithPurchases.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id, project.name)}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <Building2 className="h-6 w-6 text-green-600" />
                </div>
                <span className="text-sm text-gray-500">{project.purchaseCount} فاتورة</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              {project.missions && project.missions.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-1">المهام:</p>
                  <div className="space-y-1">
                    {project.missions.slice(0, 2).map((mission, index) => (
                      <span key={index} className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full mr-1">
                        {mission}
                      </span>
                    ))}
                    {project.missions.length > 2 && (
                      <span className="text-xs text-gray-500">+{project.missions.length - 2} أخرى</span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-2xl font-bold text-green-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي المشتريات</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick rtl />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المشتريات</h1>
          <p className="text-gray-600 mt-1">إدارة فواتير المشتريات والموردين</p>
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
            onClick={() => setIsModalOpen(true)}
            className="bg-[#4A3B85] text-white px-4 py-2 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة فاتورة شراء
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي المشتريات</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalAmount.toFixed(2)} ر.س</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي المشتريات قبل الضريبة</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalAmountBeforeVat.toFixed(2)} ر.س</p>
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
              <p className="text-2xl font-bold text-gray-900">{summary.totalPurchases}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <FileText className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">متوسط المشتريات</p>
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

      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="البحث في الفواتير..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85] mx-auto"></div>
            <p className="mt-2 text-gray-500">جاري التحميل...</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد فواتير شراء</h3>
            <p className="text-gray-500">لم يتم العثور على فواتير تطابق المعايير المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    رقم الفاتورة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الضريبة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجمالي
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المورد
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المشروع
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المهمة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                     ملاحظات مهمه 
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    التاريخ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div 
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                            onClick={() => handleInvoiceBreakdown(purchase)}
                          >
                            {purchase.invoice_number}
                          </div>
                          {purchase.original_file_name && (
                            <div className="text-xs text-green-600 flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              مرفق
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {purchase.breakdown_total_before_vat > 0 
                          ? purchase.breakdown_total_before_vat.toFixed(2) 
                          : '-'} ر.س
                      </span>
                    </td> */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-orange-600">
                        {purchase.breakdown_total_vat > 0 
                          ? purchase.breakdown_total_vat.toFixed(2) 
                          : '-'} ر.س
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-green-600">
                        {purchase.breakdown_total_with_vat > 0 
                          ? purchase.breakdown_total_with_vat.toFixed(2) 
                          : '-'} ر.س
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {purchase.supplier_name || 'غير محدد'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {purchase.project_name ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {purchase.project_name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">غير مخصص</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {purchase.mission_name ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                          {purchase.mission_name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">غير محدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {purchase.notes ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-green-800">
                          {purchase.notes}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">غير مخصص</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(purchase.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleInvoiceBreakdown(purchase)}
                          className="text-purple-600 hover:text-purple-900 ml-2"
                          title="تفريغ الفاتورة"
                        >
                          <Package className="h-4 w-4" />
                        </button>
                        {(purchase.file_url || purchase.file_path) && (
                          <button
                            onClick={() => handleFilePreview(purchase)}
                            className="text-green-600 hover:text-green-900 ml-2"
                            title="عرض الفاتورة"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(purchase)}
                          className="text-[#4A3B85] hover:text-[#5A4B95] ml-2"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(purchase.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingPurchase ? 'تعديل فاتورة الشراء' : 'إضافة فاتورة شراء جديدة'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    رقم الفاتورة *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المورد *
                  </label>
                  <div className="relative">
                    <Select
                      options={supplierOptions}
                      value={supplierOptions.find((s) => s.label === formData.supplier_name) || null}
                      onChange={(selectedOption) =>
                        setFormData({ ...formData, supplier_name: selectedOption?.label || '' })
                      }
                      onInputChange={(value) => setSearchQuery(value)}
                      placeholder="ابحث عن المورد أو اختر..."
                      isClearable
                      isDisabled={isSubmitting}
                      className="w-full text-right"
                      classNamePrefix="react-select"
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          borderColor: '#d1d5db',
                          borderRadius: '0.375rem',
                          padding: '2px',
                          '&:hover': { borderColor: '#4A3B85' },
                        }),
                        menu: (provided) => ({ ...provided, textAlign: 'right' }),
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المشروع *
                  </label>
                  <div className="relative">
                    <Select
                      options={projectOptions}
                      value={projectOptions.find((p) => p.value === formData.project_id) || null}
                      onChange={handleProjectChange}
                      placeholder="اختر المشروع..."
                      isClearable
                      isDisabled={isSubmitting}
                      className="w-full text-right"
                      classNamePrefix="react-select"
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          borderColor: '#d1d5db',
                          borderRadius: '0.375rem',
                          padding: '2px',
                          '&:hover': { borderColor: '#4A3B85' },
                        }),
                        menu: (provided) => ({ ...provided, textAlign: 'right' }),
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المهمة *
                  </label>
                  <div className="relative">
                    <Select
                      options={missionOptions}
                      value={missionOptions.find((m) => m.value === formData.mission_id) || null}
                      onChange={(selectedOption) =>
                        setFormData({ ...formData, mission_id: selectedOption?.value || '' })
                      }
                      placeholder={formData.project_id ? "اختر المهمة..." : "اختر المشروع أولاً"}
                      isClearable
                      isDisabled={isSubmitting || !formData.project_id}
                      className="w-full text-right"
                      classNamePrefix="react-select"
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          borderColor: '#d1d5db',
                          borderRadius: '0.375rem',
                          padding: '2px',
                          '&:hover': { borderColor: '#4A3B85' },
                        }),
                        menu: (provided) => ({ ...provided, textAlign: 'right' }),
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    تاريخ الفاتورة *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({...formData, invoice_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات (اختياري)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  إرفاق الفاتورة
                </label>
                
                <div className="flex gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setShowDocumentScanner(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                  >
                    <Crop className="h-4 w-4" />
                    مسح المستند
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
                  >
                    <Camera className="h-4 w-4" />
                    كاميرا عادية
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200"
                  >
                    <Upload className="h-4 w-4" />
                    رفع ملف
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {uploadPreview && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-2">معاينة الفاتورة:</p>
                    <div className="border rounded-lg p-2 max-w-xs">
                      <img 
                        src={uploadPreview} 
                        alt="معاينة الفاتورة" 
                        className="w-full h-auto rounded"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 ml-3"
                  disabled={isSubmitting}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 disabled:opacity-50"
                >
                  {isSubmitting ? 'جاري الحفظ...' : (editingPurchase ? 'تحديث' : 'إضافة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDocumentScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="w-full h-full max-w-4xl max-h-screen p-4">
            <DocumentScanner
              onScan={handleDocumentScan}
              onCancel={() => setShowDocumentScanner(false)}
            />
          </div>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">التقاط بالكاميرا العادية</h3>
            
            <div className="mb-4">
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                className="w-full rounded-lg"
                videoConstraints={{
                  facingMode: "environment"
                }}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCamera(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 ml-3"
              >
                إلغاء
              </button>
              <button
                onClick={capture}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                التقاط
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Purchases;