#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2cbe578c1c9f97bdb9f41131ed306d49fdb05bc41761cdf37eea587e1f7a6844/contract';
import endContract from '../../snapshots/2cbe578c1c9f97bdb9f41131ed306d49fdb05bc41761cdf37eea587e1f7a6844/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3aec5a97c479eb3cc479b1fde9ab9d2c61bef24a4f81b3f6d5e57db40eca2356/contract';
import startContract from '../../snapshots/3aec5a97c479eb3cc479b1fde9ab9d2c61bef24a4f81b3f6d5e57db40eca2356/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addNativeEnumValue({ schema: 'public', typeName: 'payment_status', value: 'PENDING' }),
      this.addNativeEnumValue({ schema: 'public', typeName: 'payment_status', value: 'PAID' }),
      this.addNativeEnumValue({ schema: 'public', typeName: 'payment_status', value: 'FAILED' }),
      this.addNativeEnumValue({ schema: 'public', typeName: 'payment_status', value: 'EXPIRED' }),
      this.addColumn({
        schema: 'public',
        table: 'appointments',
        column: col('hold_expires_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('provider', 'character varying(20)', {
          notNull: true,
          default: fn("'MANUAL'"),
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('provider_checkout_id', 'character varying(100)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('provider_payment_id', 'character varying(100)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_provider_check',
        expression:
          "((provider)::text = ANY (ARRAY['MANUAL'::character varying, 'MAYA'::character varying]))",
      }),
      this.addUnique({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_provider_checkout_id_key',
        columns: ['provider_checkout_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'payments',
        constraint: 'payments_provider_payment_id_key',
        columns: ['provider_payment_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
