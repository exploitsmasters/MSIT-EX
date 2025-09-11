import React, { useState, useEffect } from 'react';
import { useRef, useCallback } from 'react';
import { Plus, Search, Edit, Trash2, Calendar, DollarSign, FileText, Filter, Download, BarChart3, Building2, ArrowLeft, Camera, Upload, Eye, Crop } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { DocumentScanner } from '../components/DocumentScanner';
import { toast, ToastContainer } from 'react-toastify';

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  payment_method: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  project_id?: number;
  project_name?: string;
  original_file_name?: string;
  file_path?: string;
  file_type?: string;
  file_url?: string;
}

interface ExpenseSummary {
  totalExpenses: number;
  totalAmount: number;
  averageAmount: number;
  balanceImpactAmount: number;
}

interface Project {
  id: number;
  name: string;
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onConfirm, onCancel, message }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-900 mb-4">تأكيد الحذف</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
};

function MiscellaneousExpenses() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>({
    totalExpenses: 0,
    totalAmount: 0,
    averageAmount: 0,
    balanceImpactAmount: 0
  });
  const [categories, setCategories] = useState<string[]>([
    'مكتبية', 'صيانة', 'معدات', 'إيجار معدات', 'أدوات صيانه', 'مواصلات', 'اتصالات', 'كهرباء', 'مأكولات', 'أجور عمال', 'أخرى'
  ]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showProjectView, setShowProjectView] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  
  // File upload states
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [showDocumentScanner, setShowDocumentScanner] = useState(false);
  const [scannedDocument, setScannedDocument] = useState<string | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    date: '',
    payment_method: '',
    notes: '',
    project_id: ''
  });

  const paymentMethods = ['نقدي', 'تحويل بنكي', 'بطاقة ائتمان', 'شيك'];

  // API functions
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

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found');
        toast.error('غير مصرح لك');
        return;
      }

      const response = await fetch('/api/projects', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 403 || response.status === 401) {
        console.error('Authentication failed');
        toast.error('غير مصرح لك');
        return;
      }

      if (!response.ok) {
        console.error('Failed to fetch projects: HTTP', response.status);
        alert('فشل في جلب المشاريع');
        return;
      }

      const data = await response.json();
      console.log('Projects API response:', data);
      
      if (data.projects && Array.isArray(data.projects)) {
        setProjects(data.projects);
        console.log('Projects loaded:', data.projects.length);
      } else {
        console.error('Invalid projects response format:', data);
        alert('تنسيق استجابة المشاريع غير صالح');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      alert('خطأ في جلب المشاريع');
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchTerm) params.append('search', searchTerm);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedProject) params.append('projectId', selectedProject);

      const response = await fetch(`/api/miscellaneous-expenses?${params}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch expenses');
      }

      const result = await response.json();
      if (result.success) {
        const processedExpenses = result.data.map((expense: any) => ({
          ...expense,
          amount: parseFloat(expense.amount) || 0
        }));
        
        setExpenses(processedExpenses);
        setSummary(result.summary);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      alert('خطأ في جلب المصروفات');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/miscellaneous-expenses/categories', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setCategories(result.data);
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      alert('خطأ في جلب الفئات');
    }
  };

  // File upload handlers (copied from Purchases.tsx)
  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setShowCamera(false);
      
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `expense-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
        const file = new File([blob], `scanned-expense-${Date.now()}.jpg`, { type: 'image/jpeg' });
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

  const handleFilePreview = (expense: Expense) => {
    if (expense.file_url) {
      window.open(expense.file_url, '_blank');
    } else if (expense.file_path) {
      const filename = expense.file_path.split('/').pop() || expense.file_path.split('\\').pop();
      window.open(`/uploads/${filename}`, '_blank');
    } else {
      alert('لا يوجد ملف مرفق');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.amount || !formData.category || !formData.date || !formData.payment_method || !formData.project_id) {
      alert('جميع الحقول مطلوبة بما في ذلك المشروع');
      return;
    }
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('description', formData.description);
      formDataToSend.append('amount', formData.amount);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('date', formData.date);
      formDataToSend.append('payment_method', formData.payment_method);
      formDataToSend.append('notes', formData.notes || '');
      formDataToSend.append('project_id', formData.project_id);
      
      if (selectedFile) {
        formDataToSend.append('file', selectedFile);
      }

      const url = editingExpense 
        ? `/api/miscellaneous-expenses/${editingExpense.id}`
        : '/api/miscellaneous-expenses';
      
      const method = editingExpense ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeadersMultipart(),
        body: formDataToSend
      });

      const result = await response.json();
      
      if (result.success) {
        alert(result.message);
        resetForm();
        fetchExpenses();
        fetchCategories();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('خطأ في حفظ المصروف');
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteExpenseId(id);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) {
      alert('يرجى تحديد مصروف واحد على الأقل لحذفه');
      return;
    }

    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (isBulkDelete) {
      try {
        const deletePromises = selectedRows.map(id =>
          fetch(`/api/miscellaneous-expenses/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          }).then(response => {
            if (!response.ok) {
              return response.json().then(data => {
                throw new Error(data.error || 'فشل في حذف المصروف');
              });
            }
            return id;
          })
        );

        const deletedIds = await Promise.all(deletePromises);
        setExpenses(expenses.filter(expense => !deletedIds.includes(expense.id)));
        setSelectedRows([]);
        alert('تم حذف المصروفات المحددة بنجاح');
      } catch (error) {
        console.error('Error deleting expenses:', error);
        alert('خطأ في حذف المصروفات');
      }
    } else if (deleteExpenseId !== null) {
      try {
        const response = await fetch(`/api/miscellaneous-expenses/${deleteExpenseId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });

        const result = await response.json();
        
        if (result.success) {
          alert(result.message);
          setExpenses(expenses.filter(expense => expense.id !== deleteExpenseId));
          setSelectedRows(selectedRows.filter(rowId => rowId !== deleteExpenseId));
        } else {
          alert(result.error);
        }
      } catch (error) {
        console.error('Error deleting expense:', error);
        alert('خطأ في حذف المصروف');
      }
    }
    setShowDeleteModal(false);
    setDeleteExpenseId(null);
    setIsBulkDelete(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setDeleteExpenseId(null);
    setIsBulkDelete(false);
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      category: '',
      date: '',
      payment_method: '',
      notes: '',
      project_id: ''
    });
    setSelectedFile(null);
    setUploadPreview(null);
    setCapturedImage(null);
    setScannedDocument(null);
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      date: expense.date,
      payment_method: expense.payment_method,
      notes: expense.notes || '',
      project_id: expense.project_id?.toString() || ''
    });
    
    // Reset file states when editing
    setSelectedFile(null);
    setUploadPreview(null);
    setCapturedImage(null);
    setScannedDocument(null);
    
    setIsModalOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedProject('');
    setStartDate('');
    setEndDate('');
    setSelectedRows([]);
  };

  const handleProjectClick = (projectId: number, projectName: string) => {
    navigate(`/dashboard/project-expenses/${projectId}`, { 
      state: { projectName } 
    });
  };

  const handleRowSelect = (id: number) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedRows(
      selectedRows.length === expenses.length ? [] : expenses.map(expense => expense.id)
    );
  };

  const getProjectsWithExpenses = () => {
    const projectMap = new Map();
    
    expenses.forEach(expense => {
      if (expense.project_id && expense.project_name) {
        if (!projectMap.has(expense.project_id)) {
          projectMap.set(expense.project_id, {
            id: expense.project_id,
            name: expense.project_name,
            totalAmount: 0,
            expenseCount: 0
          });
        }
        const project = projectMap.get(expense.project_id);
        project.totalAmount += parseFloat(expense.amount.toString());
        project.expenseCount += 1;
      }
    });

    return Array.from(projectMap.values());
  };

  useEffect(() => {
    console.log('Component mounted, fetching data...');
    fetchProjects();
    fetchExpenses();
    fetchCategories();
  }, [selectedCategory, searchTerm, startDate, endDate, selectedProject]);

  if (showProjectView) {
    const projectsWithExpenses = getProjectsWithExpenses();
    
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
              <h1 className="text-2xl font-bold text-gray-900">المصروفات حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض المصروفات مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithExpenses.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id, project.name)}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <span className="text-sm text-gray-500">{project.expenseCount} مصروف</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-2xl font-bold text-blue-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي المصروفات</p>
            </div>
          ))}
          {expenses.some(expense => !expense.project_id) && (
            <div
              onClick={() => navigate('/dashboard/unassigned-expenses')}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gray-100 rounded-full">
                  <FileText className="h-6 w-6 text-gray-600" />
                </div>
                <span className="text-sm text-gray-500">
                  {expenses.filter(e => !e.project_id).length} مصروف
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">مصروفات غير مخصصة</h3>
              <p className="text-2xl font-bold text-gray-600">
                {expenses
                  .filter(e => !e.project_id)
                  .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0)
                  .toFixed(2)} ر.س
              </p>
              <p className="text-sm text-gray-500 mt-1">مصروفات بدون مشروع</p>
            </div>
          )}
        </div>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={true}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المصروفات المتفرقة</h1>
          <p className="text-gray-600 mt-1">إدارة المصروفات العامة والمتنوعة</p>
        </div>
        <div className="flex gap-3">
          {selectedRows.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
            >
              <Trash2 className="h-4 w-4" />
              حذف المصروفات المحددة
            </button>
          )}
          <button
            onClick={() => setShowProjectView(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2"
          >
            <Building2 className="h-4 w-4" />
            عرض حسب المشروع
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#4A3B85] text-white px-4 py-2 rounded-lg hover:bg-[#5A4B95] transition-colors duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة مصروف
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي المصروفات</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalAmount.toFixed(2)} ر.س</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <DollarSign className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">المصروفات المؤثرة على الرصيد</p>
              <p className="text-2xl font-bold text-gray-900">{summary.balanceImpactAmount.toFixed(2)} ر.س</p>
              <p className="text-xs text-gray-500 mt-1">مصروفات مباشرة فقط</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <DollarSign className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">عدد المصروفات</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalExpenses}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="البحث في المصروفات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
          >
            <option value="">جميع الفئات</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
          >
            <option value="">جميع المشاريع</option>
            <option value="unassigned">غير مخصص لمشروع</option>
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
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد مصروفات</h3>
            <p className="text-gray-500">لم يتم العثور على مصروفات تطابق المعايير المحددة</p>
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
                      checked={selectedRows.length === expenses.length && expenses.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الوصف
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المبلغ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الفئة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المشروع
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    التاريخ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    طريقة الدفع
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-[#4A3B85] rounded border-gray-300 focus:ring-[#4A3B85]"
                        checked={selectedRows.includes(expense.id)}
                        onChange={() => handleRowSelect(expense.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{expense.description}</div>
                        {expense.original_file_name && (
                          <div className="text-xs text-green-600 flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            مرفق
                          </div>
                        )}
                        {expense.from_invoice_breakdown && (
                          <div className="text-xs text-blue-600 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            من تفريغ فاتورة
                          </div>
                        )}
                        {expense.notes && (
                          <div className="text-sm text-gray-500">{expense.notes}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {parseFloat(expense.amount.toString()).toFixed(2)} ر.س
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {expense.project_name ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {expense.project_name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">غير مخصص</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(expense.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {expense.payment_method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {(expense.file_url || expense.file_path) && (
                          <button
                            onClick={() => handleFilePreview(expense)}
                            className="text-green-600 hover:text-green-900 ml-2"
                            title="عرض المرفق"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(expense)}
                          className="text-[#4A3B85] hover:text-[#5A4B95] ml-2"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">

          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-wrap -mx-2">
              {/* الوصف */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">الوصف *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              {/* المبلغ */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              {/* الفئة */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">الفئة *</label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                >
                  <option value="">اختر الفئة</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* المشروع */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">المشروع *</label>
                <select
                  required
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                >
                  <option value="">اختر المشروع</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>

              {/* التاريخ */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ *</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              {/* طريقة الدفع */}
              <div className="w-full md:w-1/2 px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع *</label>
                <select
                  required
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                >
                  <option value="">اختر طريقة الدفع</option>
                  {paymentMethods.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>

              {/* ملاحظات */}
              <div className="w-full px-2 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

                            {/* File Upload Section */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  إرفاق مستند (اختياري)
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
                    <p className="text-sm text-gray-600 mb-2">معاينة المرفق:</p>
                    <div className="border rounded-lg p-2 max-w-xs">
                      <img 
                        src={uploadPreview} 
                        alt="معاينة المرفق" 
                        className="w-full h-auto rounded"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="w-full flex justify-end space-x-3 px-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200"
                >
                  {editingExpense ? 'تحديث' : 'إضافة'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Document Scanner Modal */}
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

      {/* Camera Modal */}
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

      <ConfirmationModal
        isOpen={showDeleteModal}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        message={isBulkDelete ? "هل أنت متأكد من حذف المصروفات المحددة؟" : "هل أنت متأكد من حذف هذا المصروف؟"}
      />
    </div>
  );
}

export default MiscellaneousExpenses;