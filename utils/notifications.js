import nodemailer from 'nodemailer'
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

export const sendBrevoEmail = async ({ to, subject, message }) => {
  if (!to || !process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_PASS) {
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: Number(process.env.BREVO_SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: {
      address: process.env.BREVO_FROM_EMAIL || process.env.BREVO_SMTP_USER,
      name: process.env.BREVO_FROM_NAME || 'Cacao Bakery',
    },
    to,
    subject,
    text: message,
  })

  return true
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

export const notifyCustomerOfNewOrder = async (order) => {
  if (!order.customer?.email) return

  const items = (order.items || [])
    .map((item) => `${item.quantity} x ${item.name} - Rs ${item.price}`)
    .join('\n')
  const message = [
    `Hi ${order.customer.name},`,
    'Thank you for your order. We have received it and will keep you updated.',
    `Order: ${order.orderNumber}`,
    `Items:\n${items}`,
    `Total: Rs ${order.total}`,
    `Payment status: ${order.payment?.status || 'pending'}`,
    `Delivery: ${formatDelivery(order)}`,
  ].join('\n\n')

  try {
    await sendBrevoEmail({
      to: order.customer.email,
      subject: `Order ${order.orderNumber} received`,
      message,
    })
  } catch (error) {
    console.error('Customer order confirmation email failed:', error)
  }
}

export const notifyCustomerOfPaymentVerified = async (order) => {
  if (!order.customer?.email) return

  const message = [
    `Hi ${order.customer.name},`,
    `Your payment for order ${order.orderNumber} has been verified.`,
    `Amount: Rs ${order.total}`,
    `Order status: ${order.orderStatus.replaceAll('_', ' ')}.`,
    'We will email you again when your order status changes.',
  ].join('\n\n')

  try {
    await sendBrevoEmail({
      to: order.customer.email,
      subject: `Payment verified for order ${order.orderNumber}`,
      message,
    })
  } catch (error) {
    console.error('Customer payment verification email failed:', error)
  }
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