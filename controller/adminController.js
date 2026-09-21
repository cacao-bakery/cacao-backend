import mongoose from 'mongoose'

import Order from '../models/order.js'
import User from '../models/User.js'
import Product from '../models/Product.js'
import Category from '../models/categoryModel.js'
import InventoryHistory from '../models/InventoryHistory.js'
import AdminAuditLog from '../models/AdminAuditLog.js'

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5)

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
})

const getISTDate = (value = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)

const getISTStartOfDay = (date = new Date()) => {
  const [year, month, day] = getISTDate(date).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 18, 30, 0, 0))
}

const getDateRangeForSales = (range) => {
  const now = new Date()
  const todayStart = getISTStartOfDay(now)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const normalized = String(range || '7d').trim().toLowerCase()

  if (normalized === 'today') {
    return { start: todayStart, end: todayEnd, label: 'today' }
  }

  if (normalized === '7d' || normalized === '7days' || normalized === '7-day') {
    return {
      start: new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000),
      end: todayEnd,
      label: '7d',
    }
  }

  if (normalized === '30d' || normalized === '30days' || normalized === '30-day') {
    return {
      start: new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000),
      end: todayEnd,
      label: '30d',
    }
  }

  if (normalized === 'month' || normalized === 'this month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start: monthStart, end: monthEnd, label: 'month' }
  }

  if (normalized === 'previous month' || normalized === 'prev_month' || normalized === 'prev-month') {
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: previousMonthStart, end: previousMonthEnd, label: 'previous_month' }
  }

  return { start: new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000), end: todayEnd, label: '7d' }
}

const parsePageLimit = (pageQuery, limitQuery) => {
  const page = Number.isFinite(Number(pageQuery)) ? Number(pageQuery) : 1
  const limit = Number.isFinite(Number(limitQuery)) ? Number(limitQuery) : 20
  return {
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit)),
  }
}

const isValidDateString = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const createAuditLog = async ({ adminUser, action, resource, resourceId, oldValue, newValue }) => {
  if (!adminUser) return null

  return AdminAuditLog.create({
    adminUser,
    action,
    resource,
    resourceId: resourceId || '',
    oldValue,
    newValue,
  })
}

export const getAdminDashboard = async (req, res) => {
  try {
    const now = new Date()
    const todayStart = getISTStartOfDay(now)
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const [statsResult, overviewResult, recentOrders] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: todayStart, $lt: todayEnd },
          },
        },
        {
          $group: {
            _id: null,
            todaySales: {
              $sum: {
                $cond: [{ $ne: ['$orderStatus', 'cancelled'] }, '$total', 0],
              },
            },
            todayOrders: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        {
          $group: {
            _id: '$orderStatus',
            count: { $sum: 1 },
          },
        },
      ]),
      Order.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('items.product', 'name price image')
        .lean(),
    ])

    const orderOverview = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      out_for_delivery: 0,
      delivered: 0,
      cancelled: 0,
    }

    for (const entry of overviewResult) {
      if (orderOverview[entry._id] !== undefined) {
        orderOverview[entry._id] = entry.count
      }
    }

    const totalOrders = await Order.countDocuments({})
    const totalCustomers = await User.countDocuments({ role: 'customer' })
    const pendingPayments = await Order.countDocuments({ 'payment.status': 'pending' })
    const lowStockProducts = await Product.countDocuments({ stock: { $lte: LOW_STOCK_THRESHOLD } })

    const todayStats = statsResult[0] || { todaySales: 0, todayOrders: 0 }

    return res.status(200).json({
      success: true,
      stats: {
        todaySales: Number(todayStats.todaySales || 0),
        todayOrders: Number(todayStats.todayOrders || 0),
        totalOrders,
        totalCustomers,
        pendingPayments,
        lowStockProducts,
      },
      orderOverview,
      recentOrders,
    })
  } catch (error) {
    console.error('Admin dashboard error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
    })
  }
}

