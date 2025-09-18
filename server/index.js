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
    const pages = limit === 'all' ? 1 : Math.ceil(total / Number(limit));

    // Add cache control headers to prevent stale data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

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

// Use routes
app.use('/api', convertQuotationRoutes);

// Health check endpoint
     // Create quotation endpoint
app.post('/api/quotations', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      expiryDate,
      totalAmount,
      vatAmount,
      grossAmount,
      profitAmount,
      notes,
      terms,
      customerName,
      interestRate,
      discountRate,
      discount_on_total_percent,
      discount_on_total_amount,
      projectId,
      items,
    } = req.body;

    // Validate required fields
    if (!companyId || !issueDate || !totalAmount || !vatAmount || !items || !items.length) {
      throw new Error('Missing required fields');
    }

    // Format dates
    const formattedIssueDate = new Date(issueDate).toISOString().split('T')[0];
    const formattedExpiryDate = expiryDate ? new Date(expiryDate).toISOString().split('T')[0] : null;

    // Generate quotation number
    const date = new Date(issueDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;
    const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM quotations`);
    const sequenceNumber = countResult[0].count + 1;
    const quotationNumber = `QUO-${formattedDate}-${sequenceNumber}`;

    // Insert quotation
    const [result] = await connection.execute(
      `INSERT INTO quotations (
        quotation_number, company_id, issue_date, expiry_date, 
        total_amount, vat_amount, gross_amount, notes, terms, created_by, 
        customer_name, interest_rate, discount_rate, 
        discount_on_total_percent, discount_on_total_amount, project_id, profit_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotationNumber,
        companyId,
        formattedIssueDate,
        formattedExpiryDate,
        Number(totalAmount.toFixed(3)),
        Number(vatAmount.toFixed(3)),
        Number(grossAmount.toFixed(3)),
        notes || null,
        terms,
        req.user.id,
        customerName || null,
        interestRate || 0,
        discountRate || 0,
        discount_on_total_percent || 0,
        discount_on_total_amount || 0,
        projectId || null,
        Number(profitAmount) || 0,
      ]
    );

    const quotationId = result.insertId;

    // Insert quotation items
    for (const item of items) {
      await connection.execute(
        `INSERT INTO quotation_items (
          quotation_id, code, description, quantity, unit_price, base_unit_price,
          vat_rate, vat_amount, total_vat_amount, price_after_tax,
          total_amount, discount_rate, interest_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.code || '',
          item.description,
          item.quantity,
          Number(item.unitPrice.toFixed(2)),
          Number(item.baseUnitPrice.toFixed(2)),
          item.vatRate,
          item.vatAmount,
          item.totalVatAmount,
          item.priceAfterTax,
          item.totalAmount,
          item.discountRate || 0,
          item.interestRate || 0,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: 'تم إنشاء عرض السعر بنجاح',
      quotationId,
      quotationNumber,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quotation:', error, error.stack);
    res.status(500).json({ error: 'فشل في إنشاء عرض السعر', details: error.message });
  } finally {
    connection.release();
  }
});


// Get quotations endpoint
app.get('/api/quotations', authenticateToken, async (req, res) => {
  try {
    const { search, type, status, customer, startDate, endDate, dueOnly } = req.query;
    let query = `
      SELECT 
        q.id,
        q.quotation_number as number,
        q.issue_date as issueDate,
        q.expiry_date as expiryDate,
        q.total_amount as total,
        q.vat_amount as vatAmount,
        q.notes,
        q.created_at as createdAt,
        q.customer_name as customerName,
        c.vat_number as customerVatNumber,
        p.name as projectName,
        q.profit_amount
      FROM quotations q
      LEFT JOIN companies c ON q.company_id = c.id
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.created_by = ?
    `;
    const queryParams = [req.user.id];

    if (search) {
      query += ` AND (q.quotation_number LIKE ? OR q.customer_name LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (type && type !== 'all') {
      query += ` AND q.type = ?`;
      queryParams.push(type);
    }

    if (status && status !== 'all') {
      query += ` AND q.status = ?`;
      queryParams.push(status);
    }

    if (customer && customer !== 'all') {
      query += ` AND q.company_id = ?`;
      queryParams.push(customer);
    }

    if (startDate) {
      query += ` AND q.issue_date >= ?`;
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ` AND q.issue_date <= ?`;
      queryParams.push(endDate);
    }

    if (dueOnly === 'true') {
      query += ` AND q.expiry_date <= CURRENT_DATE`;
    }

    const [rows] = await pool.execute(query, queryParams);
    res.json({ quotations: rows });
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: 'فشل في جلب بيانات عروض الأسعار' });
  }
});


