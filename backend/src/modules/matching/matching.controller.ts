import type { Request, Response } from 'express'
import { BadRequestError } from '../../errors/index.js'
import { matchStaff } from './matching.service.js'

/**
 * GET /matching?serviceIds=a,b&date=YYYY-MM-DD&startTime=HH:MM
 */
export async function matchStaffController(req: Request, res: Response): Promise<void> {
  const serviceIds = String(req.query.serviceIds ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const date = String(req.query.date ?? '')
  const startTime = String(req.query.startTime ?? '')
  if (serviceIds.length === 0) throw new BadRequestError('serviceIds is required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestError('date must be YYYY-MM-DD')
  if (!/^\d{2}:\d{2}$/.test(startTime)) throw new BadRequestError('startTime must be HH:MM')
  const result = await matchStaff({ serviceIds, date, startTime })
  res.status(200).json({ data: result })
}
