import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

/**
 * ============================================================
 * CACAO BAKERY
 * PREMIUM SINGLE-PAGE INVOICE PDF GENERATOR
 * ============================================================
 *
 * IMPORTANT
 * ------------------------------------------------------------
 * This file only changes the PDF DESIGN / LAYOUT.
 *
 * Existing order structure and business logic are preserved.
 *
 * Controller remains responsible for:
 *
 *   pdf.pipe(res)
 *   pdf.end()
 *
 * DO NOT call doc.end() inside this file.
 * ============================================================
 */

/* ============================================================
   BUSINESS INFORMATION
   ============================================================ */

const BUSINESS_NAME = 'Cacao'

const BUSINESS_TAGLINE =
  'Artisanal Desserts & Patisserie'

const BUSINESS_ADDRESS = 'India'

const BUSINESS_PHONE =
  '+91 80809 59285'

const BUSINESS_EMAIL =
  'cacaobakery17@gmail.com'

const BUSINESS_WEBSITE =
  'www.cacaobakery.com'

/**
 * ============================================================
 * ORIGINAL CACAO LOGO
 * ============================================================
 *
 * Put your original logo here:
 *
 * backend/
 *   assets/
 *     cacao-logo.png
 *
 * If your filename is different, change only this path.
 */

const LOGO_PATH = path.resolve(
  process.cwd(),
  'assets',
  'cacao-logo.png',
)

/* ============================================================
   COLORS
   ============================================================ */

const COLORS = {
  brown: '#3B1E16',
  brownSoft: '#5A3328',

  terracotta: '#C84F2D',
  terracottaDark: '#A83C21',

  gold: '#C8A15A',
  goldLight: '#E5C98C',

  cream: '#FBF7F1',
  creamDark: '#F4EDE3',

  white: '#FFFFFF',

  text: '#30231E',
  textSoft: '#685D57',
  muted: '#8C817A',

  border: '#E4D5C7',
  borderSoft: '#EEE5DC',

  green: '#356B50',
  greenBg: '#EDF5EF',

  orange: '#9A651D',
  orangeBg: '#FBF3E1',

  red: '#A63C3C',
  redBg: '#FAEDED',
}

/* ============================================================
   A4 PAGE
   ============================================================ */

const PAGE = {
  width: 595.28,
  height: 841.89,

  left: 36,
  right: 36,

  top: 30,
  bottom: 30,

  contentWidth:
    595.28 - 36 - 36,
}

/* ============================================================
   SAFE VALUE HELPERS
   ============================================================ */

const number = (value) => {
  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : 0
}

/* ============================================================
   CURRENCY
   ============================================================ */

const formatPrice = (amount) => {
  return `₹${number(amount).toLocaleString(
    'en-IN',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`
}

/* ============================================================
   DATE
   ============================================================ */

const formatDate = (date) => {
  if (!date) {
    return '-'
  }

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return '-'
  }

  return parsedDate.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}

/* ============================================================
   PAYMENT METHOD
   ============================================================ */

const formatPaymentMethod = (method) => {
  switch (method) {
    case 'upi':
      return 'UPI'

    case 'whatsapp':
      return 'WhatsApp'

    case 'cod':
      return 'Cash on Delivery'

    case 'cash':
      return 'Cash'

    case 'card':
      return 'Card'

    default:
      return method || 'Not specified'
  }
}

/* ============================================================
   PAYMENT STATUS
   ============================================================ */

const formatPaymentStatus = (status) => {
  switch (status) {
    case 'pending':
      return 'Pending'

    case 'submitted':
      return 'Payment Submitted'

    case 'verified':
      return 'Paid / Verified'

    case 'failed':
      return 'Failed'

    case 'refunded':
      return 'Refunded'

    default:
      return status || 'Pending'
  }
}

/* ============================================================
   ORDER STATUS
   ============================================================ */

const formatOrderStatus = (status) => {
  switch (status) {
    case 'pending':
      return 'Pending'

    case 'confirmed':
      return 'Confirmed'

    case 'processing':
      return 'Processing'

    case 'out_for_delivery':
      return 'Out for Delivery'

    case 'delivered':
      return 'Delivered'

    case 'cancelled':
      return 'Cancelled'

    default:
      return status || 'Pending'
  }
}

