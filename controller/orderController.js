import mongoose from 'mongoose'
import Order from '../models/order.js'
import Product from '../models/Product.js'
import CustomerNotification from '../models/CustomerNotification.js'
import AdminAuditLog from '../models/AdminAuditLog.js'
import {
  notifyManagerOfNewOrder,
  notifyManagerOfEvent,
  notifyCustomerOfOrderStatus,
} from '../utils/notifications.js'

/**
 * ============================================================
 * GENERATE UNIQUE ORDER NUMBER
 * ============================================================
 *
 * Example:
 * CACAO-20260829-A7K92P
 */
const generateOrderNumber = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')

  const random = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()

  return `CACAO-${date}-${random}`
}

/**
 * ============================================================
 * GENERATE UNIQUE INVOICE NUMBER
 * ============================================================
 *
 * Example:
 * CACAO-INV-2026-A7K92P
 */
const generateInvoiceNumber = () => {
  const year = new Date().getFullYear()

  const random = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()

  return `CACAO-INV-${year}-${random}`
}

/**
 * ============================================================
 * CREATE ORDER
 * ============================================================
 *
 * POST /api/orders
 *
 * Stock validation + stock decrement + order creation
 * are performed inside one MongoDB transaction.
 */
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const {
      customer,
      delivery,
      items,
      payment,
      notes,
    } = req.body

    // ==========================================================
    // CUSTOMER
    // ==========================================================

    if (!customer) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Customer details are required',
      })
    }

    const name = customer.name?.trim()
    const email = customer.email?.trim()
    const phone = customer.phone?.trim()

    if (!name) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Customer name is required',
      })
    }

    if (!email) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Customer email is required',
      })
    }

    if (!phone) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Customer phone is required',
      })
    }

    // ==========================================================
    // DELIVERY
    // ==========================================================

    if (!delivery) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Delivery details are required',
      })
    }

    const deliveryMethod =
      delivery.method || 'delivery'

    if (
      !['delivery', 'pickup'].includes(
        deliveryMethod,
      )
    ) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Invalid delivery method',
      })
    }

    if (deliveryMethod === 'delivery') {
      if (!delivery.address?.trim()) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message:
            'Delivery address is required',
        })
      }

      if (!delivery.city?.trim()) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message: 'City is required',
        })
      }

      if (!delivery.state?.trim()) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message: 'State is required',
        })
      }

      if (
        !/^\d{6}$/.test(
          delivery.pincode?.trim() || '',
        )
      ) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message:
            'Valid 6-digit PIN code is required',
        })
      }
    }

    // ==========================================================
    // ITEMS
    // ==========================================================

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message:
          'Order must contain at least one item',
      })
    }

    // ==========================================================
    // PAYMENT
    // ==========================================================

    const paymentMethod =
      payment?.method || 'upi'

    if (
      !['upi', 'whatsapp'].includes(
        paymentMethod,
      )
    ) {
      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: 'Invalid payment method',
      })
    }

    const transactionId =
      payment?.transactionId?.trim() || ''

    const paymentStatus = transactionId
      ? 'submitted'
      : 'pending'

    // ==========================================================
    // VALIDATE ITEM IDS
    // ==========================================================

    for (const item of items) {
      if (!item.product) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message:
            'Each order item must contain a product ID',
        })
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          item.product,
        )
      ) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message: `Invalid product ID: ${item.product}`,
        })
      }

      const quantity = Number(
        item.quantity,
      )

      if (
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          message:
            'Quantity must be a positive integer',
        })
      }
    }

    // ==========================================================
    // FETCH PRODUCTS
    // ==========================================================

    const productIds = [
      ...new Set(
        items.map((item) =>
          item.product.toString(),
        ),
      ),
    ]

    const products = await Product.find({
      _id: {
        $in: productIds,
      },
    }).session(session)

    if (
      products.length !==
      productIds.length
    ) {
      await session.abortTransaction()

      return res.status(404).json({
        success: false,
        message:
          'One or more products could not be found',
      })
    }

    // ==========================================================
    // CHECK AVAILABILITY + DECREMENT STOCK
    // ==========================================================

    const orderItems = []

    for (const item of items) {
      const product = products.find(
        (productItem) =>
          productItem._id.toString() ===
          item.product.toString(),
      )

      const quantity = Number(
        item.quantity,
      )

      // --------------------------------------------------------
      // MANAGER AVAILABILITY
      // --------------------------------------------------------

      if (product.isAvailable !== true) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          code: 'PRODUCT_UNAVAILABLE',
          message: `${product.name} is marked unavailable by the manager`,
          product: {
            id: product._id,
            name: product.name,
            isAvailable:
              product.isAvailable,
            stock: product.stock,
          },
        })
      }

      // --------------------------------------------------------
      // ATOMIC STOCK CHECK + DECREMENT
      // --------------------------------------------------------

      const updatedProduct =
        await Product.findOneAndUpdate(
          {
            _id: product._id,
            stock: {
              $gte: quantity,
            },
          },
          {
            $inc: {
              stock: -quantity,
            },
          },
          {
            new: true,
            session,
          },
        )

      if (!updatedProduct) {
        await session.abortTransaction()

        return res.status(400).json({
          success: false,
          code: 'INSUFFICIENT_STOCK',
          message: `${product.name} has insufficient stock`,
          product: {
            id: product._id,
            name: product.name,
            isAvailable:
              product.isAvailable,
            stock: product.stock,
            requested: quantity,
          },
        })
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        price: Number(product.price),
        quantity,
        image: product.image || '',
      })
    }

    // ==========================================================
    // TOTALS
    // ==========================================================

    const subtotal =
      orderItems.reduce(
        (sum, item) =>
          sum +
          Number(item.price) *
            Number(item.quantity),
        0,
      )

    const deliveryCharge = 0

    const total =
      subtotal + deliveryCharge

    // ==========================================================
    // CREATE ORDER
    // ==========================================================

    const [order] =
      await Order.create(
        [
          {
            orderNumber:
              generateOrderNumber(),

            invoiceNumber:
              generateInvoiceNumber(),

            customer: {
              user:
                req.user?._id ||
                null,

              name,
              email,
              phone,
            },

            delivery: {
              method:
                deliveryMethod,

              address:
                delivery.address
                  ?.trim() || '',

              city:
                delivery.city
                  ?.trim() || '',

              state:
                delivery.state
                  ?.trim() || '',

              pincode:
                delivery.pincode
                  ?.trim() || '',

              preferredDate:
                delivery.preferredDate ||
                '',

              preferredTime:
                delivery.preferredTime ||
                '',
            },

            notes:
              notes?.trim() || '',

            items: orderItems,

            subtotal,

            deliveryCharge,

            total,

            payment: {
              method:
                paymentMethod,

              transactionId,

              status:
                paymentStatus,
            },

            orderStatus: 'pending',
            statusHistory: [
              {
                status: 'pending',
                changedAt: new Date(),
                changedBy:
                  req.user?._id || null,
              },
            ],
            paymentHistory: [
              {
                status: paymentStatus,
                changedAt: new Date(),
                changedBy:
                  req.user?._id || null,
              },
            ],
          },
        ],
        {
          session,
        },
      )

    // ==========================================================
    // COMMIT TRANSACTION
    // ==========================================================

    await session.commitTransaction()

    await notifyManagerOfNewOrder(order).catch((error) => {
      console.error('Manager notification creation failed:', error)
    })

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(201).json({
      success: true,

      message:
        'Order created successfully',

      order: {
        id: order._id,

        orderNumber:
          order.orderNumber,

        invoiceNumber:
          order.invoiceNumber,

        customer:
          order.customer,

        delivery:
          order.delivery,

        notes:
          order.notes,

        items:
          order.items,

        subtotal:
          order.subtotal,

        deliveryCharge:
          order.deliveryCharge,

        total:
          order.total,

        payment:
          order.payment,

        orderStatus:
          order.orderStatus,

        createdAt:
          order.createdAt,
      },
    })
  } catch (error) {
    await session
      .abortTransaction()
      .catch(() => {})

    console.error(
      'Create order error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Failed to create order',
    })
  } finally {
    session.endSession()
  }
}