export const getAdminSalesAnalytics = async (req, res) => {
  try {
    const range = String(req.query.range || '7d').trim().toLowerCase()
    const { start, end, label } = getDateRangeForSales(range)

    const sales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          orderStatus: { $ne: 'cancelled' },
        },
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              timezone: 'Asia/Kolkata',
              date: '$createdAt',
            },
          },
          total: 1,
          orderStatus: 1,
        },
      },
      {
        $group: {
          _id: '$date',
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          sales: { $round: ['$revenue', 2] },
          orders: 1,
        },
      },
    ])

    const totalSales = sales.reduce((sum, entry) => sum + Number(entry.sales || 0), 0)

    return res.status(200).json({
      success: true,
      range: label,
      totalSales,
      data: sales,
      sales,
    })
  } catch (error) {
    console.error('Sales analytics error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales analytics',
    })
  }
}

export const getAdminOrders = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req.query.page, req.query.limit)
    const skip = (page - 1) * limit

    const search = String(req.query.search || '').trim()
    const status = String(req.query.status || '').trim()
    const paymentStatus = String(req.query.paymentStatus || '').trim()
    const paymentMethod = String(req.query.paymentMethod || '').trim()
    const dateFrom = req.query.dateFrom && isValidDateString(req.query.dateFrom) ? new Date(req.query.dateFrom) : null
    const dateTo = req.query.dateTo && isValidDateString(req.query.dateTo) ? new Date(req.query.dateTo) : null
    const sortField = String(req.query.sortBy || 'createdAt').trim()
    const sortOrder = String(req.query.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1

    const filter = {}

    if (status) filter.orderStatus = status
    if (paymentStatus) filter['payment.status'] = paymentStatus
    if (paymentMethod) filter['payment.method'] = paymentMethod
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = dateFrom
      if (dateTo) {
        const endOfDay = new Date(dateTo)
        endOfDay.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = endOfDay
      }
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
      ]
    }

    const sortOptions = { [sortField]: sortOrder }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('items.product', 'name price image')
        .lean(),
      Order.countDocuments(filter),
    ])

    return res.status(200).json({
      success: true,
      orders,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin get orders error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    })
  }
}

export const getAdminOrderByNumber = async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate('items.product', 'name price image category')
      .populate('customer.user', 'name email role')
      .lean()

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    const enrichedOrder = {
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber,
      customer: order.customer,
      customerPhone: order.customer?.phone || '',
      customerEmail: order.customer?.email || '',
      deliveryMethod: order.delivery?.method || 'delivery',
      deliveryAddress: order.delivery?.address || '',
      preferredDate: order.delivery?.preferredDate || '',
      preferredTime: order.delivery?.preferredTime || '',
      notes: order.notes || '',
      items: order.items || [],
      subtotal: order.subtotal,
      deliveryCharge: order.deliveryCharge,
      total: order.total,
      paymentMethod: order.payment?.method || '',
      transactionId: order.payment?.transactionId || '',
      paymentStatus: order.payment?.status || 'pending',
      orderStatus: order.orderStatus,
      statusHistory: order.statusHistory || [],
      paymentHistory: order.paymentHistory || [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }

    return res.status(200).json({ success: true, order: enrichedOrder })
  } catch (error) {
    console.error('Admin order detail error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch order details' })
  }
}

export const updateAdminOrderStatus = async (req, res) => {
  try {
    const { status } = req.body
    const allowedStatuses = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled']
    const newStatus = String(status || '').trim().toLowerCase()

    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status', allowedStatuses })
    }

    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    const previousStatus = order.orderStatus
    if (previousStatus !== newStatus) {
      order.statusHistory = order.statusHistory || []
      order.statusHistory.push({
        from: previousStatus,
        to: newStatus,
        changedBy: req.user._id,
        changedAt: new Date(),
      })
      order.orderStatus = newStatus
      await order.save()

      await createAuditLog({
        adminUser: req.user._id,
        action: 'order status change',
        resource: 'Order',
        resourceId: order._id.toString(),
        oldValue: { orderStatus: previousStatus },
        newValue: { orderStatus: newStatus },
      })
    }

    return res.status(200).json({
      success: true,
      message: previousStatus === newStatus ? 'Order status unchanged' : 'Order status updated successfully',
      order: {
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        statusHistory: order.statusHistory,
      },
    })
  } catch (error) {
    console.error('Admin update order status error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update order status' })
  }
}