/* ============================================================
   SAFE TEXT
   ============================================================ */

const safeText = (
  value,
  fallback = '-',
) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback
  }

  return String(value)
}

/* ============================================================
   DELIVERY ADDRESS
   ============================================================ */

const getDeliveryAddress = (order) => {
  const delivery =
    order?.delivery || {}

  const parts = [
    delivery.address,
    delivery.city,
    delivery.state,
    delivery.pincode,
  ]
    .map((value) =>
      String(value || '').trim(),
    )
    .filter(Boolean)

  return parts.join(', ')
}

/* ============================================================
   DISCOUNT
   ============================================================ */

const getDiscountAmount = (order) => {
  const possibleValues = [
    order?.discountAmount,
    order?.discount,
    order?.couponDiscount,
  ]

  for (const value of possibleValues) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      const parsed = number(value)

      if (parsed > 0) {
        return parsed
      }
    }
  }

  return 0
}

/* ============================================================
   TAX
   ============================================================ */

const getTaxAmount = (order) => {
  const possibleValues = [
    order?.taxAmount,
    order?.tax,
    order?.gstAmount,
    order?.gst,
  ]

  for (const value of possibleValues) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      const parsed = number(value)

      if (parsed > 0) {
        return parsed
      }
    }
  }

  return 0
}

/* ============================================================
   TAX RATE
   ============================================================ */

const getTaxRate = (order) => {
  const possibleValues = [
    order?.taxRate,
    order?.gstRate,
    order?.gstPercentage,
  ]

  for (const value of possibleValues) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      const parsed = number(value)

      if (parsed >= 0) {
        return parsed
      }
    }
  }

  return null
}

/* ============================================================
   DRAW BASIC TEXT
   ============================================================ */

const drawText = (
  doc,
  text,
  x,
  y,
  {
    width,
    size = 8,
    font = 'Helvetica',
    color = COLORS.text,
    align = 'left',
    lineGap = 1,
  } = {},
) => {
  doc
    .fillColor(color)
    .font(font)
    .fontSize(size)
    .text(
      safeText(text),
      x,
      y,
      {
        width,
        align,
        lineGap,
        lineBreak: false,
      },
    )
}

/* ============================================================
   DRAW RULE
   ============================================================ */

const drawRule = (
  doc,
  x,
  y,
  width,
  {
    color = COLORS.border,
    lineWidth = 0.6,
  } = {},
) => {
  doc
    .save()
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(lineWidth)
    .strokeColor(color)
    .stroke()
    .restore()
}

/* ============================================================
   DRAW ROUNDED CARD
   ============================================================ */

const drawCard = (
  doc,
  x,
  y,
  width,
  height,
  {
    fill = COLORS.white,
    border = COLORS.border,
    radius = 8,
  } = {},
) => {
  doc
    .save()
    .roundedRect(
      x,
      y,
      width,
      height,
      radius,
    )
    .fillAndStroke(
      fill,
      border,
    )
    .restore()
}

/* ============================================================
   SECTION TITLE
   ============================================================ */

const drawSectionTitle = (
  doc,
  text,
  x,
  y,
  {
    size = 7.2,
    color = COLORS.terracotta,
  } = {},
) => {
  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(size)
    .text(
      String(text).toUpperCase(),
      x,
      y,
      {
        characterSpacing: 1.1,
      },
    )
}

/* ============================================================
   STATUS BADGE
   ============================================================ */

const getStatusColors = (
  status,
) => {
  const normalized =
    String(status || '')
      .toLowerCase()

  if (
    normalized.includes('paid') ||
    normalized.includes('verified') ||
    normalized === 'confirmed' ||
    normalized === 'delivered'
  ) {
    return {
      background: COLORS.greenBg,
      color: COLORS.green,
    }
  }

  if (
    normalized.includes('failed') ||
    normalized.includes('cancelled')
  ) {
    return {
      background: COLORS.redBg,
      color: COLORS.red,
    }
  }

  return {
    background: COLORS.orangeBg,
    color: COLORS.orange,
  }
}

