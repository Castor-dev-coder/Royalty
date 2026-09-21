// Audit log utility
import { db } from '../prisma/db.js';
import type { Contract } from '../prisma/contract.d.js';

export interface AuditParams {
  actorAccountId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

export async function generateAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.orm.public.AuditLog.create({
      actorAccountId: params.actorAccountId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldData: params.oldData ? JSON.parse(JSON.stringify(params.oldData)) : null,
      newData: params.newData ? JSON.parse(JSON.stringify(params.newData)) : null,
    });
  } catch (error) {
    // Audit logging should not break the main flow
    console.error('Failed to write audit log:', error);
  }
}
