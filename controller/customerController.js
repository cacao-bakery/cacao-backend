import User from '../models/User.js'
import { createOneTimeToken } from '../utils/oneTimeTokens.js'
import { sendBrevoEmail } from '../utils/notifications.js'

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const toAddressResponse = (address) => ({
  id: address._id,
  label: address.label,
  fullName: address.fullName,
  phone: address.phone,
  street: address.street,
  city: address.city,
  state: address.state,
  pincode: address.pincode,
  country: address.country,
  isDefault: address.isDefault,
})

const toProfileResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  addresses: user.addresses.map(toAddressResponse),
})

const addressFields = ['label', 'fullName', 'phone', 'street', 'city', 'state', 'pincode', 'country']

const getAddressInput = (body = {}) => Object.fromEntries(
  addressFields
    .filter((field) => body[field] !== undefined)
    .map((field) => [field, String(body[field]).trim()]),
)

const sendVerificationEmail = async (user) => {
  const { token, tokenHash } = createOneTimeToken()
  user.emailVerificationTokenHash = tokenHash
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)
  await user.save()

  const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${encodeURIComponent(token)}`
  return sendBrevoEmail({
    to: user.email,
    subject: 'Verify your Cacao Bakery email',
    message: `Verify your email using this link: ${verificationUrl}\nThis link expires in 24 hours.`,
  })
}

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })

    return res.status(200).json({ success: true, user: toProfileResponse(user) })
  } catch (error) {
    console.error('Get current user error:', error)
    return res.status(500).json({ success: false, message: 'Unable to fetch profile.' })
  }
}

export const updateMe = async (req, res) => {
  try {
    const body = req.body || {}
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ success: false, message: 'Name must be between 2 and 100 characters.' })
      }
      user.name = name
    }

    if (body.phone !== undefined) {
      user.phone = String(body.phone).trim() || null
    }

    let emailChanged = false
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email)
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'A valid email is required.' })
      }

      if (email !== user.email) {
        const existingUser = await User.findOne({ email }).select('_id')
        if (existingUser) {
          return res.status(409).json({ success: false, message: 'An account with this email already exists.' })
        }
        user.email = email
        user.isEmailVerified = false
        emailChanged = true
      }
    }

    await user.save()
    let verificationEmailSent = false
    if (emailChanged) {
      try {
        verificationEmailSent = await sendVerificationEmail(user)
      } catch (error) {
        console.error('Updated email verification delivery failed:', error)
      }
    }

    return res.status(200).json({
      success: true,
      user: toProfileResponse(user),
      ...(emailChanged ? { verificationEmailSent } : {}),
    })
  } catch (error) {
    console.error('Update current user error:', error)
    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.name === 'ValidationError' ? 'Invalid profile details.' : 'Unable to update profile.',
    })
  }
}

export const getMyAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses')
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })
    return res.status(200).json({ success: true, addresses: user.addresses.map(toAddressResponse) })
  } catch (error) {
    console.error('Get saved addresses error:', error)
    return res.status(500).json({ success: false, message: 'Unable to fetch addresses.' })
  }
}

export const createMyAddress = async (req, res) => {
  try {
    const body = req.body || {}
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })

    const isDefault = body.isDefault === true || body.default === true || user.addresses.length === 0
    if (isDefault) user.addresses.forEach((address) => { address.isDefault = false })
    user.addresses.push({ ...getAddressInput(body), isDefault })
    await user.save()

    return res.status(201).json({
      success: true,
      address: toAddressResponse(user.addresses[user.addresses.length - 1]),
    })
  } catch (error) {
    console.error('Create saved address error:', error)
    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.name === 'ValidationError' ? 'Invalid address details.' : 'Unable to save address.',
    })
  }
}

export const updateMyAddress = async (req, res) => {
  try {
    const body = req.body || {}
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })

    const address = user.addresses.id(req.params.id)
    if (!address) return res.status(404).json({ success: false, message: 'Address not found.' })

    const isDefault = body.isDefault ?? body.default
    if (isDefault !== undefined && typeof isDefault !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isDefault must be a boolean.' })
    }

    if (isDefault === true) {
      user.addresses.forEach((entry) => { entry.isDefault = false })
    }
    Object.assign(address, getAddressInput(body))
    if (isDefault !== undefined) address.isDefault = isDefault
    await user.save()

    return res.status(200).json({ success: true, address: toAddressResponse(address) })
  } catch (error) {
    console.error('Update saved address error:', error)
    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: error.name === 'ValidationError' ? 'Invalid address details.' : 'Unable to update address.',
    })
  }
}

export const deleteMyAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })

    const address = user.addresses.id(req.params.id)
    if (!address) return res.status(404).json({ success: false, message: 'Address not found.' })
    const wasDefault = address.isDefault
    user.addresses.pull(address._id)
    if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true
    await user.save()

    return res.status(200).json({ success: true, message: 'Address deleted.' })
  } catch (error) {
    console.error('Delete saved address error:', error)
    return res.status(500).json({ success: false, message: 'Unable to delete address.' })
  }
}