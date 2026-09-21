import express from 'express'

import {
  createOrder,
  getOrderByNumber,
  getAllOrders,
  updateOrderStatus,
  updatePaymentStatus,
} from '../controller/orderController.js'

import {
  getInvoice,
} from '../controller/invoiceController.js'
import { protect, requireAdminOrManager } from '../middleware/authMiddleware.js'

const router = express.Router()

/*
|--------------------------------------------------------------------------
| CREATE ORDER
|--------------------------------------------------------------------------
| POST /api/orders
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  createOrder,
)

router.get(
  '/invoice-test',
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Invoice routes are working',
    })
  },
)

router.get(
  '/admin/all',
  protect,
  requireAdminOrManager,
  getAllOrders,
)

/*
|--------------------------------------------------------------------------
| UPDATE ORDER STATUS — ADMIN
|--------------------------------------------------------------------------
| PATCH /api/orders/:orderNumber/status
|--------------------------------------------------------------------------
*/

router.patch(
  '/:orderNumber/status',
  protect,
  requireAdminOrManager,
  updateOrderStatus,
)

router.patch(
  '/:orderNumber/payment',
  protect,
  requireAdminOrManager,
  updatePaymentStatus,
)

/*
|--------------------------------------------------------------------------
| GET INVOICE
|--------------------------------------------------------------------------
| GET /api/orders/:orderNumber/invoice
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This MUST be before /:orderNumber
|
*/

router.get(
  '/:orderNumber/invoice',
  getInvoice,
)

/*
|--------------------------------------------------------------------------
| GET ORDER
|--------------------------------------------------------------------------
| GET /api/orders/:orderNumber
|--------------------------------------------------------------------------
*/

router.get(
  '/:orderNumber',
  getOrderByNumber,
)

export default router