// Get single quotation with details
app.get('/api/quotations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch quotation details
    const [quotation] = await pool.execute(
      `SELECT
        q.id,
        q.quotation_number as number,
        q.company_id,
        q.issue_date as issueDate,
        q.expiry_date as expiryDate,
        q.total_amount as totalAmount,
        q.vat_amount as vatAmount,
        q.notes as notes,
        q.terms,
        q.interest_rate,
        q.discount_rate,
        q.discount_on_total_percent,
        q.discount_on_total_amount,
        q.profit_amount,
        q.project_id,
        p.name as projectName,
        q.created_at as createdAt,
        q.customer_name as customerName,
        c.vat_number as customerVatNumber,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email
      FROM quotations q
      LEFT JOIN companies c ON q.company_id = c.id
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.id = ? AND q.created_by = ?`,
      [id, req.user.id]
    );

    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود' });
    }

    // Fetch quotation items
    const [items] = await pool.execute(
      `SELECT
        description,
        code,
        quantity,
        unit_price,
        base_unit_price,
        vat_rate,
        vat_amount,
        total_vat_amount,
        total_amount,
        price_after_tax,
        price_before_tax,
        discount_rate,
        interest_rate
      FROM quotation_items
      WHERE quotation_id = ?`,
      [id]
    );

    // Format the response
    const formattedQuotation = {
      ...quotation[0],
      company_name: {
        id: quotation[0].company_id,
        name: quotation[0].customerName,
        vat_number: quotation[0].customerVatNumber,
        address: quotation[0].company_address,
        city: quotation[0].company_city,
        postal_code: quotation[0].company_postal_code,
        phone: quotation[0].company_phone,
        email: quotation[0].company_email,
      },
      projectName: quotation[0].projectName,
      items: items,
    };

    res.json(formattedQuotation);
  } catch (error) {
    console.error('Error fetching quotation details:', error);
    res.status(500).json({ error: 'فشل في جلب تفاصيل عرض السعر', details: error.message });
  }
});