/**
 * ============================================================
 * GET ORDER BY ORDER NUMBER
 * ============================================================
 *
 * GET /api/orders/:orderNumber
 */
export const getOrderByNumber = async (
  req,
  res,
) => {
  try {
    const {
      orderNumber,
    } = req.params

    const order =
      await Order.findOne({
        orderNumber,
      }).populate(
        'items.product',
        'name price image',
      )

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      })
    }

    return res.status(200).json({
      success: true,
      order,
    })
  } catch (error) {
    console.error(
      'Get order error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch order',
    })
  }
}

/**
 * ============================================================
 * GET ALL ORDERS — ADMIN
 * ============================================================
 *
 * GET /api/orders/admin/all
 *
 * Returns all orders for the admin panel.
 */
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .populate(
        'items.product',
        'name price image',
      )
      .lean()

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    })
  } catch (error) {
    console.error(
      'Get all orders error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    })
  }
}

/**
 * ============================================================
 * UPDATE ORDER STATUS — ADMIN
 * ============================================================
 *
 * PATCH /api/orders/:orderNumber/status
 *
 * Example body:
 * {
 *   "status": "confirmed"
 * }
 *
 * Allowed statuses:
 * pending
 * confirmed
 * processing
 * out_for_delivery
 * delivered
 * cancelled
 */
