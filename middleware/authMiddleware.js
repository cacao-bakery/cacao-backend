import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Please login.',
      })
    }

    const token = authorization.split(' ')[1]

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    )

    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      })
    }

    req.user = user

    next()
  } catch (error) {
    console.error('AUTH ERROR:', error.message)

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    })
  }
}

export const requireAdminOrManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    })
  }

  const role = String(req.user.role || '').toLowerCase()

  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or manager privileges required.',
    })
  }

  next()
}