#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c0b37f8fd791644c9851d39c03935f0581a6d54850c7feb0991da2817f83fa4a/contract';
import startContract from '../../snapshots/c0b37f8fd791644c9851d39c03935f0581a6d54850c7feb0991da2817f83fa4a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c12d8236e8c37c59c29f6de5a1196f00fe0fbab15dec1bf2346b83d1860ad9a5/contract';
import endContract from '../../snapshots/c12d8236e8c37c59c29f6de5a1196f00fe0fbab15dec1bf2346b83d1860ad9a5/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'staff_attendance',
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
          col('staff_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('time_in', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('time_out', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'staff_attendance_pkey' }),
          checkExpression('valid_attendance_time', '(time_out IS NULL OR time_out > time_in)'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'staff_categories',
        columns: [
          col('category_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('staff_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['staff_id', 'category_id'], { name: 'staff_categories_pkey' })],
      }),
      this.addColumn({
        schema: 'public',
        table: 'accounts',
        column: col('is_system', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'services',
        column: col('image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'staff',
        column: col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'staff',
        column: col('covered_roles', 'text[]', { codecRef: { codecId: 'pg/text@1', many: true } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'staff',
        column: col('photo_url', 'character varying(500)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'staff',
        column: col('position', 'character varying(100)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'staff',
        column: col('show_on_team', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'staff',
        constraint: 'staff_covered_roles_elem_not_null_c7c50f7d',
        expression: 'array_position("covered_roles", NULL) IS NULL',
      }),
      this.createIndex({
        schema: 'public',
        table: 'accounts',
        index: 'accounts_single_system_key',
        columns: ['is_system'],
        extras: { where: 'is_system', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_attendance',
        index: 'idx_staff_attendance_staff_id_time',
        columns: ['staff_id', 'time_in'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_attendance',
        index: 'staff_attendance_open_shift_key',
        columns: ['staff_id'],
        extras: { where: 'time_out IS NULL', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_categories',
        index: 'idx_staff_categories_category_id',
        columns: ['category_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_attendance',
        foreignKey: {
          name: 'fk_staff_attendance_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_categories',
        foreignKey: {
          name: 'fk_staff_categories_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_categories',
        foreignKey: {
          name: 'fk_staff_categories_category',
          columns: ['category_id'],
          references: { schema: 'public', table: 'service_categories', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'staff_attendance' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'staff_categories' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