// Update a quotation (partial update)
app.patch('/api/quotations/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    console.log('Received PATCH request for quotation ID:', id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      customer_name,
      customer_type,
      email,
      phone,
      issue_date,
      expiry_date,
      discount_rate,
      interest_rate,
      discount_on_total_percent,
      discount_on_total_amount,
      items,
      terms,
      notes,
      status,
      company_id,
      project_id,
    } = req.body;

    // Validate required fields
    if (!customer_name || !issue_date || !expiry_date || !items || items.length === 0) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة' });
    }

    console.log('Items received:', JSON.stringify(items, null, 2));

    // Validate discount_rate and interest_rate
    if (discount_rate !== undefined && (discount_rate < 0 || discount_rate > 100)) {
      return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 100' });
    }
    if (interest_rate !== undefined && interest_rate < 0) {
      return res.status(400).json({ error: 'نسبة الفائدة يجب أن تكون غير سالبة' });
    }
    if (discount_on_total_percent !== undefined && (discount_on_total_percent < 0 || discount_on_total_percent > 100)) {
      return res.status(400).json({ error: 'نسبة الخصم على الإجمالي يجب أن تكون بين 0 و 100' });
    }

    // Validate status if provided
    const validStatuses = ['draft', 'issued', 'certified', 'paid', 'cancelled'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة' });
    }

    // Validate item fields
    for (const item of items) {
      if (!item.description || (item.quantity || 0) <= 0) {
        return res.status(400).json({ error: 'بيانات العناصر غير صالحة: وصف أو كمية مفقودة' });
      }
      
      const basePrice = Number(item.base_unit_price || 0);
      const unitPrice = Number(item.unit_price || 0);
      const vatRate = Number(item.vat_rate || 15);
      
      if (basePrice < 0 || unitPrice < 0 || vatRate < 0) {
        return res.status(400).json({ error: 'بيانات العناصر غير صالحة: أسعار سالبة' });
      }
    }

    // Check if quotation exists and belongs to the user
    const [quotation] = await connection.execute(
      'SELECT id, company_id FROM quotations WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );
    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود أو لا تملك صلاحية التعديل' });
    }

    const existingCompanyId = quotation[0].company_id;

    // Update company details if provided
    if (company_id || customer_name || email || phone) {
      const companyUpdates = {};
      if (customer_name) companyUpdates.name = customer_name;
      if (email !== undefined) companyUpdates.email = email;
      if (phone !== undefined) companyUpdates.phone = phone;

      if (Object.keys(companyUpdates).length > 0) {
        const targetCompanyId = company_id || existingCompanyId;
        if (targetCompanyId) {
          const updateCompanyQuery = `
            UPDATE companies
            SET ${Object.keys(companyUpdates).map((key) => `${key} = ?`).join(', ')}
            WHERE id = ?
          `;
          const updateCompanyValues = [...Object.values(companyUpdates), targetCompanyId];
          await connection.execute(updateCompanyQuery, updateCompanyValues);
        }
      }
    }

    // Calculate item totals - ALWAYS recalculate from base prices to avoid compound discount effects
    let totalVatAmount = 0;
    let originalSubtotal = 0; // Track the original subtotal before global discount
    
    const processedItems = items.map((item, index) => {
      console.log(`Processing item ${index}:`, JSON.stringify(item, null, 2));
      
      const basePrice = Number(item.base_unit_price || 0);
      const interestRate = Number(item.interest_rate || 0);
      const discountRate = Number(item.discount_rate || 0);
      const vatRate = Number(item.vat_rate || 15);
      const quantity = Number(item.quantity || 1);

      console.log('Extracted values:', { 
        description: item.description,
        basePrice, 
        interestRate, 
        discountRate, 
        vatRate, 
        quantity 
      });

      // If basePrice is 0 but unit_price exists, use unit_price as basePrice
      const effectiveBasePrice = basePrice || Number(item.unit_price || 0);
      console.log('Effective base price:', effectiveBasePrice);

      // Step 1: Apply interest rate to base price (unit_price calculation)
      const adjustedUnitPrice = effectiveBasePrice * (1 + interestRate / 100);
      
      // Step 2: Apply discount rate to get price before tax per unit
      const unitPriceAfterDiscount = adjustedUnitPrice * (1 - discountRate / 100);
      
      // Step 3: Calculate VAT per unit
      const vatAmountPerUnit = unitPriceAfterDiscount * (vatRate / 100);
      
      // Step 4: Calculate totals for this item BEFORE any global discount
      const itemSubtotal = unitPriceAfterDiscount * quantity; // Total before VAT and before global discount
      const itemTotalVatAmount = vatAmountPerUnit * quantity; // Total VAT for all units

      // Add to running totals (these represent the original amounts before global discount)
      originalSubtotal += itemSubtotal;
      totalVatAmount += itemTotalVatAmount;

      const processedItem = {
        description: item.description,
        code: item.code || '',
        quantity: quantity,
        unit_price: Number(adjustedUnitPrice.toFixed(2)),           // Price after interest
        base_unit_price: effectiveBasePrice,                       // Use effective base price
        vat_rate: vatRate,                                          // VAT percentage
        vat_amount: Number(vatAmountPerUnit.toFixed(2)),           // VAT per unit
        total_vat_amount: Number(itemTotalVatAmount.toFixed(3)),   // Total VAT for quantity
        price_after_tax: Number(itemSubtotal.toFixed(3)),          // Item subtotal before global discount
        price_before_tax: Number(unitPriceAfterDiscount.toFixed(2)), // Unit price after discount
        total_amount: Number(itemSubtotal.toFixed(2)),             // Item subtotal before global discount
        discount_rate: discountRate,
        interest_rate: interestRate,
      };

      console.log('Calculated item:', processedItem);
      return processedItem;
    });

    // NOW apply global discount to the original subtotal
    const discountOnTotalPercent = Number(discount_on_total_percent || 0);
    const discountOnTotalAmount = originalSubtotal * (discountOnTotalPercent / 100);
    const finalSubtotal = originalSubtotal - discountOnTotalAmount;

    // Calculate profit amount
    const profitAmount = processedItems.reduce((sum, item) => {
      return sum + ((item.unit_price - item.base_unit_price) * item.quantity);
    }, 0);

    console.log('Final calculations:', {
      originalSubtotal: originalSubtotal.toFixed(2),
      discountOnTotalPercent: discountOnTotalPercent.toFixed(2),
      discountOnTotalAmount: discountOnTotalAmount.toFixed(2),
      finalSubtotal: finalSubtotal.toFixed(2),
      totalVatAmount: totalVatAmount.toFixed(2),
      profitAmount: profitAmount.toFixed(2)
    });

    // Update quotation details
    const quotationUpdates = {
      customer_name,
      issue_date,
      expiry_date,
      discount_rate: discount_rate || 0,
      interest_rate: interest_rate || 0,
      discount_on_total_percent: discountOnTotalPercent,
      discount_on_total_amount: Number(discountOnTotalAmount.toFixed(3)),
      total_amount: Number(finalSubtotal.toFixed(4)),
      vat_amount: Number(totalVatAmount.toFixed(4)),
      profit_amount: Number(profitAmount.toFixed(2)),
      terms: terms || null,
      notes: notes || null,
      status: status || 'draft',
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      company_id: company_id || existingCompanyId,
      project_id: project_id || null,
    };

    const updateQuotationQuery = `
      UPDATE quotations
      SET ${Object.keys(quotationUpdates).map((key) => `${key} = ?`).join(', ')}
      WHERE id = ?
    `;
    const updateQuotationValues = [...Object.values(quotationUpdates), id];
    await connection.execute(updateQuotationQuery, updateQuotationValues);

    // Delete existing items
    await connection.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

    // Insert updated items with correct field mapping
    if (processedItems.length > 0) {
      const itemQuery = `
        INSERT INTO quotation_items (
          quotation_id,
          description,
          code,
          quantity,
          unit_price,
          base_unit_price,
          vat_rate,
          vat_amount,
          total_vat_amount,
          total_amount,
          price_after_tax,
          price_before_tax,
          discount_rate,
          interest_rate
        ) VALUES ${processedItems.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      `;
      
      const itemValues = processedItems.flatMap((item) => [
        id,                              // quotation_id
        item.description,                // description
        item.code,                       // code
        item.quantity,                   // quantity
        item.unit_price,                 // unit_price (after interest)
        item.base_unit_price,           // base_unit_price (original)
        item.vat_rate,                  // vat_rate (percentage)
        item.vat_amount,                // vat_amount (per unit)
        item.total_vat_amount,          // total_vat_amount (for quantity)
        item.total_amount,              // total_amount (subtotal)
        item.price_after_tax,           // price_after_tax (subtotal)
        item.price_before_tax,          // price_before_tax (unit after discount)
        item.discount_rate,             // discount_rate
        item.interest_rate,             // interest_rate
      ]);
      
      console.log('Inserting items with values:', itemValues);
      await connection.execute(itemQuery, itemValues);
    }

    await connection.commit();
    res.json({ message: 'تم تحديث عرض السعر بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating quotation:', error);
    res.status(500).json({ error: 'فشل في تحديث عرض السعر', details: error.message });
  } finally {
    connection.release();
  }
});

