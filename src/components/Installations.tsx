import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Calendar, 
  DollarSign, 
  FileText, 
  BarChart3, 
  Package, 
  Building2, 
  ArrowLeft 
} from 'lucide-react';

interface Installation {
  id: number;
  name: string;
  quantity: number;
  price: number;
  date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  project_id?: number;
  project_name?: string;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  is_paid: string;
}

interface InstallationSummary {
  totalInstallations: number;
  totalAmount: number;
  averageAmount: number;
}

interface Project {
  id: number;
  name: string;
}

function Installations() {
  const navigate = useNavigate();
  const location = useLocation();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<InstallationSummary>({
    totalInstallations: 0,
    totalAmount: 0,
    averageAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstallation, setEditingInstallation] = useState<Installation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showProjectView, setShowProjectView] = useState(
    location.state?.showProjectView || false
  );

  const [formData, setFormData] = useState({
    name: '',
    quantity: '',
    price: '',
    date: '',
    notes: '',
    project_id: '',
    isPaid: 'no',
    paymentStatus: '',
    paidAmount: '',
    remainingAmount: ''
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

  const fetchInstallations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedProject) params.append('projectId', selectedProject);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/installations?${params}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch installations');
      }

      const result = await response.json();
      if (result.success) {
        const processedInstallations = result.data.map((installation: any) => ({
          ...installation,
          quantity: parseInt(installation.quantity) || 0,
          price: parseFloat(installation.price) || 0
        }));
        
        setInstallations(processedInstallations);
        setSummary(result.summary);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error fetching installations:', error);
      alert('خطأ في جلب التركيبات');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.quantity || !formData.price || !formData.date || !formData.project_id) {
      alert('جميع الحقول مطلوبة بما في ذلك المشروع');
      return;
    }

    // Validate payment information if paid
    if (formData.isPaid === 'yes') {
      if (!formData.paymentStatus) {
        alert('يجب تحديد نوع الدفع');
        return;
      }
      
      if (!formData.paidAmount || parseFloat(formData.paidAmount) <= 0) {
        alert('يجب إدخال المبلغ المدفوع');
        return;
      }
      
      const totalAmount = parseFloat(formData.quantity) * parseFloat(formData.price);
      const paidAmount = parseFloat(formData.paidAmount);
      
      if (paidAmount > totalAmount) {
        alert('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي المبلغ');
        return;
      }
    }
    
    try {
      const url = editingInstallation 
        ? `/api/installations/${editingInstallation.id}`
        : '/api/installations';
      
      const method = editingInstallation ? 'PUT' : 'POST';

      const response = await fetch(url, {
        
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: formData.name,
          quantity: parseInt(formData.quantity),
          price: parseFloat(formData.price),
          date: formData.date,
          notes: formData.notes,
          project_id: formData.project_id,
          is_paid: formData.isPaid === 'yes',
          payment_status: formData.isPaid === 'yes' ? formData.paymentStatus : 'unpaid',
          paid_amount: formData.isPaid === 'yes' ? parseFloat(formData.paidAmount) : 0,
          remaining_amount: formData.isPaid === 'yes' ? parseFloat(formData.remainingAmount) : 0
        })
        
      });
        console.log('Sending installation request to:', url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: formData.name,
      quantity: parseInt(formData.quantity),
      price: parseFloat(formData.price),
      date: formData.date,
      notes: formData.notes,
      project_id: formData.project_id,
      is_paid: formData.isPaid === 'yes',
      payment_status: formData.isPaid === 'yes' ? formData.paymentStatus : 'unpaid',
      paid_amount: formData.isPaid === 'yes' ? parseFloat(formData.paidAmount) : 0,
      remaining_amount: formData.isPaid === 'yes' ? parseFloat(formData.remainingAmount) : 0
    })
  });
      const result = await response.json();
      
      if (result.success) {
        alert(result.message);
        resetForm();
        fetchInstallations();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error saving installation:', error);
      alert('خطأ في حفظ التركيب');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التركيب؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/installations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const result = await response.json();
      
      if (result.success) {
        alert(result.message);
        fetchInstallations();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error deleting installation:', error);
      alert('خطأ في حذف التركيب');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      quantity: '',
      price: '',
      date: '',
      notes: '',
      project_id: '',
      isPaid: 'no',
      paymentStatus: '',
      paidAmount: '',
      remainingAmount: ''
    });
    setIsModalOpen(false);
    setEditingInstallation(null);
  };

  const handleEdit = (installation: Installation) => {
    setEditingInstallation(installation);
    setFormData({
      name: installation.name,
      quantity: installation.quantity.toString(),
      price: installation.price.toString(),
      date: installation.date,
      notes: installation.notes || '',
      project_id: installation.project_id?.toString() || '',
      isPaid: installation.is_paid ? 'yes' : 'no',
      paymentStatus: installation.payment_status || '',
      paidAmount: installation.paid_amount ? installation.paid_amount.toString() : '',
      remainingAmount: installation.remaining_amount ? installation.remaining_amount.toString() : ''
    });
    setIsModalOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedProject('');
    setStartDate('');
    setEndDate('');
  };

  const handleProjectClick = (projectId: number, projectName: string) => {
    navigate(`/dashboard/project-installations/${projectId}`, { 
      state: { 
        projectName, 
        fromProjectView: true
      } 
    });
  };

  // Get unique projects from installations for the project view
  const getProjectsWithInstallations = () => {
    const projectMap = new Map();
    
    installations.forEach(installation => {
      if (installation.project_id && installation.project_name) {
        if (!projectMap.has(installation.project_id)) {
          projectMap.set(installation.project_id, {
            id: installation.project_id,
            name: installation.project_name,
            totalAmount: 0,
            installationCount: 0
          });
        }
        const project = projectMap.get(installation.project_id);
        project.totalAmount += installation.quantity * installation.price;
        project.installationCount += 1;
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

  useEffect(() => {
    fetchProjects();
    fetchInstallations();
  }, [searchTerm, selectedProject, startDate, endDate]);

  if (showProjectView) {
    const projectsWithInstallations = getProjectsWithInstallations();
    
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
              <h1 className="text-2xl font-bold text-gray-900">التركيبات حسب المشروع</h1>
              <p className="text-gray-600 mt-1">عرض التركيبات مجمعة حسب المشاريع</p>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsWithInstallations.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id, project.name)}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
                <span className="text-sm text-gray-500">{project.installationCount} تركيب</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-2xl font-bold text-purple-600">{project.totalAmount.toFixed(2)} ر.س</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي التركيبات</p>
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
          <h1 className="text-2xl font-bold text-gray-900">التركيبات</h1>
          <p className="text-gray-600 mt-1">إدارة تركيبات المعدات والأجهزة</p>
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
            إضافة تركيب
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">إجمالي التركيبات</p>
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
              <p className="text-sm font-medium text-gray-600">عدد التركيبات</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalInstallations}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Package className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">متوسط التركيب</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="البحث في التركيبات..."
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

      {/* Installations Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A3B85] mx-auto"></div>
            <p className="mt-2 text-gray-500">جاري التحميل...</p>
          </div>
        ) : installations.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد تركيبات</h3>
            <p className="text-gray-500">لم يتم العثور على تركيبات تطابق المعايير المحددة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    اسم التركيب
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المشروع
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الكمية
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    السعر
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإجمالي
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    حالة الدفع
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
                {installations.map((installation) => (
                  <tr key={installation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{installation.name}</div>
                        {installation.notes && (
                          <div className="text-sm text-gray-500">{installation.notes}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {installation.project_name ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {installation.project_name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">غير مخصص</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {installation.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {installation.price.toFixed(2)} ر.س
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {(installation.quantity * installation.price).toFixed(2)} ر.س
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {installation.is_paid ? (
                        installation.payment_status === 'full' ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            مدفوع كاملاً
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              مدفوع جزئياً
                            </span>
                            <div className="text-xs text-gray-600">
                              مدفوع: {(parseFloat(installation.paid_amount ?? 0) || 0).toFixed(2)} ر.س
                            </div>
                            <div className="text-xs text-red-600">
                              متبقي: {(parseFloat(installation.remaining_amount ?? 0) || 0).toFixed(2)} ر.س
                            </div>
                          </div>
                        )
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          غير مدفوع
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(installation.date).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(installation)}
                          className="text-[#4A3B85] hover:text-[#5A4B95] ml-2"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(installation.id)}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingInstallation ? 'تعديل التركيب' : 'إضافة تركيب جديد'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  اسم التركيب *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المشروع *
                </label>
                <select
                  required
                  value={formData.project_id}
                  onChange={(e) => setFormData({...formData, project_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                >
                  <option value="">اختر المشروع</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الكمية *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  السعر (ر.س) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  التاريخ *
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                />
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

              {/* Payment Status Section */}
              <div className="border-t pt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      هل تم الدفع؟
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="isPaid"
                          value="yes"
                          checked={formData.isPaid === 'yes'}
                          onChange={(e) => setFormData({...formData, isPaid: e.target.value, paymentStatus: '', paidAmount: '', remainingAmount: ''})}
                          className="ml-2 text-[#4A3B85] focus:ring-[#4A3B85]"
                        />
                        نعم
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="isPaid"
                          value="no"
                          checked={formData.isPaid === 'no'}
                          onChange={(e) => setFormData({...formData, isPaid: e.target.value, paymentStatus: '', paidAmount: '', remainingAmount: ''})}
                          className="ml-2 text-[#4A3B85] focus:ring-[#4A3B85]"
                        />
                        لا
                      </label>
                    </div>
                  </div>

                  {/* Payment Type Selection */}
                  {formData.isPaid === 'yes' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        نوع الدفع
                      </label>
                      <select
                        value={formData.paymentStatus}
                        onChange={(e) => {
                          const status = e.target.value;
                          setFormData({...formData, paymentStatus: status, paidAmount: '', remainingAmount: ''});
                          
                          // Auto-calculate remaining amount for full payment
                          if (status === 'full' && formData.quantity && formData.price) {
                            const total = parseFloat(formData.quantity) * parseFloat(formData.price);
                            setFormData(prev => ({...prev, paidAmount: total.toString(), remainingAmount: '0'}));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                      >
                        <option value="">اختر نوع الدفع</option>
                        <option value="full">تم دفع المبلغ كامل</option>
                        <option value="partial">تم دفع جزء من المبلغ</option>
                      </select>
                    </div>
                  )}

                  {/* Payment Amount Input */}
                  {formData.isPaid === 'yes' && formData.paymentStatus && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {formData.paymentStatus === 'full' ? 'قيمة المبلغ المدفوع' : 'المبلغ المدفوع جزئياً'} (ر.س)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={formData.quantity && formData.price ? (parseFloat(formData.quantity) * parseFloat(formData.price)).toString() : undefined}
                        value={formData.paidAmount}
                        onChange={(e) => {
                          const paidAmount = parseFloat(e.target.value) || 0;
                          const totalAmount = (parseFloat(formData.quantity) || 0) * (parseFloat(formData.price) || 0);
                          const remaining = Math.max(0, totalAmount - paidAmount);
                          
                          setFormData({
                            ...formData, 
                            paidAmount: e.target.value,
                            remainingAmount: remaining.toString()
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A3B85] focus:border-transparent"
                        placeholder="أدخل المبلغ المدفوع"
                      />
                      
                      {/* Show remaining amount for partial payments */}
                      {formData.paymentStatus === 'partial' && formData.paidAmount && formData.quantity && formData.price && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            <strong>المبلغ المتبقي:</strong> {formData.remainingAmount} ر.س
                          </p>
                          <p className="text-xs text-yellow-600 mt-1">
                            يمكنك تعديل هذا التركيب لاحقاً لإضافة المبلغ المتبقي
                          </p>
                        </div>
                      )}
                      
                      {/* Show total for full payments */}
                      {formData.paymentStatus === 'full' && formData.quantity && formData.price && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-800">
                            <strong>إجمالي المبلغ:</strong> {(parseFloat(formData.quantity) * parseFloat(formData.price)).toFixed(2)} ر.س
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            سيتم إضافة هذا المبلغ إلى الإيرادات ورصيد الشركة
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 ml-3"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4A3B85] text-white rounded-lg hover:bg-[#5A4B95] transition-colors duration-200"
                >
                  {editingInstallation ? 'تحديث' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Installations;