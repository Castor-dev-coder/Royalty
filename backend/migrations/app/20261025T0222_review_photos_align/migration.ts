#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c7b3293465ca258d93a3f9dfe9f47ce1250d386d01ca29a5ee85ecac3b0f03fa/contract';
import endContract from '../../snapshots/c7b3293465ca258d93a3f9dfe9f47ce1250d386d01ca29a5ee85ecac3b0f03fa/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e033c4d1ec8e9800099902221ce394c629c7369bd8372bb101864ef22d23baec/contract';
import startContract from '../../snapshots/e033c4d1ec8e9800099902221ce394c629c7369bd8372bb101864ef22d23baec/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
