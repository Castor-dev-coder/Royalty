/*
 * Shared ambient declarations for the Temporal subset this project uses.
 *
 * `Temporal` is a runtime global in Node (22+), so no runtime polyfill or
 * dependency is needed. This file exists purely because TypeScript 5.9's
 * bundled `lib.*.d.ts` files do not declare it and no `@types/temporal` is
 * installed. One shared declaration avoids duplicating these types per module.
 *
 * Scope is deliberately minimal: only the members the Prisma 8 PostgreSQL
 * temporal codecs (`pg/date-temporal@1`, `pg/time-temporal@1`) and this
 * codebase's adapters actually use.
 *
 * NOTE ON WHY TYPES ALONE DO NOT CATCH CODEC MISTAKES: the generated contract
 * exposes temporal columns as opaque aliases such as
 * `CodecTypes['pg/time-temporal@1']['input']`, which resolve to `any`. A raw
 * string therefore type-checks when a `Temporal` value is required, and the
 * mismatch only fails at statement-build time with
 * "encodes a Temporal.PlainTime, but received a string". Always cross the
 * boundary through the helpers in `src/utils/date-time.ts`; do not rely on the
 * compiler. See `date-time.temporal.test.ts` for the behavioural coverage that
 * substitutes for the missing static guarantee.
 */

declare namespace Temporal {
  interface PlainTime {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
    toString(): string;
  }

  interface PlainDate {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    toString(): string;
  }

  const PlainTime: {
    from(value: string): PlainTime;
    compare(a: PlainTime, b: PlainTime): number;
  };

  const PlainDate: {
    from(value: string): PlainDate;
    compare(a: PlainDate, b: PlainDate): number;
  };

  interface Instant extends Date {
    toISOString(): string;
    toJSON(): string;
  }

  const Instant: {
    from(value: string): Instant;
  };
}
