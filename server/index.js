@@ .. @@
 app.get('/api/purchases', authenticateToken, async (req, res) => {
   try {
     const { page = 1, limit = 10, search = '', projectId, startDate, endDate } = req.query;
     const offset = (Number(page) - 1) * Number(limit);

     let query = `
       SELECT
         p.id,
         p.invoice_number,
         p.total_amount,
         p.vat_amount,
         p.notes,
         p.created_at,
         p.updated_at,
         s.name as supplier_name,
         pr.name as project_name,
         pr.id as project_id,
         pm.id as mission_id,
         pm.name as mission_name,
         u.file_name as original_file_name,
         u.file_path,
         u.file_type,
         COALESCE(p.breakdown_total_before_vat, 0) as breakdown_total_before_vat,
         COALESCE(p.breakdown_total_vat, 0) as breakdown_total_vat,
         COALESCE(p.breakdown_total_with_vat, 0) as breakdown_total_with_vat
       FROM purchase_invoices p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN projects pr ON p.project_id = pr.id
       LEFT JOIN project_missions pm ON p.mission_id = pm.id
       LEFT JOIN purchase_invoice_uploads u ON p.id = u.purchase_invoice_id
       WHERE p.created_by = ?
     `;
     
     const queryParams = [req.user.id];

     // Add filters
     if (search) {
       query += ' AND (p.invoice_number LIKE ? OR s.name LIKE ? OR pr.name LIKE ? OR pm.name LIKE ?)';
       queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
     }

     if (projectId) {
       query += ' AND p.project_id = ?';
       queryParams.push(projectId);
     }

     if (startDate) {
       query += ' AND DATE(p.created_at) >= ?';
       queryParams.push(startDate);
     }

     if (endDate) {
       query += ' AND DATE(p.created_at) <= ?';
       queryParams.push(endDate);
     }

     query += ' ORDER BY p.created_at DESC';

     if (limit !== 'all') {
       query += ' LIMIT ? OFFSET ?';
       queryParams.push(Number(limit), offset);
     }

     const [purchases] = await pool.execute(query, queryParams);

     // Process file paths and ensure mission_name is included
     const processedPurchases = purchases.map(purchase => {
       if (purchase.file_path) {
         const actualFileName = path.basename(purchase.file_path);
         purchase.file_url = `/Uploads/${actualFileName}`;
       }
       purchase.mission_name = purchase.mission_name || null;
       return {
         ...purchase,
         total_amount: parseFloat(purchase.total_amount) || 0,
         vat_amount: parseFloat(purchase.vat_amount) || 0,
         breakdown_total_before_vat: parseFloat(purchase.breakdown_total_before_vat) || 0,
         breakdown_total_vat: parseFloat(purchase.breakdown_total_vat) || 0,
         breakdown_total_with_vat: parseFloat(purchase.breakdown_total_with_vat) || 0
       };
     });

     // Get total count for pagination
     let countQuery = `
       SELECT COUNT(DISTINCT p.id) as total
       FROM purchase_invoices p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN projects pr ON p.project_id = pr.id
       LEFT JOIN project_missions pm ON p.mission_id = pm.id
       WHERE p.created_by = ?
     `;
     
     const countParams = [req.user.id];
     
     if (search) {
       countQuery += ' AND (p.invoice_number LIKE ? OR s.name LIKE ? OR pr.name LIKE ? OR pm.name LIKE ?)';
       countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
     }

     if (projectId) {
       countQuery += ' AND p.project_id = ?';
       countParams.push(projectId);
     }

     if (startDate) {
       countQuery += ' AND DATE(p.created_at) >= ?';
       countParams.push(startDate);
     }

     if (endDate) {
       countQuery += ' AND DATE(p.created_at) <= ?';
       countParams.push(endDate);
     }

     const [countResult] = await pool.execute(countQuery, countParams);
     const total = countResult[0].total;
-    const pages = limit === 'all' ? 1 : Math.ceil(total / Number(limit));
+    const pages = limit === 'all' ? 1 : Math.ceil(total / Number(limit));

+    // Add cache control headers to prevent stale data
+    res.set({
+      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
+      'Pragma': 'no-cache',
+      'Expires': '0',
+      'Surrogate-Control': 'no-store'
+    });

     res.json({
       success: true,
       purchases: processedPurchases,
       pagination: { 
         total, 
         pages, 
         currentPage: Number(page), 
         limit: limit === 'all' ? total : Number(limit)
       }
     });
   } catch (error) {
     console.error('Error fetching purchases:', error);
     res.status(500).json({ 
       success: false, 
       error: 'فشل في جلب بيانات المشتريات' 
     });
   }
 });