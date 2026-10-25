#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c61d33568910197e566ed84ebf6b0123d9801d4f1b311da5274ddd8a65f95dcb/contract';
import startContract from '../../snapshots/c61d33568910197e566ed84ebf6b0123d9801d4f1b311da5274ddd8a65f95dcb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e033c4d1ec8e9800099902221ce394c629c7369bd8372bb101864ef22d23baec/contract';
import endContract from '../../snapshots/e033c4d1ec8e9800099902221ce394c629c7369bd8372bb101864ef22d23baec/contract.json' with { type: 'json' };
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
        table: 'review_photos',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('hidden', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('position', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('review_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('storage_path', 'character varying(500)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('url', 'character varying(500)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'review_photos_pkey' }),
          checkExpression('review_photo_position_range', '((position >= 1) AND (position <= 3))'),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'review_photos',
        constraint: 'review_photos_review_position_key',
        columns: ['review_id', 'position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'review_photos',
        index: 'review_photos_review_id_idx_af4d2e86',
        columns: ['review_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'review_photos',
        foreignKey: {
          name: 'fk_review_photo_review',
          columns: ['review_id'],
          references: { schema: 'public', table: 'reviews', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'review_photos' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
