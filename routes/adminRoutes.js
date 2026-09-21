import express from 'express'

import { protect, requireAdminOrManager } from '../middleware/authMiddleware.js'
import {
  getAdminDashboard,
  getAdminSalesAnalytics,
  getAdminOrders,
  getAdminOrderByNumber,
  updateAdminOrderStatus,
  updateAdminPaymentStatus,
  getAdminPayments,
  getAdminProducts,
  getAdminProductById,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  updateProductAvailability,
  getAdminInventory,
  updateInventoryStock,
  getLowStockInventory,
  getAdminCustomers,
  getAdminCustomerById,
  getAdminInvoices,
  getAdminInvoiceByNumber,
  getAdminDeliveries,
  getAdminReportsSales,
  getAdminReportsOrders,
  getAdminReportsProducts,
  getAdminReportsCustomers,
  getAdminNotifications,
  getAdminAuditLogs,
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
} from '../controller/adminController.js'

const router = express.Router()

router.use(protect)
router.use(requireAdminOrManager)

router.get('/dashboard', getAdminDashboard)
router.get('/dashboard/sales', getAdminSalesAnalytics)

router.get('/orders', getAdminOrders)
router.get('/orders/:orderNumber', getAdminOrderByNumber)
router.patch('/orders/:orderNumber/status', updateAdminOrderStatus)
router.patch('/orders/:orderNumber/payment', updateAdminPaymentStatus)

router.get('/payments', getAdminPayments)

router.get('/products', getAdminProducts)
router.get('/products/:id', getAdminProductById)
router.post('/products', createAdminProduct)
router.patch('/products/:id', updateAdminProduct)
router.delete('/products/:id', deleteAdminProduct)
router.patch('/products/:id/availability', updateProductAvailability)

router.get('/inventory', getAdminInventory)
router.patch('/inventory/:productId', updateInventoryStock)
router.get('/inventory/low-stock', getLowStockInventory)

router.get('/customers', getAdminCustomers)
router.get('/customers/:id', getAdminCustomerById)

router.get('/invoices', getAdminInvoices)
router.get('/invoices/:invoiceNumber', getAdminInvoiceByNumber)

router.get('/deliveries', getAdminDeliveries)

router.get('/reports/sales', getAdminReportsSales)
router.get('/reports/orders', getAdminReportsOrders)
router.get('/reports/products', getAdminReportsProducts)
router.get('/reports/customers', getAdminReportsCustomers)

router.get('/notifications', getAdminNotifications)

router.get('/audit-logs', getAdminAuditLogs)

router.get('/categories', getAdminCategories)
router.post('/categories', createAdminCategory)
router.patch('/categories/:id', updateAdminCategory)
router.delete('/categories/:id', deleteAdminCategory)

export default router