// Get quotation for proforma invoice (if you need a separate endpoint)
app.get('/api/quotations/:id/proforma', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch quotation details with additional proforma-specific fields
    const [quotation] = await pool.execute(
      `SELECT
        q.id,
        q.quotation_number as number,
        q.company_id,
        q.issue_date as issueDate,
        q.expiry_date as expiryDate,
        q.total_amount as totalAmount,
        q.vat_amount as vatAmount,
        q.notes as notes,
        q.terms,
        q.interest_rate,
        q.discount_rate,
        q.discount_on_total_percent,
        q.discount_on_total_amount,
        q.project_id,
        p.name as projectName,
        q.created_at as createdAt,
        q.customer_name as customerName,
        c.vat_number as customerVatNumber,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email,
        'FOB Destination' as deliveryTerms,
        'Net 30' as paymentTerms,
        '2 Weeks' as validity,
        'Tabuk' as deliveryLocation,
        '1 Week' as deliveryPeriod,
        'Manufacturer Standard' as warranty,
        0 as deliveryCharges
      FROM quotations q
      LEFT JOIN companies c ON q.company_id = c.id
      LEFT JOIN projects p ON q.project_id = p.id
      WHERE q.id = ? AND q.created_by = ?`,
      [id, req.user.id]
    );

    if (quotation.length === 0) {
      return res.status(404).json({ error: 'عرض السعر غير موجود' });
    }

    // Fetch quotation items with delivery price field
    const [items] = await pool.execute(
      `SELECT
        description,
        code,
        quantity,
        unit_price,
        base_unit_price,
        vat_rate,
        vat_amount,
        total_amount,
        price_after_tax,
        discount_rate,
        interest_rate,
        0 as delivery_price
      FROM quotation_items
      WHERE quotation_id = ?`,
      [id]
    );

    // Format the response for proforma invoice
    const formattedQuotation = {
      ...quotation[0],
      company: {
        id: quotation[0].company_id,
        name: quotation[0].customerName,
        vat_number: quotation[0].customerVatNumber,
        address: quotation[0].company_address,
        city: quotation[0].company_city,
        postal_code: quotation[0].company_postal_code,
        phone: quotation[0].company_phone,
        email: quotation[0].company_email,
      },
      items: items,
      status: 'proforma'
    };

    res.json(formattedQuotation);
  } catch (error) {
    console.error('Error fetching quotation for proforma invoice:', error);
    res.status(500).json({ error: 'فشل في جلب تفاصيل عرض السعر للفاتورة الأولية', details: error.message });
  }
});


     // Create invoice endpoint
