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
  if (!to) {
    throw new Error('Brevo email delivery requires a recipient.')
  }

  const smtpPort = Number(process.env.BREVO_SMTP_PORT || 587)
  const smtpCredentialsAvailable = process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASS
  const fromEmail = process.env.BREVO_FROM_EMAIL || process.env.BREVO_SMTP_USER
  const fromName = process.env.BREVO_FROM_NAME || 'Cacao Bakery'

  if (!fromEmail) {
    throw new Error('Brevo email delivery requires BREVO_FROM_EMAIL.')
  }

  if (process.env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject,
        textContent: message,
      }),
    })

    if (!response.ok) {
      throw new Error(`Brevo API email delivery failed with status ${response.status}.`)
    }

    return true
  }

  if (!smtpCredentialsAvailable) {
    throw new Error(
      'Brevo email delivery requires BREVO_API_KEY or both BREVO_SMTP_USER and BREVO_SMTP_PASS.',
    )
  }

  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: {
      address: fromEmail,
      name: fromName,
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

  const deliveries = await Promise.allSettled([
    sendBrevoEmail({
      to: process.env.MANAGER_EMAIL,
      subject: `New order ${order.orderNumber} requires payment verification`,
      message,
    }),
    sendTelegramMessage(message),
  ])

  deliveries
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.error('Manager notification delivery failed:', result.reason))

  return notification
}

export const notifyCustomerOfNewOrder = async (order) => {
  const recipient = order.customer?.email
  const recipientDomain =
    typeof recipient === 'string'
      ? recipient.trim().match(/^[^@\s]+@([^@\s]+)$/)?.[1]?.toLowerCase() || 'unknown'
      : 'unknown'
  const logContext = {
    orderNumber: order.orderNumber,
    recipientDomain,
  }

  console.info('Customer order confirmation email started', logContext)

  if (!recipient) {
    console.warn('Customer order confirmation email skipped: recipient missing', logContext)
    return
  }

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
      to: recipient,
      subject: `Order ${order.orderNumber} received`,
      message,
    })
    console.info('Customer order confirmation email accepted by provider', logContext)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown email delivery error'
    const sensitiveValues = [
      recipient,
      process.env.BREVO_API_KEY,
      process.env.BREVO_SMTP_USER,
      process.env.BREVO_SMTP_PASS,
      process.env.BREVO_FROM_EMAIL,
    ].filter(Boolean)
    const safeErrorMessage = sensitiveValues.reduce(
      (message, sensitiveValue) => message.replaceAll(sensitiveValue, '[redacted]'),
      errorMessage,
    )

    console.error('Customer order confirmation email failed', {
      ...logContext,
      error: safeErrorMessage,
    })
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