export const updateOrderStatus = async (
  req,
  res,
) => {
  try {
    const {
      orderNumber,
    } = req.params

    const {
      status,
    } = req.body

    // ==========================================================
    // VALIDATE ORDER NUMBER
    // ==========================================================

    if (!orderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          'Order number is required',
      })
    }

    // ==========================================================
    // VALIDATE STATUS
    // ==========================================================

    const allowedStatuses = [
      'pending',
      'confirmed',
      'processing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ]

    const newStatus =
      String(status || '')
        .trim()
        .toLowerCase()

    if (
      !allowedStatuses.includes(
        newStatus,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid order status',
        allowedStatuses,
      })
    }

    // ==========================================================
    // FIND ORDER
    // ==========================================================

    const order =
      await Order.findOne({
        orderNumber:
          orderNumber.trim(),
      })

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      })
    }

    // ==========================================================
    // UPDATE STATUS
    // ==========================================================

    const previousStatus = order.orderStatus

    if (previousStatus !== newStatus) {
      order.statusHistory = order.statusHistory || []
      order.statusHistory.push({
        status: newStatus,
        changedAt: new Date(),
        changedBy: req.user?._id || null,
      })
    }

    order.orderStatus =
      newStatus

    await order.save()

    if (previousStatus !== newStatus) {
      if (order.customer?.user) {
        await CustomerNotification.create({
          user: order.customer.user,
          type: 'order_status',
          title: 'Order status updated',
          message: `Your order ${order.orderNumber} is now ${newStatus.replaceAll('_', ' ')}.`,
          orderNumber: order.orderNumber,
        })
      }

      void notifyCustomerOfOrderStatus(order, newStatus)
    }

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,
      message:
        'Order status updated successfully',

      order: {
        orderNumber:
          order.orderNumber,

        orderStatus:
          order.orderStatus,

        updatedAt:
          order.updatedAt,
      },
    })
  } catch (error) {
    console.error(
      'Update order status error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        'Failed to update order status',
    })
  }
}

/**
 * ============================================================
 * UPDATE PAYMENT STATUS — ADMIN
 * ============================================================
 *
 * PATCH /api/orders/:orderNumber/payment
 *
 * Example body:
 * {
 *   "status": "verified"
 * }
 *
 * Allowed payment statuses:
 * pending
 * submitted
 * verified
 * failed
 */
