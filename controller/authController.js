import User from '../models/User.js'
import generateToken from '../utils/generateToken.js'
import { createOneTimeToken, hashOneTimeToken } from '../utils/oneTimeTokens.js'
import { sendBrevoEmail } from '../utils/notifications.js'

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const sendVerificationEmail = (user, token) => {
  const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${encodeURIComponent(token)}`
  return sendBrevoEmail({
    to: user.email,
    subject: 'Verify your Cacao Bakery email',
    message: `Verify your email using this link: ${verificationUrl}\nThis link expires in 24 hours.`,
  })
}

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {}

    if (!name || !email || typeof password !== 'string') {
      return res.status(400).json({
        message: 'Name, email and password are required.',
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters.',
      })
    }

    const normalizedEmail = normalizeEmail(email)
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email is required.' })
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    })

    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      })
    }

    const { token, tokenHash } = createOneTimeToken()
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    })

    let verificationEmailSent = false
    try {
      verificationEmailSent = await sendVerificationEmail(user, token)
    } catch (error) {
      console.error('Registration verification email failed:', error)
    }

    return res.status(201).json({
      message: 'Account created successfully.',
      verificationEmailSent,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    })
  } catch (error) {
    console.error('REGISTER ERROR:', error)

    return res.status(500).json({
      message: 'Unable to create account.',
    })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.',
      })
    }

    const user = await User.findOne({
      email: normalizeEmail(email),
    }).select('+password')

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      })
    }

    const isPasswordValid = await user.comparePassword(password)

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      })
    }

    const token = generateToken(user._id)

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        isEmailVerified: user.isEmailVerified,
      },
    })
  } catch (error) {
    console.error('LOGIN ERROR:', error)

    return res.status(500).json({
      message: 'Unable to login.',
    })
  }
}

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      })
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        isEmailVerified: user.isEmailVerified,
      },
    })
  } catch (error) {
    console.error('PROFILE ERROR:', error)

    return res.status(500).json({
      message: 'Unable to fetch profile.',
    })
  }
}

export const forgotPassword = async (req, res) => {
  const email = normalizeEmail((req.body || {}).email)
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'A valid email is required.' })
  }

  try {
    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt')
    if (user) {
      const { token, tokenHash } = createOneTimeToken()
      user.passwordResetTokenHash = tokenHash
      user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
      await user.save()

      const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`
      try {
        await sendBrevoEmail({
          to: user.email,
          subject: 'Reset your Cacao Bakery password',
          message: `Reset your password using this link: ${resetUrl}\nThis link expires in 1 hour.`,
        })
      } catch (error) {
        console.error('Password reset email failed:', error)
      }
    }

    return res.status(202).json({
      success: true,
      message: 'If an account exists for that email, password reset instructions have been sent.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return res.status(500).json({ success: false, message: 'Unable to process password reset.' })
  }
}

export const resetPassword = async (req, res) => {
  const { token, password } = req.body || {}
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, message: 'A valid token and password of at least 8 characters are required.' })
  }

  try {
    const user = await User.findOne({
      passwordResetTokenHash: hashOneTimeToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+password +passwordChangedAt +passwordResetTokenHash +passwordResetExpiresAt')

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or expired.' })
    }

    user.password = password
    user.passwordChangedAt = new Date()
    user.passwordResetTokenHash = undefined
    user.passwordResetExpiresAt = undefined
    await user.save()

    return res.status(200).json({ success: true, message: 'Password reset successfully. Please log in again.' })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ success: false, message: 'Unable to reset password.' })
  }
}

export const verifyEmail = async (req, res) => {
  const { token } = req.body || {}
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ success: false, message: 'Verification token is required.' })
  }

  try {
    const user = await User.findOneAndUpdate(
      {
        emailVerificationTokenHash: hashOneTimeToken(token),
        emailVerificationExpiresAt: { $gt: new Date() },
        isEmailVerified: false,
      },
      {
        $set: { isEmailVerified: true },
        $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1 },
      },
      { new: true },
    ).select('_id email isEmailVerified')

    if (!user) {
      return res.status(400).json({ success: false, message: 'Verification token is invalid or expired.' })
    }

    return res.status(200).json({ success: true, isEmailVerified: user.isEmailVerified })
  } catch (error) {
    console.error('Email verification error:', error)
    return res.status(500).json({ success: false, message: 'Unable to verify email.' })
  }
}

export const resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt')
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' })
    if (user.isEmailVerified) {
      return res.status(200).json({ success: true, message: 'Email is already verified.', isEmailVerified: true })
    }

    const { token, tokenHash } = createOneTimeToken()
    user.emailVerificationTokenHash = tokenHash
    user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)
    await user.save()

    let verificationEmailSent = false
    try {
      verificationEmailSent = await sendVerificationEmail(user, token)
    } catch (error) {
      console.error('Resend verification email failed:', error)
    }

    return res.status(200).json({
      success: true,
      message: 'If email delivery is configured, a verification link has been sent.',
      verificationEmailSent,
      isEmailVerified: false,
    })
  } catch (error) {
    console.error('Resend verification error:', error)
    return res.status(500).json({ success: false, message: 'Unable to resend verification email.' })
  }
}