export const updateAdminPaymentStatus = async (req, res) => {
  try {
    const { status } = req.body
    const allowedStatuses = ['pending', 'submitted', 'verified', 'failed']
    const newStatus = String(status || '').trim().toLowerCase()

    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status', allowedStatuses })
    }

    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    const previousStatus = order.payment?.status || 'pending'

    if (previousStatus !== newStatus) {
      order.payment = {
        ...order.payment,
        status: newStatus,
      }

      order.paymentHistory = order.paymentHistory || []
      order.paymentHistory.push({
        from: previousStatus,
        to: newStatus,
        changedAt: new Date(),
        changedBy: req.user._id,
      })

      await order.save()

      await createAuditLog({
        adminUser: req.user._id,
        action: 'payment verification',
        resource: 'OrderPayment',
        resourceId: order._id.toString(),
        oldValue: { paymentStatus: previousStatus },
        newValue: { paymentStatus: newStatus },
      })
    }

    return res.status(200).json({
      success: true,
      message: previousStatus === newStatus ? 'Payment status unchanged' : 'Payment status updated successfully',
      order: {
        orderNumber: order.orderNumber,
        payment: order.payment,
      },
    })
  } catch (error) {
    console.error('Admin update payment status error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update payment status' })
  }
}

export const getAdminPayments = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req.query.page, req.query.limit)
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim()
    const status = String(req.query.status || '').trim()
    const paymentMethod = String(req.query.paymentMethod || '').trim()
    const dateFrom = req.query.dateFrom && isValidDateString(req.query.dateFrom) ? new Date(req.query.dateFrom) : null
    const dateTo = req.query.dateTo && isValidDateString(req.query.dateTo) ? new Date(req.query.dateTo) : null

    const filter = {}
    if (status) filter['payment.status'] = status
    if (paymentMethod) filter['payment.method'] = paymentMethod
    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = dateFrom
      if (dateTo) {
        const endOfDay = new Date(dateTo)
        endOfDay.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = endOfDay
      }
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'payment.transactionId': { $regex: search, $options: 'i' } },
      ]
    }

    const [payments, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('orderNumber invoiceNumber customer payment createdAt total orderStatus')
        .lean(),
      Order.countDocuments(filter),
    ])

    return res.status(200).json({
      success: true,
      payments,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin fetch payments error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch payments' })
  }
}

export const getAdminProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim()

    const filter = {}
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ])

    return res.status(200).json({
      success: true,
      products,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin product fetch error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch products' })
  }
}

export const getAdminProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug')
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }
    return res.status(200).json({ success: true, product })
  } catch (error) {
    console.error('Admin get product detail error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch product' })
  }
}

export const createAdminProduct = async (req, res) => {
  try {
    const { name, slug, description, price, category, dropNumber, image, ingredients, stock, isAvailable } = req.body

    if (!name || !description || price === undefined || !category || dropNumber === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required product fields' })
    }

    if (Number(price) < 0) {
      return res.status(400).json({ success: false, message: 'Price must be greater than or equal to 0' })
    }

    if (Number(stock || 0) < 0) {
      return res.status(400).json({ success: false, message: 'Stock must be greater than or equal to 0' })
    }

    if (!mongoose.Types.ObjectId.isValid(String(category))) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' })
    }

    const generatedSlug = slug || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    const productExists = await Product.findOne({ slug: generatedSlug })
    if (productExists) {
      return res.status(409).json({ success: false, message: 'A product with this slug already exists' })
    }

    const product = await Product.create({
      name,
      slug: generatedSlug,
      description,
      price,
      category,
      dropNumber,
      image: image || '',
      ingredients: ingredients || [],
      stock: stock ?? 0,
      isAvailable: isAvailable ?? true,
    })

    await createAuditLog({
      adminUser: req.user._id,
      action: 'product create',
      resource: 'Product',
      resourceId: product._id.toString(),
      oldValue: null,
      newValue: { name: product.name, price: product.price, stock: product.stock },
    })

    return res.status(201).json({ success: true, message: 'Product created successfully', product })
  } catch (error) {
    console.error('Admin create product error:', error)
    return res.status(500).json({ success: false, message: 'Failed to create product' })
  }
}

