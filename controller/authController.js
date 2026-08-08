import User from '../models/User.js'
import generateToken from '../utils/generateToken.js'

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters.',
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existingUser = await User.findOne({
      email: normalizedEmail,
    })

    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      })
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    })

    return res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
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
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.',
      })
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
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
      },
    })
  } catch (error) {
    console.error('PROFILE ERROR:', error)

    return res.status(500).json({
      message: 'Unable to fetch profile.',
    })
  }
}