#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1964125d260b6ac4afe7590c005f0f06db6096160f547256428ad8ea54fe2cbf/contract';
import startContract from '../../snapshots/1964125d260b6ac4afe7590c005f0f06db6096160f547256428ad8ea54fe2cbf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c61d33568910197e566ed84ebf6b0123d9801d4f1b311da5274ddd8a65f95dcb/contract';
import endContract from '../../snapshots/c61d33568910197e566ed84ebf6b0123d9801d4f1b311da5274ddd8a65f95dcb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
