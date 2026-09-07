import Order from '../models/order.js'
import {
  generateInvoice,
} from '../utils/invoiceGenerator.js'

/**
 * ============================================================
 * GET INVOICE PDF
 * ============================================================
 *
 * GET /api/orders/:orderNumber/invoice
 *
 * Returns the generated invoice PDF.
 */
export const getInvoice = async (
  req,
  res,
) => {
  try {
    const {
      orderNumber,
    } = req.params

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
    // GENERATE PDF
    // ==========================================================

    const pdf =
      generateInvoice(order)

    if (!pdf) {
      throw new Error(
        'Invoice generator did not return a PDF document',
      )
    }

    // ==========================================================
    // PDF RESPONSE HEADERS
    // ==========================================================

    const invoiceName =
      order.invoiceNumber ||
      order.orderNumber ||
      'cacao-invoice'

    res.statusCode = 200

    res.setHeader(
      'Content-Type',
      'application/pdf',
    )

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoiceName}.pdf"`,
    )

    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private',
    )

    res.setHeader(
      'Pragma',
      'no-cache',
    )

    // ==========================================================
    // STREAM PDF TO RESPONSE
    // ==========================================================

    pdf.pipe(res)

    // IMPORTANT:
    // The PDF must be ended AFTER it is piped.
    pdf.end()
  } catch (error) {
    console.error(
      'Get invoice error:',
      error,
    )

    // ==========================================================
    // HANDLE STREAM ERRORS
    // ==========================================================

    if (res.headersSent) {
      try {
        res.end()
      } catch {
        // Response already closed.
      }

      return
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Failed to generate invoice',
    })
  }
}