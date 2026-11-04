import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { AttendanceService } from '../modules/attendance/attendance.service.js'
import type { NextFunction, Request, Response } from 'express'

export const attendanceRouter = Router()
attendanceRouter.use(authenticate)

type AuthedRequest = Request & { user: { userId: string; role: string } }
const who = (req: Request): { userId: string; role: string } => (req as unknown as AuthedRequest).user

attendanceRouter.post('/clock-in', requireRole('STAFF', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = who(req)
    res.status(201).json({ data: await AttendanceService.clockIn(userId, role) })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.post('/clock-out', requireRole('STAFF', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = who(req)
    res.status(200).json({ data: await AttendanceService.clockOut(userId, role) })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = who(req)
    const scope = String(req.query.scope ?? 'mine')
    res.status(200).json({ data: { records: await AttendanceService.list(userId, role, scope) } })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = who(req)
    const body = (req.body ?? {}) as { timeIn?: string; timeOut?: string | null }
    res.status(200).json({
      data: await AttendanceService.correct(userId, role, String(req.params.id), body),
    })
  } catch (error) {
    next(error)
  }
})