export const updateAdminProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' })
    }

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const previousProduct = { ...product.toObject() }

    const { name, slug, description, price, category, dropNumber, image, ingredients, stock, isAvailable } = req.body

    if (price !== undefined && Number(price) < 0) {
      return res.status(400).json({ success: false, message: 'Price must be greater than or equal to 0' })
    }

    if (stock !== undefined && Number(stock) < 0) {
      return res.status(400).json({ success: false, message: 'Stock must be greater than or equal to 0' })
    }

    if (category && !mongoose.Types.ObjectId.isValid(String(category))) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' })
    }

    if (slug && slug !== product.slug) {
      const existing = await Product.findOne({ slug, _id: { $ne: product._id } })
      if (existing) {
        return res.status(409).json({ success: false, message: 'Another product with this slug already exists' })
      }
    }

    product.name = name ?? product.name
    product.slug = slug ?? product.slug
    product.description = description ?? product.description
    product.price = price ?? product.price
    product.category = category ?? product.category
    product.dropNumber = dropNumber ?? product.dropNumber
    product.image = image ?? product.image
    product.ingredients = ingredients ?? product.ingredients
    product.stock = stock ?? product.stock
    product.isAvailable = isAvailable ?? product.isAvailable

    const updatedProduct = await product.save()

    await createAuditLog({
      adminUser: req.user._id,
      action: 'product update',
      resource: 'Product',
      resourceId: updatedProduct._id.toString(),
      oldValue: previousProduct,
      newValue: updatedProduct.toObject(),
    })

    return res.status(200).json({ success: true, message: 'Product updated successfully', product: updatedProduct })
  } catch (error) {
    console.error('Admin update product error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update product' })
  }
}

export const deleteAdminProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' })
    }

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const referenced = await Order.exists({ 'items.product': product._id })
    if (referenced) {
      return res.status(409).json({
        success: false,
        message: 'This product is referenced by existing orders and cannot be deleted permanently. Archive or disable it instead.',
      })
    }

    await product.deleteOne()

    await createAuditLog({
      adminUser: req.user._id,
      action: 'product delete',
      resource: 'Product',
      resourceId: product._id.toString(),
      oldValue: product.toObject(),
      newValue: null,
    })

    return res.status(200).json({ success: true, message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Admin delete product error:', error)
    return res.status(500).json({ success: false, message: 'Failed to delete product' })
  }
}

export const updateProductAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isAvailable must be a boolean value' })
    }

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const previousValue = product.isAvailable
    product.isAvailable = isAvailable
    await product.save()

    await createAuditLog({
      adminUser: req.user._id,
      action: 'product availability change',
      resource: 'Product',
      resourceId: product._id.toString(),
      oldValue: { isAvailable: previousValue },
      newValue: { isAvailable },
    })

    return res.status(200).json({ success: true, message: 'Product availability updated', product })
  } catch (error) {
    console.error('Update product availability error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update product availability' })
  }
}

