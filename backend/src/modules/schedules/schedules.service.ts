import { db } from '../../prisma/db.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';

interface TxContext {
  orm: typeof db.orm;
}

// Time validation helper
function validateTimeFormat(time: string): void {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new BadRequestError('Time must be in HH:MM format (e.g., 09:00, 17:30)');
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new BadRequestError('Invalid time value');
  }
}

function validateDayOfWeek(day: number): void {
  if (day < 1 || day > 7) {
    throw new BadRequestError('dayOfWeek must be between 1 (Monday) and 7 (Sunday)');
  }
}

function parseDatetime(str: string): Date {
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    throw new BadRequestError('Invalid datetime format');
  }
  return date;
}

// Check if two time ranges overlap
function timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  // Convert to minutes since midnight for comparison
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);

  // Ranges overlap if one starts before the other ends
  return s1 < e2 && s2 < e1;
}

// Check if two date ranges overlap
function dateRangesOverlap(
  effectiveFrom1: Date,
  effectiveUntil1: Date | null,
  effectiveFrom2: Date,
  effectiveUntil2: Date | null
): boolean {
  const start1 = effectiveFrom1;
  const end1 = effectiveUntil1 ?? new Date(8640000000000000); // Max safe date if null
  const start2 = effectiveFrom2;
  const end2 = effectiveUntil2 ?? new Date(8640000000000000);

  // Ranges overlap if one starts before the other ends
  return start1 < end2 && start2 < end1;
}

