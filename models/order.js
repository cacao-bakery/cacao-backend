import mongoose from 'mongoose'

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    image: {
      type: String,
      default: '',
    },
  },
  {
    _id: false,
  },
)

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    customer: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
      },
    },

    delivery: {
      method: {
        type: String,
        enum: ['delivery', 'pickup'],
        default: 'delivery',
      },

      address: {
        type: String,
        default: '',
        trim: true,
      },

      city: {
        type: String,
        default: '',
        trim: true,
      },

      state: {
        type: String,
        default: '',
        trim: true,
      },

      pincode: {
        type: String,
        default: '',
        trim: true,
      },

      preferredDate: {
        type: String,
        default: '',
        trim: true,
      },

      preferredTime: {
        type: String,
        default: '',
        trim: true,
      },
    },

    notes: {
      type: String,
      default: '',
      trim: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,

      validate: {
        validator: (items) => items.length > 0,
        message: 'Order must contain at least one item',
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    payment: {
      method: {
        type: String,
        enum: ['upi', 'whatsapp'],
        required: true,
      },

      transactionId: {
        type: String,
        trim: true,
        default: '',
      },

      status: {
        type: String,
        enum: [
          'pending',
          'submitted',
          'verified',
          'failed',
        ],
        default: 'pending',
      },
    },

    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  },
)

const Order = mongoose.model('Order', orderSchema)

export default Order