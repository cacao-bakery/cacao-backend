import express from 'express'

import {
  createOrder,
  getOrderByNumber,
} from '../controller/orderController.js'

const router = express.Router()

// POST /api/orders
router.post('/', createOrder)

// GET /api/orders/:orderNumber
router.get(
  '/:orderNumber',
  getOrderByNumber,
)

export default router