app.post('/api/invoices', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes,
      terms,
      projectName,
      invoiceTypeCode,
      invoiceTypeName,
      discount_rate,
      interest_rate,
      items,
    } = req.body;

    console.log('Invoice request body:', JSON.stringify(req.body, null, 2));

    const invoiceNumber = `INV-${Date.now()}`;
    const uuid = uuidv4();
    const params = [
      invoiceNumber,
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes || null,
      terms || null,
      projectName || null,
      req.user.id,
      uuid,
      invoiceTypeCode || '388',
      invoiceTypeName || '0100000',
      discount_rate ?? null,
      interest_rate ?? null,
    ];
    console.log('Invoice query params:', params);

    const [result] = await connection.execute(
      `INSERT INTO invoices (
        invoice_number, company_id, issue_date, supply_date, due_date, 
        total_amount, vat_amount, status, notes, terms, project_name, 
        created_by, uuid, invoice_type_code, invoice_type_name, discount_rate, interest_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    const invoiceId = result.insertId;

    for (const item of items) {
    const itemParams = [
      invoiceId,
      item.description,
      item.code || null,
      item.quantity,
      item.base_unit_price ?? item.unit_price, // Added
      item.unit_price,
      item.vat_rate,
      item.vat_amount,
      item.total_amount,
      item.discount_rate ?? null,
      item.interest_rate ?? null,
      item.total_vat_amount ?? item.vat_amount, // Added
      item.price_after_tax ?? (item.unit_price + item.vat_amount), // Added
    ];
    console.log('Invoice item params:', itemParams);
    await connection.execute(
      `INSERT INTO invoice_items (
        invoice_id, description, code, quantity, base_unit_price, unit_price,
        vat_rate, vat_amount, total_amount, discount_rate, interest_rate,
        total_vat_amount, price_after_tax
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      itemParams
    );
  }

    await connection.commit();
    res.status(201).json({
      message: 'تم إنشاء الفاتورة بنجاح',
      invoiceId,
      invoiceNumber,
      uuid,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'فشل في إنشاء الفاتورة' });
  } finally {
    connection.release();
  }
});