export const getAdminInventory = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req.query.page, req.query.limit)
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const lowStockOnly = String(req.query.lowStock || '').trim().toLowerCase() === 'true'
    const availability = String(req.query.isAvailable || '').trim().toLowerCase()
    const sortBy = String(req.query.sortBy || 'stock').trim()
    const sortOrder = String(req.query.sortOrder || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1

    const filter = {}
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }
    if (category) filter.category = category
    if (lowStockOnly) filter.stock = { $lte: LOW_STOCK_THRESHOLD }
    if (availability === 'true' || availability === 'false') filter.isAvailable = availability === 'true'

    const sortMap = {
      stock: { stock: sortOrder },
      price: { price: sortOrder },
      name: { name: sortOrder },
      createdAt: { createdAt: sortOrder },
    }

    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name')
        .sort(sortMap[sortBy] || { stock: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ])

    const payload = items.map((product) => ({
      productId: product._id,
      product: product.name,
      category: product.category?.name || null,
      stock: Number(product.stock || 0),
      isAvailable: product.isAvailable,
      price: product.price,
      image: product.image || '',
      lowStock: Number(product.stock || 0) <= LOW_STOCK_THRESHOLD,
    }))

    return res.status(200).json({
      success: true,
      inventory: payload,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin inventory error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch inventory' })
  }
}

export const updateInventoryStock = async (req, res) => {
  try {
    const { productId } = req.params
    const { stock, reason = 'manual_adjustment', note = '' } = req.body

    if (!Number.isInteger(Number(stock))) {
      return res.status(400).json({ success: false, message: 'A valid integer stock value is required' })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const previousStock = Number(product.stock || 0)
    const newStock = Number(stock)

    if (newStock < 0) {
      return res.status(400).json({ success: false, message: 'Stock cannot be negative' })
    }

    const validReasons = ['restock', 'correction', 'damaged', 'expired', 'manual_adjustment']
    if (!validReasons.includes(String(reason || '').trim())) {
      return res.status(400).json({ success: false, message: 'Invalid stock reason', validReasons })
    }

    product.stock = newStock
    product.isAvailable = product.isAvailable || newStock > 0
    await product.save()

    await InventoryHistory.create({
      product: product._id,
      stockChange: newStock - previousStock,
      previousStock,
      newStock,
      reason: String(reason).trim(),
      changedBy: req.user._id,
      note,
    })

    await createAuditLog({
      adminUser: req.user._id,
      action: 'stock adjustment',
      resource: 'Product',
      resourceId: product._id.toString(),
      oldValue: { stock: previousStock },
      newValue: { stock: newStock },
    })

    return res.status(200).json({ success: true, message: 'Inventory updated', product })
  } catch (error) {
    console.error('Admin inventory update error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update inventory' })
  }
}

export const getLowStockInventory = async (req, res) => {
  try {
    const lowStockProducts = await Product.find({ stock: { $lte: LOW_STOCK_THRESHOLD } })
      .populate('category', 'name')
      .sort({ stock: 1 })
      .lean()

    return res.status(200).json({
      success: true,
      threshold: LOW_STOCK_THRESHOLD,
      products: lowStockProducts,
    })
  } catch (error) {
    console.error('Admin low stock fetch error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch low stock products' })
  }
}

export const getAdminCustomers = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim()

    const userFilter = { role: 'customer' }
    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]
    }

    const [customers, total] = await Promise.all([
      User.find(userFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(userFilter),
    ])

    const enrichedCustomers = await Promise.all(
      customers.map(async (customer) => {
        const metrics = await Order.aggregate([
          { $match: { 'customer.user': customer._id } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              completedOrders: {
                $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] },
              },
              cancelledOrders: {
                $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] },
              },
              totalSpending: { $sum: '$total' },
            },
          },
        ])

        const details = metrics[0] || {
          totalOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          totalSpending: 0,
        }

        return {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          createdAt: customer.createdAt,
          totalOrders: details.totalOrders,
          completedOrders: details.completedOrders,
          cancelledOrders: details.cancelledOrders,
          totalSpending: Number(details.totalSpending || 0),
        }
      }),
    )

    return res.status(200).json({
      success: true,
      customers: enrichedCustomers,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin customer list error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch customers' })
  }
}

