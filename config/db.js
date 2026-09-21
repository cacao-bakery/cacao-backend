import mongoose from 'mongoose'

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not configured')
    }

    const connection = await mongoose.connect(process.env.MONGODB_URI)

    try {
      await connection.connection.collection('users').dropIndex('phone_1')
      console.log('Dropped stale unique phone index from users collection')
    } catch (indexError) {
      if (indexError?.codeName !== 'IndexNotFound') {
        console.warn('Phone index cleanup warning:', indexError.message)
      }
    }

    console.log(
      `MongoDB connected: ${connection.connection.host}`
    )
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

export default connectDB