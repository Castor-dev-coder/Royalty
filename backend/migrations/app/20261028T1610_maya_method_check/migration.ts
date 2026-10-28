#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2cbe578c1c9f97bdb9f41131ed306d49fdb05bc41761cdf37eea587e1f7a6844/contract';
import startContract from '../../snapshots/2cbe578c1c9f97bdb9f41131ed306d49fdb05bc41761cdf37eea587e1f7a6844/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8647299e69f5dc4feae7652244dfa4ffa4251af1fc50dd3237764be4668401a5/contract';
import endContract from '../../snapshots/8647299e69f5dc4feae7652244dfa4ffa4251af1fc50dd3237764be4668401a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

/**
 * Amendment A (authored manually: the planner refuses check-constraint
 * modifications as "unsupportedOperation" and directs `migration new`).
 *
 * 1. Add MAYA to payment_method — Maya rows are never labelled GCASH and
 *    never fake a GCash reference or proof.
 * 2. Drop and recreate online_payment_requires_proof in Postgres's
 *    normalized form so the ONLINE reference/proof requirement applies only
 *    when provider = 'MANUAL'. Maya rows carry provider reference ids
 *    (provider_checkout_id / provider_payment_id) instead.
 *
 * Classifications: addNativeEnumValue = additive; dropCheckConstraint =
 * destructive; addCheckConstraint = additive.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addNativeEnumValue({ schema: 'public', typeName: 'payment_method', value: 'MAYA' }),
      this.dropCheckConstraint({ schema: 'public', table: 'payments', constraint: 'online_payment_requires_proof' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'payments',
        constraint: 'online_payment_requires_proof',
        expression:
          "(((provider)::text <> 'MANUAL'::text) OR ((channel <> 'ONLINE'::payment_channel) OR ((reference_no IS NOT NULL) AND (proof_url IS NOT NULL))))",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
