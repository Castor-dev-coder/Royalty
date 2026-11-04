import type { Request, Response } from 'express'
import { listTeam } from './team.service.js'

/** GET /staff/team — public: display fields only, never contact details. */
export async function listTeamController(_req: Request, res: Response): Promise<void> {
  const staff = await listTeam()
  res.status(200).json({ data: { staff } })
}
