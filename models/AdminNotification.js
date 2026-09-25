import mongoose from 'mongoose'

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['new_order', 'payment_submitted', 'payment_verified', 'order_status', 'low_stock'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      default: '',
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
)

adminNotificationSchema.index({ createdAt: -1 })

export default mongoose.model('AdminNotification', adminNotificationSchema)