import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { matchStaffController } from '../modules/matching/matching.controller.js'

export const matchingRouter = Router()

// Any signed-in customer may ask for recommendations while booking.
matchingRouter.use(authenticate)
matchingRouter.get('/', matchStaffController)
