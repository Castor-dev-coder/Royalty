#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/73ae5ac9b05cadbe897ba58c2743688db1f0afd5ff19ece5a838a0327a9516fe/contract';
import endContract from '../../snapshots/73ae5ac9b05cadbe897ba58c2743688db1f0afd5ff19ece5a838a0327a9516fe/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c12d8236e8c37c59c29f6de5a1196f00fe0fbab15dec1bf2346b83d1860ad9a5/contract';
import startContract from '../../snapshots/c12d8236e8c37c59c29f6de5a1196f00fe0fbab15dec1bf2346b83d1860ad9a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
