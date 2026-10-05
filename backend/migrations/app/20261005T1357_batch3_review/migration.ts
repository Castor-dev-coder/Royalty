#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0c3dbaac8680a443c48be4d605176b7ce9922a781b076a7cd073d78cd884ce5d/contract';
import endContract from '../../snapshots/0c3dbaac8680a443c48be4d605176b7ce9922a781b076a7cd073d78cd884ce5d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b1d40866a8c3334efb0c1a81b8f63f24422643f3541e3e5f9f1870e6aa0ebe64/contract';
import startContract from '../../snapshots/b1d40866a8c3334efb0c1a81b8f63f24422643f3541e3e5f9f1870e6aa0ebe64/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';

const pg = postgres<End>({ contractJson: endContract });
const { contract } = pg;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'appointments',
        column: col('staff_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.dataTransform(contract, 'typechange-appointment_services-service_name', {
        check: () => pg.raw.sql`SELECT 1 AS violation FROM public.appointment_services WHERE char_length(service_name) > 200 LIMIT 1`.returnsRow({ violation: { codecId: 'pg/int4@1' } }),
        run: () => pg.raw.sql`UPDATE public.appointment_services SET service_name = service_name WHERE char_length(service_name) > 200`.affectedCount(),
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'appointment_services',
        column: 'service_name',
        options: {
          qualifiedTargetType: 'character varying(200)',
          formatTypeExpected: 'character varying(200)',
          rawTargetTypeForLabel: 'character varying(200)',
        },
      }),
      this.dataTransform(contract, 'typechange-appointments-appointment_code', {
        check: () => pg.raw.sql`SELECT 1 AS violation FROM public.appointments WHERE char_length(appointment_code) > 40 LIMIT 1`.returnsRow({ violation: { codecId: 'pg/int4@1' } }),
        run: () => pg.raw.sql`UPDATE public.appointments SET appointment_code = appointment_code WHERE char_length(appointment_code) > 40`.affectedCount(),
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'appointments',
        column: 'appointment_code',
        options: {
          qualifiedTargetType: 'character varying(40)',
          formatTypeExpected: 'character varying(40)',
          rawTargetTypeForLabel: 'character varying(40)',
        },
      }),
      this.dataTransform(contract, 'typechange-services-name', {
        check: () => pg.raw.sql`SELECT 1 AS violation FROM public.services WHERE char_length(name) > 200 LIMIT 1`.returnsRow({ violation: { codecId: 'pg/int4@1' } }),
        run: () => pg.raw.sql`UPDATE public.services SET name = name WHERE char_length(name) > 200`.affectedCount(),
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'services',
        column: 'name',
        options: {
          qualifiedTargetType: 'character varying(200)',
          formatTypeExpected: 'character varying(200)',
          rawTargetTypeForLabel: 'character varying(200)',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'appointments',
        index: 'idx_appointments_staff_id_date',
        columns: ['staff_id', 'appointment_date'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'appointments',
        foreignKey: {
          name: 'fk_appointment_staff',
          columns: ['staff_id'],
          references: { schema: 'public', table: 'staff', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