const drawBadge = (
  doc,
  text,
  x,
  y,
  {
    background = COLORS.orangeBg,
    color = COLORS.orange,
    width = 82,
  } = {},
) => {
  doc
    .save()
    .roundedRect(
      x,
      y,
      width,
      19,
      9.5,
    )
    .fill(background)
    .restore()

  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(6.7)
    .text(
      text,
      x,
      y + 6,
      {
        width,
        align: 'center',
      },
    )
}

/* ============================================================
   HEADER
   ============================================================ */

const drawHeader = (
  doc,
  order,
) => {
  const topY = PAGE.top

  /* ----------------------------------------------------------
     BRAND AREA
     ---------------------------------------------------------- */

  const logoExists =
    fs.existsSync(LOGO_PATH)

  if (logoExists) {
    /**
     * Original logo.
     *
     * KeepAspectRatio is handled by PDFKit
     * using width only.
     */
    doc.image(
      LOGO_PATH,
      PAGE.left,
      topY,
      {
        width: 190,
      },
    )
  } else {
    /**
     * Fallback only if logo file is missing.
     */
    drawText(
      doc,
      'CACAO',
      PAGE.left,
      topY + 8,
      {
        width: 190,
        size: 31,
        font: 'Helvetica',
        color: COLORS.brown,
      },
    )

    drawText(
      doc,
      'PATISSERIE  |  BAKERY  |  CAFE',
      PAGE.left + 2,
      topY + 47,
      {
        width: 190,
        size: 6.5,
        color: COLORS.terracotta,
      },
    )
  }

  /* ----------------------------------------------------------
     INVOICE TITLE
     ---------------------------------------------------------- */

  drawText(
    doc,
    'INVOICE',
    PAGE.left + 300,
    topY + 1,
    {
      width: 223,
      size: 28,
      font: 'Helvetica',
      color: COLORS.terracottaDark,
      align: 'right',
    },
  )

  const invoiceNo =
    safeText(
      order?.invoiceNumber,
    )

  const orderNo =
    safeText(
      order?.orderNumber,
    )

  const invoiceDate =
    formatDate(
      order?.createdAt,
    )

  drawText(
    doc,
    `Invoice No.   ${invoiceNo}`,
    PAGE.left + 300,
    topY + 38,
    {
      width: 223,
      size: 7.5,
      color: COLORS.textSoft,
      align: 'right',
    },
  )

  drawText(
    doc,
    `Order No.     ${orderNo}`,
    PAGE.left + 300,
    topY + 51,
    {
      width: 223,
      size: 7.5,
      color: COLORS.textSoft,
      align: 'right',
    },
  )

  drawText(
    doc,
    `Invoice Date  ${invoiceDate}`,
    PAGE.left + 300,
    topY + 64,
    {
      width: 223,
      size: 7.5,
      color: COLORS.textSoft,
      align: 'right',
    },
  )

  /* ----------------------------------------------------------
     GOLD DIVIDER
     ---------------------------------------------------------- */

  drawRule(
    doc,
    PAGE.left,
    topY + 87,
    PAGE.contentWidth,
    {
      color: COLORS.gold,
      lineWidth: 1,
    },
  )

  /* small center ornament */

  doc
    .save()
    .fillColor(COLORS.gold)
    .font('Helvetica')
    .fontSize(9)
    .text(
      '✦',
      PAGE.left +
        PAGE.contentWidth / 2 -
        5,
      topY + 80,
      {
        width: 10,
        align: 'center',
      },
    )
    .restore()

  return topY + 102
}

/* ============================================================
   PARTY INFORMATION
   ============================================================ */

