#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1964125d260b6ac4afe7590c005f0f06db6096160f547256428ad8ea54fe2cbf/contract';
import endContract from '../../snapshots/1964125d260b6ac4afe7590c005f0f06db6096160f547256428ad8ea54fe2cbf/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/73ae5ac9b05cadbe897ba58c2743688db1f0afd5ff19ece5a838a0327a9516fe/contract';
import startContract from '../../snapshots/73ae5ac9b05cadbe897ba58c2743688db1f0afd5ff19ece5a838a0327a9516fe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'staff_attendance',
        column: col('account_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.dropNotNull({ schema: 'public', table: 'staff_attendance', column: 'staff_id' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'staff_attendance',
        constraint: 'exactly_one_attendance_owner',
        expression: '(((staff_id IS NOT NULL)) <> ((account_id IS NOT NULL)))',
      }),
      this.createIndex({
        schema: 'public',
        table: 'staff_attendance',
        index: 'staff_attendance_open_shift_account_key',
        columns: ['account_id'],
        extras: { where: '(time_out IS NULL)', unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'staff_attendance',
        foreignKey: {
          name: 'fk_staff_attendance_account',
          columns: ['account_id'],
          references: { schema: 'public', table: 'accounts', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
