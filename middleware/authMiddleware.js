import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
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
        message: 'User no longer exists.',
      })
    }

    req.user = user

    next()
  } catch (error) {
    console.error('AUTH ERROR:', error.message)

    return res.status(401).json({
      message: 'Invalid or expired token.',
    })
  }
}