const drawPartyInformation = (
  doc,
  order,
  y,
) => {
  const gap = 16

  const columnWidth =
    (PAGE.contentWidth - gap) / 2

  const leftX =
    PAGE.left

  const rightX =
    PAGE.left +
    columnWidth +
    gap

  const cardHeight = 112

  /* ----------------------------------------------------------
     LEFT CARD
     ---------------------------------------------------------- */

  drawCard(
    doc,
    leftX,
    y,
    columnWidth,
    cardHeight,
    {
      fill: COLORS.cream,
      border: COLORS.border,
      radius: 8,
    },
  )

  drawSectionTitle(
    doc,
    'Bill From',
    leftX + 14,
    y + 13,
  )

  drawText(
    doc,
    BUSINESS_NAME,
    leftX + 14,
    y + 31,
    {
      width: columnWidth - 28,
      size: 13,
      font: 'Helvetica-Bold',
      color: COLORS.brown,
    },
  )

  drawText(
    doc,
    BUSINESS_TAGLINE,
    leftX + 14,
    y + 49,
    {
      width: columnWidth - 28,
      size: 7.2,
      color: COLORS.terracotta,
    },
  )

  drawRule(
    doc,
    leftX + 14,
    y + 64,
    columnWidth - 28,
    {
      color: COLORS.goldLight,
      lineWidth: 0.6,
    },
  )

  drawText(
    doc,
    BUSINESS_ADDRESS,
    leftX + 14,
    y + 72,
    {
      width: columnWidth - 28,
      size: 7.5,
      color: COLORS.textSoft,
    },
  )

  drawText(
    doc,
    BUSINESS_PHONE,
    leftX + 14,
    y + 85,
    {
      width: columnWidth - 28,
      size: 7.5,
      color: COLORS.textSoft,
    },
  )

  drawText(
    doc,
    BUSINESS_EMAIL,
    leftX + 14,
    y + 98,
    {
      width: columnWidth - 28,
      size: 7.2,
      color: COLORS.textSoft,
    },
  )

  /* ----------------------------------------------------------
     RIGHT CARD
     ---------------------------------------------------------- */

  drawCard(
    doc,
    rightX,
    y,
    columnWidth,
    cardHeight,
    {
      fill: COLORS.white,
      border: COLORS.border,
      radius: 8,
    },
  )

  drawSectionTitle(
    doc,
    'Bill To',
    rightX + 14,
    y + 13,
  )

  const customer =
    order?.customer || {}

  drawText(
    doc,
    customer.name,
    rightX + 14,
    y + 31,
    {
      width: columnWidth - 28,
      size: 13,
      font: 'Helvetica-Bold',
      color: COLORS.brown,
    },
  )

  drawText(
    doc,
    customer.email,
    rightX + 14,
    y + 49,
    {
      width: columnWidth - 28,
      size: 7.2,
      color: COLORS.textSoft,
    },
  )

  drawText(
    doc,
    customer.phone,
    rightX + 14,
    y + 62,
    {
      width: columnWidth - 28,
      size: 7.5,
      color: COLORS.textSoft,
    },
  )

  const address =
    getDeliveryAddress(order)

  drawText(
    doc,
    address,
    rightX + 14,
    y + 76,
    {
      width: columnWidth - 28,
      size: 7.2,
      color: COLORS.textSoft,
      lineGap: 1,
    },
  )

  return y + cardHeight
}

/* ============================================================
   ORDER / DELIVERY STRIP
   ============================================================ */

const drawOrderStrip = (
  doc,
  order,
  y,
) => {
  const height = 56

  drawCard(
    doc,
    PAGE.left,
    y,
    PAGE.contentWidth,
    height,
    {
      fill: COLORS.white,
      border: COLORS.border,
      radius: 8,
    },
  )

  const delivery =
    order?.delivery || {}

  const method =
    delivery.method === 'delivery'
      ? 'Delivery'
      : 'Pickup'

  const preferredDate =
    delivery.preferredDate
      ? formatDate(
          delivery.preferredDate,
        )
      : '-'

  const preferredTime =
    safeText(
      delivery.preferredTime,
    )

  const cells = [
    {
      label: 'ORDER TYPE',
      value: method,
      width: 112,
    },
    {
      label: 'PREFERRED DATE',
      value: preferredDate,
      width: 130,
    },
    {
      label: 'PREFERRED TIME',
      value: preferredTime,
      width: 130,
    },
    {
      label:
        delivery.method === 'delivery'
          ? 'DELIVERY ADDRESS'
          : 'COLLECTION',
      value:
        delivery.method === 'delivery'
          ? getDeliveryAddress(
              order,
            )
          : 'Customer pickup from Cacao',
      width:
        PAGE.contentWidth -
        112 -
        130 -
        130 -
        42,
    },
  ]

  let cellX =
    PAGE.left + 14

  cells.forEach(
    (cell, index) => {
      drawSectionTitle(
        doc,
        cell.label,
        cellX,
        y + 10,
        {
          size: 6.2,
        },
      )

      drawText(
        doc,
        cell.value,
        cellX,
        y + 25,
        {
          width:
            cell.width - 12,
          size: 7.4,
          font:
            index === 0
              ? 'Helvetica-Bold'
              : 'Helvetica',
          color:
            index === 0
              ? COLORS.brown
              : COLORS.textSoft,
        },
      )

      if (index < cells.length - 1) {
        doc
          .save()
          .moveTo(
            cellX +
              cell.width -
              7,
            y + 11,
          )
          .lineTo(
            cellX +
              cell.width -
              7,
            y + height -
              11,
          )
          .lineWidth(0.5)
          .strokeColor(
            COLORS.borderSoft,
          )
          .stroke()
          .restore()
      }

      cellX += cell.width
    },
  )

  return y + height
}

