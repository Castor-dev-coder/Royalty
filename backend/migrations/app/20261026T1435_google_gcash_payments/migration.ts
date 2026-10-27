#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3aec5a97c479eb3cc479b1fde9ab9d2c61bef24a4f81b3f6d5e57db40eca2356/contract';
import endContract from '../../snapshots/3aec5a97c479eb3cc479b1fde9ab9d2c61bef24a4f81b3f6d5e57db40eca2356/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c7b3293465ca258d93a3f9dfe9f47ce1250d386d01ca29a5ee85ecac3b0f03fa/contract';
import startContract from '../../snapshots/c7b3293465ca258d93a3f9dfe9f47ce1250d386d01ca29a5ee85ecac3b0f03fa/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  placeholder,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'down_payment_kind',
        members: ['NONE', 'FIXED', 'PERCENT'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'payment_channel',
        members: ['ONLINE', 'IN_PERSON'],
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_appointment_id_key',
      }),
      this.createTable({
        schema: 'public',
        table: 'payment_settings',
        columns: [
          col('account_number_masked', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('down_payment_kind', '"down_payment_kind"', {
            notNull: true,
            default: lit('PERCENT'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'down_payment_kind' } },
          }),
          col('down_payment_value', 'numeric(10,2)', {
            notNull: true,
            default: fn('50'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('gcash_qr_storage_path', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('gcash_qr_url', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('receiver_name', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'payment_settings_pkey' }),
          checkExpression(
            'payment_settings_value_positive',
            '(down_payment_value >= (0)::numeric)',
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'accounts',
        column: col('google_id', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('proof_storage_path', 'character varying(500)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('proof_url', 'character varying(500)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('recorded_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('reference_no', 'character varying(100)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('channel', '"payment_channel"', {
          codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'payment_channel' } },
        }),
      }),
      // Backfill for the channel column. No-op on any replay: the payments
      // table is created empty earlier in this graph and migrations never
      // insert rows (seeds run separately), so the check finds nothing to fix.
      // Pre-ledger rows, had any existed, were all in-person records.
      this.dataTransform(endContract, 'backfill-payments-channel', {
        check: () => pg.raw.sql`SELECT 1 AS violation FROM public.payments WHERE channel IS NULL LIMIT 1`.returnsRow({ violation: { codecId: 'pg/int4@1' } }),
        run: () => pg.raw.sql`UPDATE public.payments SET channel = 'IN_PERSON' WHERE channel IS NULL`.affectedCount(),
      }),
      this.setNotNull({ schema: 'public', table: 'payments', column: 'channel' }),
      this.dropNotNull({ schema: 'public', table: 'accounts', column: 'password_hash' }),
      this.addUnique({
        schema: 'public',
        table: 'accounts',
        constraint: 'accounts_google_id_key',
        columns: ['google_id'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'payments',
        constraint: 'online_payment_requires_proof',
        expression:
          "((channel <> 'ONLINE'::payment_channel) OR ((reference_no IS NOT NULL) AND (proof_url IS NOT NULL)))",
      }),
      this.addUnique({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_reference_no_key',
        columns: ['reference_no'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payment_settings',
        index: 'payment_settings_updated_by_idx_65a72f86',
        columns: ['updated_by'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'idx_payments_appointment_id',
        columns: ['appointment_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payment_settings',
        foreignKey: {
          name: 'fk_payment_settings_updater',
          columns: ['updated_by'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'fk_payment_recorder',
          columns: ['recorded_by'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'payment_settings' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