export interface BusinessHoursInfo {
  id: string;
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffScheduleInfo {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleRequestInfo {
  id: string;
  staffId: string;
  requestedDate: Date;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  requestType: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export class SchedulesService {
  // ============================================================
  // Business Hours
  // ============================================================

  /** Get all business hours */
  static async getBusinessHours(requestingRole: string): Promise<BusinessHoursInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view business hours');
    }

    const hours = await db.orm.public.BusinessHour.orderBy((b) => b.dayOfWeek.asc()).all();
    return hours.map((h) => ({
      id: h.id,
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isOpen: h.isOpen,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    }));
  }

  /** Replace entire business hours configuration atomically */
  static async replaceBusinessHours(
    days: { dayOfWeek: number; openTime: string; closeTime: string; isOpen: boolean }[],
    requestingUserId: string
  ): Promise<BusinessHoursInfo[]> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can manage business hours');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can manage business hours');
    }

    // Validate input
    if (days.length !== 7) {
      throw new BadRequestError('Exactly 7 days of business hours are required');
    }

    const dayNumbers = days.map((d) => d.dayOfWeek);
    const uniqueDays = new Set(dayNumbers);
    if (uniqueDays.size !== 7) {
      throw new BadRequestError('Duplicate dayOfWeek values are not allowed');
    }

    for (const day of days) {
      validateDayOfWeek(day.dayOfWeek);
      validateTimeFormat(day.openTime);
      validateTimeFormat(day.closeTime);

      if (day.isOpen) {
        // Validate open < close when open
        if (day.openTime >= day.closeTime) {
          throw new BadRequestError('openTime must be before closeTime when isOpen is true');
        }
      }
    }

    // Use transaction for atomic replacement
    let result: BusinessHoursInfo[];
    try {
      await db.transaction(async (tx: TxContext) => {
        // Delete all existing business hours
        await tx.orm.public.BusinessHour.where({}).delete();

        // Insert new business hours
        for (const day of days) {
          await tx.orm.public.BusinessHour.create({
            dayOfWeek: day.dayOfWeek,
            openTime: day.openTime,
            closeTime: day.closeTime,
            isOpen: day.isOpen,
          });
        }
      });

      // Fetch and return the updated business hours
      result = await this.getBusinessHours(requestingUserId);
    } catch (error) {
      throw new BadRequestError(`Failed to replace business hours: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'REPLACE_BUSINESS_HOURS',
      entityType: 'BusinessHour',
      newData: days as unknown as Record<string, unknown>,
    });

    return result;
  }

  // ============================================================
  // Staff Schedules
  // ============================================================

  /** Check for schedule conflicts for a staff member on a specific day */
  static async checkScheduleConflict(
    staffId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    effectiveFrom: Date,
    effectiveUntil: Date | null,
    excludeScheduleId?: string
  ): Promise<void> {
    const existingSchedules = await db.orm.public.StaffSchedule
      .where({
        staffId,
        dayOfWeek,
        isActive: true,
      })
      .all();

    for (const schedule of existingSchedules) {
      // Skip the schedule being updated
      if (excludeScheduleId && schedule.id === excludeScheduleId) {
        continue;
      }

      // Check time overlap
      if (timeRangesOverlap(startTime, endTime, schedule.startTime, schedule.endTime)) {
        // Check effective date overlap
        if (dateRangesOverlap(
          effectiveFrom,
          effectiveUntil,
          schedule.effectiveFrom,
          schedule.effectiveUntil
        )) {
          throw new ConflictError('Schedule conflict: overlapping time range for this staff member on this day');
        }
      }
    }
  }

  /** Get all staff schedules */
  static async getAllStaffSchedules(requestingRole: string): Promise<StaffScheduleInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view all staff schedules');
    }

    const schedules = await db.orm.public.StaffSchedule.orderBy((s) => s.dayOfWeek.asc()).all();
    return schedules.map((s) => ({
      id: s.id,
      staffId: s.staffId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: s.effectiveFrom,
      effectiveUntil: s.effectiveUntil,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /** Get staff schedules by staff ID */
  static async getStaffSchedulesById(
    staffId: string,
    requestingUserId: string,
    requestingRole: string
  ): Promise<StaffScheduleInfo[]> {
    // STAFF can only view their own schedules
    if (requestingRole === 'STAFF' && staffId !== requestingUserId) {
      throw new ForbiddenError('You can only view your own schedules');
    }

    // Verify staff exists
    const staff = await db.orm.public.Staff.where({ id: staffId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    const schedules = await db.orm.public.StaffSchedule
      .where({ staffId })
      .orderBy((s) => s.dayOfWeek.asc())
      .all();

    return schedules.map((s) => ({
      id: s.id,
      staffId: s.staffId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: s.effectiveFrom,
      effectiveUntil: s.effectiveUntil,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /** Get own schedules (for STAFF) */
  static async getMySchedules(userId: string): Promise<StaffScheduleInfo[]> {
    const schedules = await db.orm.public.StaffSchedule
      .where({ staffId: userId })
      .orderBy((s) => s.dayOfWeek.asc())
      .all();

    return schedules.map((s) => ({
      id: s.id,
      staffId: s.staffId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: s.effectiveFrom,
      effectiveUntil: s.effectiveUntil,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /** Create a staff schedule */
  static async createStaffSchedule(
    data: {
      staffId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      isActive: boolean;
    },
    requestingUserId: string
  ): Promise<StaffScheduleInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can create staff schedules');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can create staff schedules');
    }

    // Validate input
    validateDayOfWeek(data.dayOfWeek);
    validateTimeFormat(data.startTime);
    validateTimeFormat(data.endTime);

    if (data.startTime >= data.endTime) {
      throw new BadRequestError('startTime must be before endTime');
    }

    const effectiveFromDate = parseDatetime(data.effectiveFrom);
    if (effectiveFromDate <= new Date()) {
      throw new BadRequestError('effectiveFrom must be in the future');
    }

    let effectiveUntilDate: Date | null = null;
    if (data.effectiveUntil) {
      effectiveUntilDate = parseDatetime(data.effectiveUntil);
      if (effectiveUntilDate <= effectiveFromDate) {
        throw new BadRequestError('effectiveUntil must be after effectiveFrom');
      }
    }

    // Verify staff exists and check DAY_OFF status
    const staff = await db.orm.public.Staff.where({ id: data.staffId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // DAY_OFF check: Don't allow active schedules when staff is DAY_OFF
    // Note: The existing schema has no DAY_OFF expiry mechanism.
    // We can only check the current workStatus at the time of schedule creation.
    // If the staff member is currently DAY_OFF, we reject.
    // There is no way to represent an "expiry" for DAY_OFF in the current schema.
    if (staff.workStatus === 'DAY_OFF' && data.isActive) {
      throw new BadRequestError('Cannot create an active schedule for a staff member who is currently on DAY_OFF. The staff member\'s work status must be ON_DUTY or UNAVAILABLE.');
    }

    // Check for schedule conflicts
    await this.checkScheduleConflict(
      data.staffId,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      effectiveFromDate,
      effectiveUntilDate
    );

    const schedule = await db.orm.public.StaffSchedule.create({
      staffId: data.staffId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      effectiveFrom: effectiveFromDate,
      effectiveUntil: effectiveUntilDate,
      isActive: data.isActive,
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_STAFF_SCHEDULE',
      entityType: 'StaffSchedule',
      entityId: schedule.id,
      newData: {
        staffId: schedule.staffId,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        effectiveFrom: schedule.effectiveFrom,
        effectiveUntil: schedule.effectiveUntil,
        isActive: schedule.isActive,
      },
    });

    return {
      id: schedule.id,
      staffId: schedule.staffId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      effectiveFrom: schedule.effectiveFrom,
      effectiveUntil: schedule.effectiveUntil,
      isActive: schedule.isActive,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  /** Update a staff schedule */
  static async updateStaffSchedule(
    scheduleId: string,
    data: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      isActive?: boolean;
    },
    requestingUserId: string
  ): Promise<StaffScheduleInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can update staff schedules');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can update staff schedules');
    }

    const schedule = await db.orm.public.StaffSchedule.where({ id: scheduleId }).first();
    if (!schedule) {
      throw new NotFoundError('Staff schedule not found');
    }

    // Determine the effective values (use existing if not provided)
    const dayOfWeek = data.dayOfWeek ?? schedule.dayOfWeek;
    const startTime = data.startTime ?? schedule.startTime;
    const endTime = data.endTime ?? schedule.endTime;
    const effectiveFromDate = data.effectiveFrom ? parseDatetime(data.effectiveFrom) : schedule.effectiveFrom;
    const effectiveUntilDate = data.effectiveUntil !== undefined
      ? data.effectiveUntil === null ? null : parseDatetime(data.effectiveUntil)
      : schedule.effectiveUntil;
    const isActive = data.isActive ?? schedule.isActive;

    // Validate
    validateDayOfWeek(dayOfWeek);
    validateTimeFormat(startTime);
    validateTimeFormat(endTime);

    if (startTime >= endTime) {
      throw new BadRequestError('startTime must be before endTime');
    }

    if (effectiveFromDate <= new Date()) {
      throw new BadRequestError('effectiveFrom must be in the future');
    }

    if (effectiveUntilDate && effectiveUntilDate <= effectiveFromDate) {
      throw new BadRequestError('effectiveUntil must be after effectiveFrom');
    }

    // Check DAY_OFF status for active schedules
    if (isActive) {
      const staff = await db.orm.public.Staff.where({ id: schedule.staffId }).first();
      if (staff && staff.workStatus === 'DAY_OFF') {
        throw new BadRequestError('Cannot activate a schedule for a staff member who is currently on DAY_OFF.');
      }
    }

    // Check for conflicts (excluding current schedule)
    await this.checkScheduleConflict(
      schedule.staffId,
      dayOfWeek,
      startTime,
      endTime,
      effectiveFromDate,
      effectiveUntilDate,
      scheduleId
    );

    const updated = await db.orm.public.StaffSchedule.where({ id: scheduleId }).update({
      dayOfWeek,
      startTime,
      endTime,
      effectiveFrom: effectiveFromDate,
      effectiveUntil: effectiveUntilDate,
      isActive,
    });

    if (!updated) {
      throw new NotFoundError('Staff schedule not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_STAFF_SCHEDULE',
      entityType: 'StaffSchedule',
      entityId: scheduleId,
      oldData: {
        staffId: schedule.staffId,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        effectiveFrom: schedule.effectiveFrom,
        effectiveUntil: schedule.effectiveUntil,
        isActive: schedule.isActive,
      },
      newData: {
        staffId: schedule.staffId,
        dayOfWeek,
        startTime,
        endTime,
        effectiveFrom: effectiveFromDate,
        effectiveUntil: effectiveUntilDate,
        isActive,
      },
    });

    return {
      id: updated.id,
      staffId: updated.staffId,
      dayOfWeek: updated.dayOfWeek,
      startTime: updated.startTime,
      endTime: updated.endTime,
      effectiveFrom: updated.effectiveFrom,
      effectiveUntil: updated.effectiveUntil,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /** Delete a staff schedule */
  static async deleteStaffSchedule(
    scheduleId: string,
    requestingUserId: string
  ): Promise<void> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can delete staff schedules');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can delete staff schedules');
    }

    const schedule = await db.orm.public.StaffSchedule.where({ id: scheduleId }).first();
    if (!schedule) {
      throw new NotFoundError('Staff schedule not found');
    }

    await db.orm.public.StaffSchedule.where({ id: scheduleId }).delete();

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'DELETE_STAFF_SCHEDULE',
      entityType: 'StaffSchedule',
      entityId: scheduleId,
      oldData: {
        staffId: schedule.staffId,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      },
    });
  }

  // ============================================================
  // Schedule Requests
  // ============================================================

  /** Get all schedule requests */
  static async getAllScheduleRequests(requestingRole: string): Promise<ScheduleRequestInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view all schedule requests');
    }

    const requests = await db.orm.public.ScheduleRequest
      .orderBy((r) => r.createdAt.desc())
      .all();

    return requests.map((r) => this.mapScheduleRequest(r));
  }

  /** Get schedule request by ID */
  static async getScheduleRequestById(
    requestId: string,
    requestingUserId: string,
    requestingRole: string
  ): Promise<ScheduleRequestInfo> {
    const request = await db.orm.public.ScheduleRequest.where({ id: requestId }).first();
    if (!request) {
      throw new NotFoundError('Schedule request not found');
    }

    // Validate access
    if (requestingRole === 'STAFF' && request.staffId !== requestingUserId) {
      throw new ForbiddenError('You can only view your own schedule requests');
    }

    return this.mapScheduleRequest(request);
  }

  /** Get own schedule requests (for STAFF) */
  static async getMyScheduleRequests(userId: string): Promise<ScheduleRequestInfo[]> {
    const requests = await db.orm.public.ScheduleRequest
      .where({ staffId: userId })
      .orderBy((r) => r.createdAt.desc())
      .all();

    return requests.map((r) => this.mapScheduleRequest(r));
  }

  /** Create a schedule request (STAFF only) */
  static async createScheduleRequest(
    data: {
      requestedDate: string;
      requestedStartTime?: string;
      requestedEndTime?: string;
      requestType: string;
      reason?: string;
    },
    requestingUserId: string
  ): Promise<ScheduleRequestInfo> {
    // Verify the user is a staff member
    const staff = await db.orm.public.Staff.where({ accountId: requestingUserId }).first();
    if (!staff) {
      throw new NotFoundError('No staff profile found for this account');
    }

    // Validate input
    const requestedDate = parseDatetime(data.requestedDate);
    if (requestedDate <= new Date()) {
      throw new BadRequestError('requestedDate must be in the future');
    }

    if (data.requestedStartTime) {
      validateTimeFormat(data.requestedStartTime);
    }
    if (data.requestedEndTime) {
      validateTimeFormat(data.requestedEndTime);
    }

    if (data.requestedStartTime && data.requestedEndTime && data.requestedStartTime >= data.requestedEndTime) {
      throw new BadRequestError('requestedStartTime must be before requestedEndTime');
    }

    const request = await db.orm.public.ScheduleRequest.create({
      staffId: staff.id,
      requestedDate: requestedDate,
      requestedStartTime: data.requestedStartTime ?? null,
      requestedEndTime: data.requestedEndTime ?? null,
      requestType: data.requestType,
      reason: data.reason ?? null,
      status: 'PENDING',
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_SCHEDULE_REQUEST',
      entityType: 'ScheduleRequest',
      entityId: request.id,
      newData: {
        staffId: request.staffId,
        requestedDate: request.requestedDate,
        requestType: request.requestType,
        status: request.status,
      },
    });

    return this.mapScheduleRequest(request);
  }

  /** Approve a schedule request */
  static async approveScheduleRequest(
    requestId: string,
    requestingUserId: string
  ): Promise<ScheduleRequestInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can approve schedule requests');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can approve schedule requests');
    }

    const request = await db.orm.public.ScheduleRequest.where({ id: requestId }).first();
    if (!request) {
      throw new NotFoundError('Schedule request not found');
    }

    // Only PENDING requests can be approved
    if (request.status !== 'PENDING') {
      throw new ConflictError('Only PENDING requests can be approved');
    }

    // Cannot approve own request
    if (request.staffId === requestingUserId) {
      throw new ForbiddenError('You cannot approve your own schedule request');
    }

    const now = new Date();
    const updated = await db.orm.public.ScheduleRequest.where({ id: requestId }).update({
      status: 'APPROVED',
      reviewedBy: requestingUserId,
      reviewedAt: now,
    });

    if (!updated) {
      throw new NotFoundError('Schedule request not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'APPROVE_SCHEDULE_REQUEST',
      entityType: 'ScheduleRequest',
      entityId: requestId,
      oldData: { status: request.status },
      newData: { status: 'APPROVED', reviewedBy: requestingUserId, reviewedAt: now },
    });

    return this.mapScheduleRequest(updated);
  }

  /** Reject a schedule request */
  static async rejectScheduleRequest(
    requestId: string,
    requestingUserId: string
  ): Promise<ScheduleRequestInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can reject schedule requests');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can reject schedule requests');
    }

    const request = await db.orm.public.ScheduleRequest.where({ id: requestId }).first();
    if (!request) {
      throw new NotFoundError('Schedule request not found');
    }

    // Only PENDING requests can be rejected
    if (request.status !== 'PENDING') {
      throw new ConflictError('Only PENDING requests can be rejected');
    }

    // Cannot reject own request
    if (request.staffId === requestingUserId) {
      throw new ForbiddenError('You cannot reject your own schedule request');
    }

    const now = new Date();
    const updated = await db.orm.public.ScheduleRequest.where({ id: requestId }).update({
      status: 'REJECTED',
      reviewedBy: requestingUserId,
      reviewedAt: now,
    });

    if (!updated) {
      throw new NotFoundError('Schedule request not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'REJECT_SCHEDULE_REQUEST',
      entityType: 'ScheduleRequest',
      entityId: requestId,
      oldData: { status: request.status },
      newData: { status: 'REJECTED', reviewedBy: requestingUserId, reviewedAt: now },
    });

    return this.mapScheduleRequest(updated);
  }

  // ============================================================
  // Mapping helpers
  // ============================================================

  private static mapScheduleRequest(request: {
    id: string;
    staffId: string;
    requestedDate: Date;
    requestedStartTime: string | null;
    requestedEndTime: string | null;
    requestType: string;
    reason: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }): ScheduleRequestInfo {
    return {
      id: request.id,
      staffId: request.staffId,
      requestedDate: request.requestedDate,
      requestedStartTime: request.requestedStartTime,
      requestedEndTime: request.requestedEndTime,
      requestType: request.requestType,
      reason: request.reason,
      status: request.status,
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
    };
  }
}