/* ============================================================
   ITEMS TABLE
   ============================================================ */

const drawItemsTable = (
  doc,
  order,
  y,
) => {
  const items =
    Array.isArray(order?.items)
      ? order.items
      : []

  const tableX =
    PAGE.left

  const tableWidth =
    PAGE.contentWidth

  const headerHeight = 27

  /* ----------------------------------------------------------
     SECTION TITLE
     ---------------------------------------------------------- */

  drawSectionTitle(
    doc,
    'Order Items',
    tableX,
    y,
  )

  y += 14

  /* ----------------------------------------------------------
     TABLE CONTAINER
     ---------------------------------------------------------- */

  const tableStartY = y

  const itemWidth = 275
  const qtyWidth = 55
  const priceWidth = 90
  const amountWidth =
    tableWidth -
    itemWidth -
    qtyWidth -
    priceWidth

  /* ----------------------------------------------------------
     HEADER
     ---------------------------------------------------------- */

  doc
    .save()
    .roundedRect(
      tableX,
      y,
      tableWidth,
      headerHeight,
      6,
    )
    .fill(COLORS.brown)
    .restore()

  drawText(
    doc,
    'ITEM',
    tableX + 12,
    y + 9,
    {
      width: itemWidth - 20,
      size: 6.8,
      font: 'Helvetica-Bold',
      color: COLORS.white,
    },
  )

  drawText(
    doc,
    'QTY',
    tableX + itemWidth,
    y + 9,
    {
      width: qtyWidth,
      size: 6.8,
      font: 'Helvetica-Bold',
      color: COLORS.white,
      align: 'center',
    },
  )

  drawText(
    doc,
    'UNIT PRICE',
    tableX +
      itemWidth +
      qtyWidth,
    y + 9,
    {
      width: priceWidth,
      size: 6.8,
      font: 'Helvetica-Bold',
      color: COLORS.white,
      align: 'right',
    },
  )

  drawText(
    doc,
    'TOTAL',
    tableX +
      itemWidth +
      qtyWidth +
      priceWidth,
    y + 9,
    {
      width: amountWidth - 12,
      size: 6.8,
      font: 'Helvetica-Bold',
      color: COLORS.white,
      align: 'right',
    },
  )

  y += headerHeight

  /* ----------------------------------------------------------
     ITEMS
     ---------------------------------------------------------- */

  if (items.length === 0) {
    drawText(
      doc,
      'No items found.',
      tableX + 12,
      y + 12,
      {
        width: tableWidth - 24,
        size: 8,
        color: COLORS.muted,
      },
    )

    return y + 35
  }

  items.forEach(
    (item, index) => {
      const itemName =
        item?.name ||
        (
          typeof item?.product ===
          'object'
            ? item.product?.name
            : null
        ) ||
        'Product'

      const quantity =
        number(
          item?.quantity,
        )

      const unitPrice =
        number(item?.price)

      const amount =
        unitPrice * quantity

      /**
       * Compact fixed-height rows.
       *
       * This is intentionally compact so
       * normal invoices remain one page.
       */
      const rowHeight = 37

      if (index % 2 === 0) {
        doc
          .save()
          .rect(
            tableX,
            y,
            tableWidth,
            rowHeight,
          )
          .fill(
            COLORS.cream,
          )
          .restore()
      }

      /* Item name */

      drawText(
        doc,
        itemName,
        tableX + 12,
        y + 11,
        {
          width:
            itemWidth - 20,
          size: 8,
          font:
            'Helvetica-Bold',
          color:
            COLORS.brown,
        },
      )

      /* Quantity */

      drawText(
        doc,
        String(quantity),
        tableX +
          itemWidth,
        y + 11,
        {
          width: qtyWidth,
          size: 8,
          color:
            COLORS.textSoft,
          align: 'center',
        },
      )

      /* Unit price */

      drawText(
        doc,
        formatPrice(
          unitPrice,
        ),
        tableX +
          itemWidth +
          qtyWidth,
        y + 11,
        {
          width: priceWidth,
          size: 8,
          color:
            COLORS.textSoft,
          align: 'right',
        },
      )

      /* Total */

      drawText(
        doc,
        formatPrice(
          amount,
        ),
        tableX +
          itemWidth +
          qtyWidth +
          priceWidth,
        y + 11,
        {
          width:
            amountWidth - 12,
          size: 8,
          font:
            'Helvetica-Bold',
          color:
            COLORS.brown,
          align: 'right',
        },
      )

      drawRule(
        doc,
        tableX,
        y + rowHeight,
        tableWidth,
        {
          color:
            COLORS.borderSoft,
          lineWidth: 0.5,
        },
      )

      y += rowHeight
    },
  )

  /**
   * Bottom border.
   */
  drawRule(
    doc,
    tableX,
    y,
    tableWidth,
    {
      color: COLORS.border,
      lineWidth: 0.8,
    },
  )

  return y
}

