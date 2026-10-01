import express from 'express'
import {
  createMyAddress,
  deleteMyAddress,
  getMe,
  getMyAddresses,
  updateMe,
  updateMyAddress,
} from '../controller/customerController.js'
import { protect } from '../middleware/authMiddleware.js'

const router = express.Router()

router.use(protect)
router.get('/', getMe)
router.put('/', updateMe)
router.get('/addresses', getMyAddresses)
router.post('/addresses', createMyAddress)
router.put('/addresses/:id', updateMyAddress)
router.delete('/addresses/:id', deleteMyAddress)

export default router