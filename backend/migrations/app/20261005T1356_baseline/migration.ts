#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b1d40866a8c3334efb0c1a81b8f63f24422643f3541e3e5f9f1870e6aa0ebe64/contract';
import endContract from '../../snapshots/b1d40866a8c3334efb0c1a81b8f63f24422643f3541e3e5f9f1870e6aa0ebe64/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'account_role',
        members: ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'account_status',
        members: ['ACTIVE', 'DEACTIVATED'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'appointment_status',
        members: ['RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'employment_type',
        members: ['FULL_TIME', 'PART_TIME'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'payment_method',
        members: ['CASH', 'GCASH'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'payment_status',
        members: ['UNVERIFIED', 'VERIFIED', 'REJECTED'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'schedule_request_status',
        members: ['PENDING', 'APPROVED', 'REJECTED'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'staff_work_status',
        members: ['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE'],
      }),
      this.createTable({
        schema: 'public',
        table: 'accounts',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('password_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', '"account_role"', {
            notNull: true,
            default: lit('CUSTOMER'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'account_role' } },
          }),
          col('status', '"account_status"', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'account_status' } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'accounts_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'appointment_services',
        columns: [
          col('appointment_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('duration_minutes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('price', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('service_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('service_name', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'appointment_services_pkey' }),
          checkExpression('appointment_service_duration_positive', '(duration_minutes > 0)'),
          checkExpression('appointment_service_price_positive', '(price >= (0)::numeric)'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'appointments',
        columns: [
          col('appointment_code', 'character varying(6)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 6 } },
          }),
          col('appointment_date', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('customer_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('end_time', 'time', { notNull: true, codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('start_time', 'time', { notNull: true, codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('status', '"appointment_status"', {
            notNull: true,
            default: lit('RESERVED'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'appointment_status' } },
          }),
          col('total_amount', 'numeric(10,2)', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'appointments_pkey' }),
          checkExpression('valid_appointment_amount', '(total_amount >= (0)::numeric)'),
          checkExpression('valid_appointment_time', '(start_time < end_time)'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'audit_logs',
        columns: [
          col('action', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('actor_account_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entity_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('entity_type', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('new_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('old_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'audit_logs_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'business_hours',
        columns: [
          col('close_time', 'time', { codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('day_of_week', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_open', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('open_time', 'time', { codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'business_hours_pkey' }),
          checkExpression(
            'valid_business_time',
            '((is_open = false) OR ((open_time IS NOT NULL) AND (close_time IS NOT NULL) AND (open_time < close_time)))',
          ),
          checkExpression('valid_day_of_week', '((day_of_week >= 0) AND (day_of_week <= 6))'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'customers',
        columns: [
          col('account_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('first_name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('gender', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('last_name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('phone', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'customers_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'payments',
        columns: [
          col('amount', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('appointment_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('payment_method', '"payment_method"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'payment_method' } },
          }),
          col('status', '"payment_status"', {
            notNull: true,
            default: lit('UNVERIFIED'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'payment_status' } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('verified_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('verified_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'payments_pkey' }),
          checkExpression('payment_amount_positive', '(amount >= (0)::numeric)'),
          checkExpression(
            'valid_verified_payment',
            "((status <> 'VERIFIED'::payment_status) OR ((verified_by IS NOT NULL) AND (verified_at IS NOT NULL)))",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'reviews',
        columns: [
          col('appointment_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('comment', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('customer_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('rating', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'reviews_pkey' }),
          checkExpression('valid_rating', '((rating >= 1) AND (rating <= 5))'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'schedule_requests',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('request_type', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('requested_date', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('requested_end_time', 'time', { codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('requested_start_time', 'time', { codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('reviewed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewed_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('staff_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', '"schedule_request_status"', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'schedule_request_status' } },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'schedule_requests_pkey' }),
          checkExpression(
            'valid_requested_time',
            '(((requested_start_time IS NULL) AND (requested_end_time IS NULL)) OR ((requested_start_time IS NOT NULL) AND (requested_end_time IS NOT NULL) AND (requested_start_time < requested_end_time)))',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'service_categories',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'service_categories_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'services',
        columns: [
          col('category_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duration_minutes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('price', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'services_pkey' }),
          checkExpression('service_duration_positive', '(duration_minutes > 0)'),
          checkExpression('service_price_positive', '(price >= (0)::numeric)'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'staff',
        columns: [
          col('account_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('employment_type', '"employment_type"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'employment_type' } },
          }),
          col('first_name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('last_name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('phone', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('primary_role', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('work_status', '"staff_work_status"', {
            notNull: true,
            default: lit('DAY_OFF'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'staff_work_status' } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'staff_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'staff_schedules',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('day_of_week', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_until', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('end_time', 'time', { notNull: true, codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('staff_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('start_time', 'time', { notNull: true, codecRef: { codecId: 'pg/time-temporal@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'staff_schedules_pkey' }),
          checkExpression(
            'valid_schedule_dates',
            '((effective_until IS NULL) OR (effective_until >= effective_from))',
          ),
          checkExpression('valid_schedule_day', '((day_of_week >= 0) AND (day_of_week <= 6))'),
          checkExpression('valid_staff_schedule_time', '(start_time < end_time)'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'staff_services',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('service_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('staff_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['staff_id', 'service_id'], { name: 'staff_services_pkey' })],
      }),
      this.addUnique({
        schema: 'public',
        table: 'accounts',
        constraint: 'accounts_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'appointment_services',
        constraint: 'unique_appointment_service',
        columns: ['appointment_id', 'service_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'appointments',
        constraint: 'appointments_appointment_code_key',
        columns: ['appointment_code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'business_hours',
        constraint: 'unique_business_day',
        columns: ['day_of_week'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_account_id_key',
        columns: ['account_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_appointment_id_key',
        columns: ['appointment_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'reviews',
        constraint: 'reviews_appointment_id_key',
        columns: ['appointment_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'service_categories',
        constraint: 'service_categories_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'staff',
        constraint: 'staff_account_id_key',
        columns: ['account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'accounts',
        index: 'idx_accounts_role',
        columns: ['role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'accounts',
        index: 'idx_accounts_status',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointment_services',
        index: 'idx_appointment_services_appointment_id',
        columns: ['appointment_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointments',
        index: 'idx_appointments_customer_id',
        columns: ['customer_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointments',
        index: 'idx_appointments_date',
        columns: ['appointment_date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointments',
        index: 'idx_appointments_date_time',
        columns: ['appointment_date', 'start_time', 'end_time'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointments',
        index: 'idx_appointments_status',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'idx_audit_logs_actor',
        columns: ['actor_account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'idx_audit_logs_created_at',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'idx_audit_logs_entity',
        columns: ['entity_type', 'entity_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'customers',
        index: 'idx_customers_account_id',
        columns: ['account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'idx_payments_created_at',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'idx_payments_status',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reviews',
        index: 'idx_reviews_customer_id',
        columns: ['customer_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'schedule_requests',
        index: 'idx_schedule_requests_staff_id',
        columns: ['staff_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'schedule_requests',
        index: 'idx_schedule_requests_status',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'services',
        index: 'idx_services_active',
        columns: ['is_active'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'services',
        index: 'idx_services_category_id',
        columns: ['category_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff',
        index: 'idx_staff_account_id',
        columns: ['account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff',
        index: 'idx_staff_work_status',
        columns: ['work_status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_schedules',
        index: 'idx_staff_schedules_staff_id',
        columns: ['staff_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_services',
        index: 'idx_staff_services_service_id',
        columns: ['service_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'appointment_services',
        foreignKey: {
          name: 'fk_appointment_service_appointment',
          columns: ['appointment_id'],
          references: { schema: 'public', table: 'appointments', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'appointment_services',
        foreignKey: {
          name: 'fk_appointment_service_service',
          columns: ['service_id'],
          references: { schema: 'public', table: 'services', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'appointments',
        foreignKey: {
          name: 'fk_appointment_customer',
          columns: ['customer_id'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'audit_logs',
        foreignKey: {
          name: 'fk_audit_actor',
          columns: ['actor_account_id'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'customers',
        foreignKey: {
          name: 'fk_customer_account',
          columns: ['account_id'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'fk_payment_appointment',
          columns: ['appointment_id'],
          references: { schema: 'public', table: 'appointments', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'fk_payment_verifier',
          columns: ['verified_by'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reviews',
        foreignKey: {
          name: 'fk_review_appointment',
          columns: ['appointment_id'],
          references: { schema: 'public', table: 'appointments', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reviews',
        foreignKey: {
          name: 'fk_review_customer',
          columns: ['customer_id'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'schedule_requests',
        foreignKey: {
          name: 'fk_schedule_request_reviewer',
          columns: ['reviewed_by'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'schedule_requests',
        foreignKey: {
          name: 'fk_schedule_request_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'services',
        foreignKey: {
          name: 'fk_service_category',
          columns: ['category_id'],
          references: { schema: 'public', table: 'service_categories', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff',
        foreignKey: {
          name: 'fk_staff_account',
          columns: ['account_id'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_schedules',
        foreignKey: {
          name: 'fk_staff_schedule_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_services',
        foreignKey: {
          name: 'fk_staff_services_service',
          columns: ['service_id'],
          references: { schema: 'public', table: 'services', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_services',
        foreignKey: {
          name: 'fk_staff_services_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'accounts' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'appointment_services' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'appointments' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'audit_logs' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'business_hours' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'customers' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'payments' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'reviews' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'schedule_requests' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'service_categories' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'services' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'staff' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'staff_schedules' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'staff_services' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