/* ============================================================
   BOTTOM INFORMATION AREA
   ============================================================ */

const drawBottomArea = (
  doc,
  order,
  y,
) => {
  const gap = 18

  const leftWidth = 275

  const rightWidth =
    PAGE.contentWidth -
    leftWidth -
    gap

  const leftX =
    PAGE.left

  const rightX =
    PAGE.left +
    leftWidth +
    gap

  const cardHeight = 145

  /* ----------------------------------------------------------
     LEFT INFORMATION CARD
     ---------------------------------------------------------- */

  drawCard(
    doc,
    leftX,
    y,
    leftWidth,
    cardHeight,
    {
      fill: COLORS.cream,
      border: COLORS.border,
      radius: 8,
    },
  )

  /* PAYMENT */

  drawSectionTitle(
    doc,
    'Payment Information',
    leftX + 14,
    y + 13,
  )

  const payment =
    order?.payment || {}

  const paymentStatus =
    formatPaymentStatus(
      payment.status,
    )

  const orderStatus =
    formatOrderStatus(
      order?.orderStatus,
    )

  drawText(
    doc,
    'Payment Method',
    leftX + 14,
    y + 34,
    {
      width: 90,
      size: 7,
      color: COLORS.muted,
    },
  )

  drawText(
    doc,
    formatPaymentMethod(
      payment.method,
    ),
    leftX + 105,
    y + 34,
    {
      width:
        leftWidth - 119,
      size: 7.5,
      font: 'Helvetica-Bold',
      color: COLORS.brown,
    },
  )

  drawText(
    doc,
    'Payment Status',
    leftX + 14,
    y + 51,
    {
      width: 90,
      size: 7,
      color: COLORS.muted,
    },
  )

  drawBadge(
    doc,
    paymentStatus,
    leftX + 105,
    y + 46,
    {
      width: 92,
      ...getStatusColors(
        paymentStatus,
      ),
    },
  )

  if (payment.transactionId) {
    drawText(
      doc,
      'Transaction ID',
      leftX + 14,
      y + 77,
      {
        width: 90,
        size: 7,
        color: COLORS.muted,
      },
    )

    drawText(
      doc,
      payment.transactionId,
      leftX + 105,
      y + 77,
      {
        width:
          leftWidth - 119,
        size: 6.7,
        color: COLORS.textSoft,
      },
    )
  }

  /* ORDER STATUS */

  drawRule(
    doc,
    leftX + 14,
    y + 95,
    leftWidth - 28,
    {
      color: COLORS.goldLight,
      lineWidth: 0.6,
    },
  )

  drawSectionTitle(
    doc,
    'Order Status',
    leftX + 14,
    y + 106,
  )

  drawBadge(
    doc,
    orderStatus,
    leftX + 105,
    y + 101,
    {
      width: 92,
      ...getStatusColors(
        orderStatus,
      ),
    },
  )

  /* ----------------------------------------------------------
     NOTES
     ---------------------------------------------------------- */

  if (order?.notes) {
    drawText(
      doc,
      'Notes',
      leftX + 14,
      y + 126,
      {
        width: 40,
        size: 6.5,
        font: 'Helvetica-Bold',
        color: COLORS.terracotta,
      },
    )

    drawText(
      doc,
      order.notes,
      leftX + 55,
      y + 126,
      {
        width:
          leftWidth - 69,
        size: 6.7,
        color: COLORS.textSoft,
      },
    )
  }

  /* ----------------------------------------------------------
     TOTALS CARD
     ---------------------------------------------------------- */

  const discount =
    getDiscountAmount(order)

  const tax =
    getTaxAmount(order)

  const taxRate =
    getTaxRate(order)

  const deliveryCharge =
    number(
      order?.deliveryCharge,
    )

  const subtotal =
    number(order?.subtotal)

  const total =
    number(order?.total)

  drawCard(
    doc,
    rightX,
    y,
    rightWidth,
    cardHeight,
    {
      fill: COLORS.white,
      border: COLORS.border,
      radius: 8,
    },
  )

  drawSectionTitle(
    doc,
    'Order Summary',
    rightX + 14,
    y + 13,
  )

  let rowY =
    y + 36

  const drawTotalRow = (
    label,
    value,
    {
      color = COLORS.textSoft,
      bold = false,
    } = {},
  ) => {
    drawText(
      doc,
      label,
      rightX + 14,
      rowY,
      {
        width:
          rightWidth - 125,
        size: 7.7,
        font:
          bold
            ? 'Helvetica-Bold'
            : 'Helvetica',
        color,
      },
    )

    drawText(
      doc,
      value,
      rightX + 105,
      rowY,
      {
        width:
          rightWidth - 119,
        size: 7.7,
        font:
          bold
            ? 'Helvetica-Bold'
            : 'Helvetica',
        color,
        align: 'right',
      },
    )

    rowY += 18
  }

  drawTotalRow(
    'Subtotal',
    formatPrice(
      subtotal,
    ),
  )

  if (discount > 0) {
    drawTotalRow(
      'Discount',
      `− ${formatPrice(
        discount,
      )}`,
      {
        color:
          COLORS.green,
      },
    )
  }

  drawTotalRow(
    'Delivery Charge',
    formatPrice(
      deliveryCharge,
    ),
  )

  if (tax > 0) {
    drawTotalRow(
      taxRate !== null
        ? `Tax / GST (${taxRate}%)`
        : 'Tax / GST',
      formatPrice(tax),
    )
  }

  drawRule(
    doc,
    rightX + 14,
    rowY + 1,
    rightWidth - 28,
    {
      color: COLORS.gold,
      lineWidth: 0.8,
    },
  )

  rowY += 14

  drawText(
    doc,
    'GRAND TOTAL',
    rightX + 14,
    rowY,
    {
      width:
        rightWidth - 115,
      size: 9,
      font: 'Helvetica-Bold',
      color:
        COLORS.terracottaDark,
    },
  )

  drawText(
    doc,
    formatPrice(total),
    rightX + 100,
    rowY - 4,
    {
      width:
        rightWidth - 114,
      size: 17,
      font: 'Helvetica-Bold',
      color:
        COLORS.terracottaDark,
      align: 'right',
    },
  )

  drawText(
    doc,
    'Amount payable',
    rightX + 14,
    rowY + 25,
    {
      width:
        rightWidth - 28,
      size: 6.3,
      color: COLORS.muted,
      align: 'right',
    },
  )

  return y + cardHeight
}