// Get all invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    console.log('User ID:', req.user.id);
    const [invoices] = await pool.execute(
      `SELECT 
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.invoice_type_code,
        i.invoice_type_name,
        i.created_at,
        i.updated_at,
        c.name as customer_name,
        c.vat_number as customer_vat_number
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.created_by = ?
      ORDER BY i.issue_date DESC`, // Changed to issue_date
      [req.user.id]
    );

    console.log('Fetched invoices:', invoices);
    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching invoices:', {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
    });
    res.status(500).json({ error: 'فشل في جلب الفواتير' });
  }
});

     // Get single invoice with details
app.get('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    console.log('Fetching invoice ID:', req.params.id);
    console.log('User ID:', req.user.id);
    await connection.beginTransaction();

    const [invoices] = await connection.execute(
      `SELECT
        i.id,
        i.invoice_number,
        DATE_FORMAT(i.issue_date, '%Y-%m-%d') as issue_date,
        DATE_FORMAT(i.supply_date, '%Y-%m-%d') as supply_date,
        DATE_FORMAT(i.due_date, '%Y-%m-%d') as due_date,
        i.total_amount,
        i.vat_amount,
        i.status,
        i.notes,
        i.terms,
        i.project_name,
        i.company_id,
        i.created_at,
        i.qr_code,
        i.zatca_invoice_hash,
        c.name as company_name,
        c.vat_number as company_vat_number,
        c.address as company_address,
        c.city as company_city,
        c.postal_code as company_postal_code,
        c.phone as company_phone,
        c.email as company_email,
        c.type as company_type
      FROM invoices i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND i.created_by = ?`,
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      console.log('No invoice found for ID:', req.params.id);
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    const invoice = invoices[0];
    const [items] = await connection.execute(
      `SELECT 
        description,
        quantity,
        base_unit_price,
        unit_price,
        vat_rate,
        vat_amount,
        total_amount,
        code,
        discount_rate,
        interest_rate,
        total_vat_amount,
        price_after_tax
      FROM invoice_items
      WHERE invoice_id = ?`,
      [invoice.id]
    );

    const response = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      supply_date: invoice.supply_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount,
      vat_amount: invoice.vat_amount,
      status: invoice.status,
      notes: invoice.notes,
      terms: invoice.terms,
      project_name: invoice.project_name,
      company_id: invoice.company_id,
      created_at: invoice.created_at,
      qr_code: invoice.qr_code,
      zatca_invoice_hash: invoice.zatca_invoice_hash,
      company: {
        name: invoice.company_name,
        vat_number: invoice.company_vat_number,
        address: invoice.company_address,
        city: invoice.company_city,
        postal_code: invoice.company_postal_code,
        phone: invoice.company_phone,
        email: invoice.company_email,
        type: invoice.company_type,
      },
      items: items,
    };

    await connection.commit();
    console.log('Response sent:', response);
    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Error fetching invoice details:', {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
    });
    res.status(500).json({ error: 'فشل في جلب تفاصيل الفاتورة' });
  } finally {
    connection.release();
  }
});

