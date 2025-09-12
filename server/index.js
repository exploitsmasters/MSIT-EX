@@ .. @@
app.get('/api/miscellaneous-expenses', authenticateToken, async (req, res) => {
  try {
    const { category, search, startDate, endDate, projectId } = req.query;

    // Query to fetch expenses list with filters
    let query = `
      SELECT 
        me.id, me.description, me.amount, me.category, me.date, 
        me.payment_method, me.notes, me.created_at, me.updated_at,
        me.project_id, p.name as project_name,
        me.original_file_name, me.file_path, me.file_type, me.file_url,
        me.from_invoice_breakdown
      FROM miscellaneous_expenses me
      LEFT JOIN projects p ON me.project_id = p.id
      WHERE me.user_id = ?`;
    
    const queryParams = [req.user.id];

    if (category) {
      query += ' AND me.category = ?';
      queryParams.push(category);
    }

    if (search) {
      query += ' AND (me.description LIKE ? OR me.notes LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ' AND me.date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND me.date <= ?';
      queryParams.push(endDate);
    }

    if (projectId) {
      query += ' AND me.project_id = ?';
      queryParams.push(projectId);
    }

    query += ' ORDER BY me.date DESC, me.created_at DESC';

    const [expenses] = await pool.execute(query, queryParams);

-    // Calculate summary: total count and sum of amount for all expenses
+    // Calculate summary: total count and sum of amount for all expenses (with proper DECIMAL casting)
     const [summaryTotal] = await pool.execute(
       `SELECT 
         COUNT(*) as totalExpenses,
-        COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0) as totalAmount,
-        COALESCE(AVG(CAST(amount AS DECIMAL(10,2))), 0) as averageAmount
+        COALESCE(SUM(CAST(amount AS DECIMAL(15,2))), 0.00) as totalAmount,
+        COALESCE(AVG(CAST(amount AS DECIMAL(15,2))), 0.00) as averageAmount
       FROM miscellaneous_expenses
-      WHERE user_id = ?`,
-      [req.user.id]
+      WHERE user_id = ? ${category ? 'AND category = ?' : ''} ${search ? 'AND (description LIKE ? OR notes LIKE ?)' : ''} ${startDate ? 'AND date >= ?' : ''} ${endDate ? 'AND date <= ?' : ''} ${projectId ? 'AND project_id = ?' : ''}`,
+      queryParams
     );

-    // Calculate balance impact: sum of non-invoice expenses
+    // Calculate balance impact: sum of non-invoice expenses (with proper DECIMAL casting)
     const [summaryBalanceImpact] = await pool.execute(
-      `SELECT COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0) as balanceImpactAmount
+      `SELECT COALESCE(SUM(CAST(amount AS DECIMAL(15,2))), 0.00) as balanceImpactAmount
        FROM miscellaneous_expenses
-       WHERE user_id = ? AND from_invoice_breakdown = 0`,
-      [req.user.id]
+       WHERE user_id = ? AND from_invoice_breakdown = 0 ${category ? 'AND category = ?' : ''} ${search ? 'AND (description LIKE ? OR notes LIKE ?)' : ''} ${startDate ? 'AND date >= ?' : ''} ${endDate ? 'AND date <= ?' : ''} ${projectId ? 'AND project_id = ?' : ''}`,
+      queryParams
     );

-    // Debug query to fetch raw amounts
-    const [rawAmounts] = await pool.execute(
-      `SELECT id, description, amount, CAST(amount AS DECIMAL(10,2)) as cast_amount
-       FROM miscellaneous_expenses
-       WHERE user_id = ?`,
-      [req.user.id]
-    );
-
     // Log debug info
     console.log('Miscellaneous Expenses Debug:', {
       userId: req.user.id,
-      queryParams,
+      filters: { category, search, startDate, endDate, projectId },
       totalExpenses: summaryTotal[0].totalExpenses,
-      totalAmount: parseFloat(summaryTotal[0].totalAmount || 0),
-      averageAmount: parseFloat(summaryTotal[0].averageAmount || 0),
-      balanceImpactAmount: parseFloat(summaryBalanceImpact[0].balanceImpactAmount || 0),
+      totalAmount: summaryTotal[0].totalAmount,
+      averageAmount: summaryTotal[0].averageAmount,
+      balanceImpactAmount: summaryBalanceImpact[0].balanceImpactAmount,
       expenseCount: expenses.length,
-      expenses: expenses.map(exp => ({
-        id: exp.id,
-        description: exp.description,
-        amount: exp.amount,
-        from_invoice_breakdown: exp.from_invoice_breakdown,
-        invoice_item_id: exp.invoice_item_id
-      })),
-      rawSummaryTotal: summaryTotal[0],
-      rawAmounts
+      rawSummaryTotal: summaryTotal[0]
     });

     res.set({
-  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
-  'Pragma': 'no-cache',
-  'Expires': '0',
-  'Surrogate-Control': 'no-store'
-     }); // Prevent caching
+      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
+      'Pragma': 'no-cache',
+      'Expires': '0',
+      'Surrogate-Control': 'no-store'
+    });
+    
     res.json({
       success: true,
       data: expenses,
       summary: {
-        totalExpenses: summaryTotal[0].totalExpenses || 0,
-        totalAmount: parseFloat(summaryTotal[0].totalAmount || 0),
-        averageAmount: parseFloat(summaryTotal[0].averageAmount || 0),
-        balanceImpactAmount: parseFloat(summaryBalanceImpact[0].balanceImpactAmount || 0)
+        totalExpenses: parseInt(summaryTotal[0].totalExpenses) || 0,
+        totalAmount: parseFloat(summaryTotal[0].totalAmount) || 0,
+        averageAmount: parseFloat(summaryTotal[0].averageAmount) || 0,
+        balanceImpactAmount: parseFloat(summaryBalanceImpact[0].balanceImpactAmount) || 0
       }
     });
   } catch (error) {
     console.error('Error fetching miscellaneous expenses:', error);
     res.status(500).json({
       success: false,
       error: 'خطأ في جلب المصروفات',
       details: error.message
     });
   }
 });