/* ============================================================
   FOOTER
   ============================================================ */

const drawFooter = (
  doc,
) => {
  const footerY =
    PAGE.height - 72

  /* ----------------------------------------------------------
     Gold rule
     ---------------------------------------------------------- */

  drawRule(
    doc,
    PAGE.left,
    footerY,
    PAGE.contentWidth,
    {
      color: COLORS.gold,
      lineWidth: 1,
    },
  )

  /* ----------------------------------------------------------
     Brand
     ---------------------------------------------------------- */

  drawText(
    doc,
    'CACAO',
    PAGE.left,
    footerY + 14,
    {
      width: 80,
      size: 7.5,
      font: 'Helvetica-Bold',
      color: COLORS.brown,
    },
  )

  drawText(
    doc,
    'Freshly prepared  •  Carefully packed  •  Made with care',
    PAGE.left + 82,
    footerY + 14,
    {
      width: 310,
      size: 6.4,
      color: COLORS.muted,
      align: 'center',
    },
  )

  drawText(
    doc,
    BUSINESS_WEBSITE,
    PAGE.left + 410,
    footerY + 14,
    {
      width: 89,
      size: 6.4,
      color: COLORS.terracotta,
      align: 'right',
    },
  )

  /* ----------------------------------------------------------
     Final message
     ---------------------------------------------------------- */

  drawText(
    doc,
    'Thank you for choosing Cacao.',
    PAGE.left,
    footerY + 32,
    {
      width:
        PAGE.contentWidth,
      size: 8.5,
      font: 'Helvetica-Bold',
      color: COLORS.brown,
      align: 'center',
    },
  )

  drawText(
    doc,
    'Artisanal desserts made with love.',
    PAGE.left,
    footerY + 46,
    {
      width:
        PAGE.contentWidth,
      size: 6.5,
      color: COLORS.muted,
      align: 'center',
    },
  )
}