export const getAdminCustomerById = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).lean()
    if (!customer || customer.role !== 'customer') {
      return res.status(404).json({ success: false, message: 'Customer not found' })
    }

    const orderMetrics = await Order.aggregate([
      { $match: { 'customer.user': customer._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] },
          },
          totalSpending: { $sum: '$total' },
        },
      },
    ])

    const recentOrders = await Order.find({ 'customer.user': customer._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()

    return res.status(200).json({
      success: true,
      customer: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        createdAt: customer.createdAt,
        totalOrders: orderMetrics[0]?.totalOrders || 0,
        completedOrders: orderMetrics[0]?.completedOrders || 0,
        cancelledOrders: orderMetrics[0]?.cancelledOrders || 0,
        totalSpending: Number(orderMetrics[0]?.totalSpending || 0),
        recentOrders,
      },
    })
  } catch (error) {
    console.error('Admin customer detail error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch customer details' })
  }
}

export const getAdminInvoices = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim()
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null

    const filter = {}
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
      ]
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = dateFrom
      if (dateTo) {
        const endOfDay = new Date(dateTo)
        endOfDay.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = endOfDay
      }
    }

    const [invoices, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('invoiceNumber orderNumber customer total payment status createdAt')
        .lean(),
      Order.countDocuments(filter),
    ])

    return res.status(200).json({
      success: true,
      invoices,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin invoice list error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch invoices' })
  }
}

export const getAdminInvoiceByNumber = async (req, res) => {
  try {
    const invoice = await Order.findOne({ invoiceNumber: req.params.invoiceNumber }).lean()
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' })
    }
    return res.status(200).json({ success: true, invoice })
  } catch (error) {
    console.error('Admin invoice detail error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch invoice' })
  }
}

export const getAdminDeliveries = async (req, res) => {
  try {
    const { status, preferredDate, method } = req.query

    const filter = {}
    if (status) filter.orderStatus = status
    if (preferredDate) filter['delivery.preferredDate'] = preferredDate
    if (method) filter['delivery.method'] = method

    const deliveries = await Order.find(filter)
      .select('orderNumber customer delivery orderStatus createdAt')
      .sort({ createdAt: -1 })
      .lean()

    const payload = deliveries.map((order) => ({
      orderNumber: order.orderNumber,
      customer: order.customer?.name || '',
      phone: order.customer?.phone || '',
      address: order.delivery?.address || '',
      city: order.delivery?.city || '',
      pincode: order.delivery?.pincode || '',
      preferredDate: order.delivery?.preferredDate || '',
      preferredTime: order.delivery?.preferredTime || '',
      orderStatus: order.orderStatus,
    }))

    return res.status(200).json({ success: true, deliveries: payload })
  } catch (error) {
    console.error('Admin deliveries error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch deliveries' })
  }
}

export const getAdminReportsSales = async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(new Date().setDate(new Date().getDate() - 30))
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date()

    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: dateFrom, $lte: dateTo }, orderStatus: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] },
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'pending'] }, 1, 0] },
          },
        },
      },
    ])

    return res.status(200).json({
      success: true,
      report: result[0] || {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        cancelledOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
      },
    })
  } catch (error) {
    console.error('Admin sales report error:', error)
    return res.status(500).json({ success: false, message: 'Failed to generate sales report' })
  }
}

export const getAdminReportsOrders = async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(new Date().setDate(new Date().getDate() - 30))
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date()

    const report = await Order.aggregate([
      { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
        },
      },
    ])

    return res.status(200).json({ success: true, report })
  } catch (error) {
    console.error('Admin orders report error:', error)
    return res.status(500).json({ success: false, message: 'Failed to generate order report' })
  }
}

export const getAdminReportsProducts = async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(new Date().setDate(new Date().getDate() - 30))
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date()

    const report = await Order.aggregate([
      { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          soldUnits: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { soldUnits: -1, revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          productName: '$product.name',
          soldUnits: 1,
          revenue: 1,
        },
      },
    ])

    return res.status(200).json({ success: true, report })
  } catch (error) {
    console.error('Admin products report error:', error)
    return res.status(500).json({ success: false, message: 'Failed to generate products report' })
  }
}