export const updatePaymentStatus = async (
  req,
  res,
) => {
  try {
    const {
      orderNumber,
    } = req.params

    const {
      status,
    } = req.body

    // ==========================================================
    // VALIDATE ORDER NUMBER
    // ==========================================================

    if (!orderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          'Order number is required',
      })
    }

    // ==========================================================
    // VALIDATE PAYMENT STATUS
    // ==========================================================

    const allowedStatuses = [
      'pending',
      'submitted',
      'verified',
      'failed',
    ]

    const newStatus =
      String(status || '')
        .trim()
        .toLowerCase()

    if (
      !allowedStatuses.includes(
        newStatus,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid payment status',
        allowedStatuses,
      })
    }

    // ==========================================================
    // FIND ORDER
    // ==========================================================

    const order =
      await Order.findOne({
        orderNumber:
          orderNumber.trim(),
      })

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      })
    }

    // ==========================================================
    // VERIFY PAYMENT METHOD
    // ==========================================================

    if (
      order.payment?.method !== 'upi'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Payment verification is only available for UPI orders',
      })
    }

    // ==========================================================
    // UPDATE PAYMENT STATUS
    // ==========================================================

    const previousPaymentStatus = order.payment?.status || 'pending'

    order.payment.status = newStatus

    if (previousPaymentStatus !== newStatus) {
      order.paymentHistory = order.paymentHistory || []
      order.paymentHistory.push({
        status: newStatus,
        changedAt: new Date(),
        changedBy: req.user?._id || null,
      })
    }

    await order.save()

    if (previousPaymentStatus !== newStatus) {
      await AdminAuditLog.create({
        adminUser: req.user._id,
        action: 'payment verification',
        resource: 'OrderPayment',
        resourceId: order._id.toString(),
        oldValue: { paymentStatus: previousPaymentStatus },
        newValue: { paymentStatus: newStatus },
      })

      if (newStatus === 'verified' && order.customer?.user) {
        await CustomerNotification.create({
          user: order.customer.user,
          type: 'payment_verified',
          title: 'Payment verified',
          message: `Your payment for order ${order.orderNumber} has been verified.`,
          orderNumber: order.orderNumber,
        })
      }

      void notifyManagerOfEvent({
        type: newStatus === 'verified' ? 'payment_verified' : 'payment_submitted',
        title: newStatus === 'verified' ? 'Payment verified' : 'Payment status updated',
        message: `Payment for order ${order.orderNumber} is ${newStatus}.`,
        orderNumber: order.orderNumber,
      }).catch((error) => console.error('Payment notification failed:', error))
    }

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,

      message:
        'Payment status updated successfully',

      order: {
        orderNumber:
          order.orderNumber,

        payment: {
          method:
            order.payment.method,

          transactionId:
            order.payment.transactionId,

          status:
            order.payment.status,
        },

        updatedAt:
          order.updatedAt,
      },
    })
  } catch (error) {
    console.error(
      'Update payment status error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        'Failed to update payment status',
    })
  }
}

export const getMyOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)))
    const skip = (page - 1) * limit
    const filter = { 'customer.user': req.user._id }

    if (req.query.status) {
      filter.orderStatus = String(req.query.status).trim().toLowerCase()
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('orderNumber invoiceNumber items total payment orderStatus createdAt updatedAt')
        .lean(),
      Order.countDocuments(filter),
    ])

    return res.status(200).json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    console.error('Get customer orders error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch order history' })
  }
}

export const getMyOrderByNumber = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      'customer.user': req.user._id,
    }).populate('items.product', 'name price image').lean()

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    return res.status(200).json({ success: true, order })
  } catch (error) {
    console.error('Get customer order detail error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch order details' })
  }
}

export const getMyOrderStatus = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      'customer.user': req.user._id,
    }).select('orderNumber orderStatus statusHistory payment.status updatedAt').lean()

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    return res.status(200).json({
      success: true,
      status: {
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.payment?.status || 'pending',
        statusHistory: order.statusHistory || [],
        updatedAt: order.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get customer order status error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch order status' })
  }
}

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await CustomerNotification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    const unreadCount = await CustomerNotification.countDocuments({ user: req.user._id, read: false })

    return res.status(200).json({ success: true, notifications, unreadCount })
  } catch (error) {
    console.error('Get customer notifications error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' })
  }
}

export const markMyNotificationRead = async (req, res) => {
  try {
    const notification = await CustomerNotification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true },
    ).lean()

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }

    return res.status(200).json({ success: true, notification })
  } catch (error) {
    console.error('Mark customer notification read error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update notification' })
  }
}