/* ============================================================
   MAIN INVOICE GENERATOR
   ============================================================ */

export const generateInvoice = (
  order,
) => {
  /**
   * ----------------------------------------------------------
   * A4 DOCUMENT
   * ----------------------------------------------------------
   *
   * No extra pages are created.
   *
   * This is intentionally a single-page
   * invoice design.
   */

  const doc = new PDFDocument({
    size: 'A4',

    margins: {
      top: PAGE.top,
      bottom: PAGE.bottom,
      left: PAGE.left,
      right: PAGE.right,
    },

    info: {
      Title: `Invoice ${
        order?.invoiceNumber ||
        order?.orderNumber ||
        'Cacao'
      }`,

      Author: BUSINESS_NAME,

      Subject: `Invoice for order ${
        order?.orderNumber ||
        ''
      }`,

      Keywords:
        'Cacao Bakery, Invoice, Order',
    },
  })

  /* ==========================================================
     PAGE BACKGROUND
     ========================================================== */

  /**
   * Very subtle warm background.
   *
   * This gives the PDF a premium bakery
   * paper feel without making it heavy.
   */

  doc
    .save()
    .rect(
      0,
      0,
      PAGE.width,
      PAGE.height,
    )
    .fill(COLORS.cream)
    .restore()

  /* ==========================================================
     HEADER
     ========================================================== */

  let y =
    drawHeader(
      doc,
      order,
    )

  /* ==========================================================
     PARTY INFORMATION
     ========================================================== */

  y =
    drawPartyInformation(
      doc,
      order,
      y,
    )

  y += 12

  /* ==========================================================
     ORDER / DELIVERY
     ========================================================== */

  y =
    drawOrderStrip(
      doc,
      order,
      y,
    )

  y += 12

  /* ==========================================================
     ORDER ITEMS
     ========================================================== */

  y =
    drawItemsTable(
      doc,
      order,
      y,
    )

  y += 12

  /* ==========================================================
     PAYMENT + TOTALS
     ========================================================== */

  drawBottomArea(
    doc,
    order,
    y,
  )

  /* ==========================================================
     FOOTER
     ========================================================== */

  drawFooter(doc)

  /* ==========================================================
     IMPORTANT
     ========================================================== */

  /**
   * DO NOT call doc.end() here.
   *
   * Controller remains responsible for:
   *
   *   pdf.pipe(res)
   *   pdf.end()
   */

  return doc
}