export const getAdminReportsCustomers = async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(new Date().setDate(new Date().getDate() - 30))
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date()

    const report = await Order.aggregate([
      { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
      {
        $group: {
          _id: '$customer.email',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          customerName: { $first: '$customer.name' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ])

    return res.status(200).json({ success: true, report })
  } catch (error) {
    console.error('Admin customers report error:', error)
    return res.status(500).json({ success: false, message: 'Failed to generate customer report' })
  }
}

export const getAdminNotifications = async (req, res) => {
  try {
    const [pendingPayments, lowStock, todayOrders] = await Promise.all([
      Order.find({ 'payment.status': 'pending' }).sort({ createdAt: -1 }).limit(5).lean(),
      Product.find({ stock: { $lte: LOW_STOCK_THRESHOLD } }).sort({ stock: 1 }).limit(5).lean(),
      Order.find({
        createdAt: {
          $gte: getISTStartOfDay(new Date()),
          $lt: new Date(getISTStartOfDay(new Date()).getTime() + 24 * 60 * 60 * 1000),
        },
      }).sort({ createdAt: -1 }).limit(5).lean(),
    ])

    const notifications = [
      ...pendingPayments.map((order) => ({
        type: 'pending_payment',
        message: `Pending payment for order ${order.orderNumber}`,
        createdAt: order.createdAt,
      })),
      ...lowStock.map((product) => ({
        type: 'low_stock',
        message: `${product.name} is low on stock (${product.stock})`,
        createdAt: product.updatedAt,
      })),
      ...todayOrders.map((order) => ({
        type: 'new_order',
        message: `New order ${order.orderNumber} received`,
        createdAt: order.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return res.status(200).json({ success: true, notifications })
  } catch (error) {
    console.error('Admin notifications error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' })
  }
}

export const getAdminAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
    const skip = (page - 1) * limit

    const [logs, total] = await Promise.all([
      AdminAuditLog.find({})
        .populate('adminUser', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminAuditLog.countDocuments({}),
    ])

    return res.status(200).json({
      success: true,
      logs,
      pagination: buildPagination(page, limit, total),
    })
  } catch (error) {
    console.error('Admin audit logs error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs' })
  }
}

export const getAdminCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ createdAt: -1 }).lean()
    return res.status(200).json({ success: true, categories })
  } catch (error) {
    console.error('Admin categories error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch categories' })
  }
}

export const createAdminCategory = async (req, res) => {
  try {
    const { name, slug, description, image, isActive } = req.body
    const category = await Category.create({ name, slug, description, image, isActive })
    await createAuditLog({
      adminUser: req.user._id,
      action: 'category create',
      resource: 'Category',
      resourceId: category._id.toString(),
      oldValue: null,
      newValue: { name: category.name },
    })
    return res.status(201).json({ success: true, message: 'Category created successfully', category })
  } catch (error) {
    console.error('Admin category create error:', error)
    return res.status(500).json({ success: false, message: 'Failed to create category' })
  }
}

export const updateAdminCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' })
    }
    const oldValue = { ...category.toObject() }
    Object.assign(category, req.body)
    await category.save()
    await createAuditLog({
      adminUser: req.user._id,
      action: 'category update',
      resource: 'Category',
      resourceId: category._id.toString(),
      oldValue,
      newValue: category.toObject(),
    })
    return res.status(200).json({ success: true, message: 'Category updated successfully', category })
  } catch (error) {
    console.error('Admin category update error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update category' })
  }
}

export const deleteAdminCategory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' })
    }

    const category = await Category.findById(req.params.id)
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' })
    }

    const productsUsingCategory = await Product.exists({ category: category._id })
    if (productsUsingCategory) {
      return res.status(409).json({
        success: false,
        message: 'This category is in use by one or more products and cannot be deleted.',
      })
    }

    await category.deleteOne()
    await createAuditLog({
      adminUser: req.user._id,
      action: 'category delete',
      resource: 'Category',
      resourceId: category._id.toString(),
      oldValue: category.toObject(),
      newValue: null,
    })
    return res.status(200).json({ success: true, message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Admin category delete error:', error)
    return res.status(500).json({ success: false, message: 'Failed to delete category' })
  }
}
