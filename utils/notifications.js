import AdminNotification from '../models/AdminNotification.js'

const formatDelivery = (order) => {
  const date = order.delivery?.preferredDate || 'Not specified'
  const time = order.delivery?.preferredTime || ''
  return `${date}${time ? `, ${time}` : ''}`
}

const buildOrderMessage = (order) => [
  'New Cacao order received',
  `Order: ${order.orderNumber}`,
  `Customer: ${order.customer.name}`,
  `Phone: ${order.customer.phone}`,
  `Total: Rs ${order.total}`,
  `Payment: ${order.payment.method.toUpperCase()}`,
  `UTR: ${order.payment.transactionId || 'Not submitted'}`,
  `Payment status: ${order.payment.status}`,
  `Delivery: ${formatDelivery(order)}`,
  `Open admin panel: ${process.env.ADMIN_PANEL_URL || 'Configure ADMIN_PANEL_URL'}`,
].join('\n')

const sendBrevoEmail = async ({ to, subject, message }) => {
  if (!process.env.BREVO_API_KEY || !to || !process.env.BREVO_SENDER_EMAIL) {
    return
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || 'Cacao Bakery',
      },
      to: [{ email: to }],
      subject,
      textContent: message,
    }),
  })

  if (!response.ok) {
    throw new Error(`Brevo returned ${response.status}`)
  }
}

const sendTelegramMessage = async (message) => {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return
  }

  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Telegram returned ${response.status}`)
  }
}

export const createAdminNotification = async ({ type, title, message, orderNumber = '' }) =>
  AdminNotification.create({ type, title, message, orderNumber })

export const notifyManagerOfEvent = async ({ type, title, message, orderNumber = '', externalMessage = message }) => {
  const notification = await createAdminNotification({ type, title, message, orderNumber })

  const telegramResult = await Promise.allSettled([
    sendTelegramMessage(externalMessage),
  ])

  telegramResult
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('Manager notification delivery failed:', result.reason))

  return notification
}

export const notifyManagerOfNewOrder = async (order) => {
  const message = buildOrderMessage(order)

  const notification = await createAdminNotification({
    type: 'new_order',
    title: 'New UPI order',
    message: `Order ${order.orderNumber} requires payment verification.`,
    orderNumber: order.orderNumber,
  })

  void Promise.allSettled([
    sendBrevoEmail({
      to: process.env.MANAGER_EMAIL,
      subject: `New order ${order.orderNumber} requires payment verification`,
      message,
    }),
    sendTelegramMessage(message),
  ]).then((deliveries) => {
    deliveries
      .filter((result) => result.status === 'rejected')
      .forEach((result) => console.error('Manager notification delivery failed:', result.reason))
  })

  return notification
}

export const notifyCustomerOfOrderStatus = async (order, status) => {
  if (!order.customer?.email) return

  const message = [
    `Your Cacao order ${order.orderNumber} is now ${status.replaceAll('_', ' ')}.`,
    `Payment status: ${order.payment?.status || 'pending'}.`,
    order.customer.user
      ? 'View the latest status from your Cacao account.'
      : 'Keep this order number for future status updates.',
  ].join('\n')

  try {
    await sendBrevoEmail({
      to: order.customer.email,
      subject: `Order ${order.orderNumber} status updated`,
      message,
    })
  } catch (error) {
    console.error('Customer status email failed:', error)
  }
}