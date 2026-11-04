#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0c3dbaac8680a443c48be4d605176b7ce9922a781b076a7cd073d78cd884ce5d/contract';
import startContract from '../../snapshots/0c3dbaac8680a443c48be4d605176b7ce9922a781b076a7cd073d78cd884ce5d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c0b37f8fd791644c9851d39c03935f0581a6d54850c7feb0991da2817f83fa4a/contract';
import endContract from '../../snapshots/c0b37f8fd791644c9851d39c03935f0581a6d54850c7feb0991da2817f83fa4a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'review_rating_category',
        members: ['SERVICE', 'PRODUCTS', 'STAFF', 'TIME_MANAGEMENT'],
      }),
      this.createTable({
        schema: 'public',
        table: 'review_ratings',
        columns: [
          col('category', '"review_rating_category"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'review_rating_category' } },
          }),
          col('id', 'uuid', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('rating', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('review_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id'], { name: 'review_ratings_pkey' }),
          checkExpression('valid_review_rating', '((rating >= 1) AND (rating <= 5))'),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'review_ratings',
        constraint: 'review_ratings_review_category_key',
        columns: ['review_id', 'category'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointment_services',
        index: 'idx_appointment_services_service_id',
        columns: ['service_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'idx_payments_verified_by',
        columns: ['verified_by'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'schedule_requests',
        index: 'idx_schedule_requests_reviewed_by',
        columns: ['reviewed_by'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'review_ratings',
        foreignKey: {
          name: 'fk_review_rating_review',
          columns: ['review_id'],
          references: { schema: 'public', table: 'reviews', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'review_ratings' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
