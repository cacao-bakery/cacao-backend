export const authorizeAdmin = (req, res, next) => {
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