// Update full invoice
app.patch('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes,
      terms,
      projectName,
      invoiceTypeCode,
      invoiceTypeName,
      discount_rate,
      interest_rate,
      items,
    } = req.body;

    console.log('Update invoice request body:', JSON.stringify(req.body, null, 2));

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    // Update invoice
    const params = [
      companyId,
      issueDate,
      supplyDate,
      dueDate,
      totalAmount,
      vatAmount,
      status,
      notes || null,
      terms || null,
      projectName || null,
      invoiceTypeCode || '388',
      invoiceTypeName || '0100000',
      discount_rate ?? null,
      interest_rate ?? null,
      req.params.id,
    ];
    console.log('Update invoice query params:', params);

    await connection.execute(
      `UPDATE invoices SET
        company_id = ?, issue_date = ?, supply_date = ?, due_date = ?, 
        total_amount = ?, vat_amount = ?, status = ?, 
        notes = ?, terms = ?, project_name = ?,
        invoice_type_code = ?, invoice_type_name = ?,
        discount_rate = ?, interest_rate = ?
      WHERE id = ?`,
      params
    );

    // Delete existing items
    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [
      req.params.id,
    ]);

    // Insert updated items
    for (const item of items) {
      const itemParams = [
        req.params.id,
        item.description,
        item.code || null,
        item.quantity,
        item.unit_price,
        item.vat_rate,
        item.vat_amount,
        item.total_amount,
        item.discount_rate ?? null,
        item.interest_rate ?? null,
      ];
      console.log('Update invoice item params:', itemParams);
      await connection.execute(
        `INSERT INTO invoice_items (
          invoice_id, description, code, quantity, unit_price,
          vat_rate, vat_amount, total_amount, discount_rate, interest_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemParams
      );
    }

    await connection.commit();
    res.json({ message: 'تم تعديل الفاتورة بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'فشل في تعديل الفاتورة' });
  } finally {
    connection.release();
  }
});

// Update invoice status
app.patch('/api/invoices/:id/status', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { status } = req.body;

    if (
      !['draft', 'issued', 'paid', 'cancelled', 'certified'].includes(status)
    ) {
      return res.status(400).json({ error: 'حالة الفاتورة غير صالحة' });
    }

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    await connection.execute('UPDATE invoices SET status = ? WHERE id = ?', [
      status,
      req.params.id,
    ]);

    res.json({ message: 'تم تحديث حالة الفاتورة بنجاح' });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'فشل في تحديث حالة الفاتورة' });
  } finally {
    connection.release();
  }
});

// Delete invoice
app.delete('/api/invoices/:id', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if invoice exists and belongs to user
    const [invoices] = await connection.execute(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [req.params.id, req.user.id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    }

    // Delete invoice items first
    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [
      req.params.id,
    ]);

    // Delete invoice
    await connection.execute('DELETE FROM invoices WHERE id = ?', [
      req.params.id,
    ]);

    await connection.commit();
    res.json({ message: 'تم حذف الفاتورة بنجاح' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'فشل في حذف الفاتورة' });
  } finally {
    connection.release();
  }
});

// Update invoice payment status
app.patch('/api/invoices/:id/payment-status', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { payment_status, paid_amount } = req.body;

    // Validate invoice belongs to user
    const [invoiceCheck] = await connection.execute(
      'SELECT id, total_amount, payment_status as current_payment_status, paid_amount as current_paid_amount FROM invoices WHERE id = ? AND created_by = ?',
      [id, req.user.id]
    );

    if (invoiceCheck.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'الفاتورة غير موجودة' 
      });
    }

    const invoice = invoiceCheck[0];
    const totalAmount = parseFloat(invoice.total_amount);
    const currentPaidAmount = parseFloat(invoice.current_paid_amount) || 0;
    const newPaidAmount = parseFloat(paid_amount) || 0;

    // Calculate balance change
    const balanceChange = newPaidAmount - currentPaidAmount;

    // Update invoice
    await connection.execute(
      'UPDATE invoices SET payment_status = ?, paid_amount = ? WHERE id = ?',
      [payment_status, newPaidAmount, id]
    );

    // Update company balance if there's a change
    if (balanceChange !== 0) {
      await connection.execute(
        `UPDATE company_settings 
         SET current_balance = current_balance + ?
         WHERE user_id = ?`,
        [balanceChange, req.user.id]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'تم تحديث حالة الدفع بنجاح'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice payment status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في تحديث حالة الدفع',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});