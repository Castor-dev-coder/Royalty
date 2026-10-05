# Prisma 8 numeric-default planning incompatibility — RESOLVED

## Original problem

A PostgreSQL `numeric` column with an unquoted default of `0` could not be represented in a
Prisma 8 contract so that it both verified against the live schema and planned offline:

- `contract infer` emitted `@default(0)`, which `db verify --schema-only` accepted with zero
  issues, but `migration plan` rejected with:
  `pg/numeric@1 database JSON value must be a decimal string`
- `@default("0")` inverted the result: planning worked, live verification failed.

Since `db sign` verifies against the live schema, only the verifiable form could ever be
signed — so a contract could be signed while `migration plan` remained unusable, blocking
every subsequent migration.

**Root cause:** the `@prisma/orm-target-postgres` default normalizer coerced a `numeric`
default to a JavaScript number in the stored contract JSON, while `PgNumericCodec.decodeJson`
requires a decimal string. Verification compared the literal without going through that
codec, so only the planning path failed.

## Resolution

`@prisma/orm-target-postgres` **8.0.0-rc.12** fixed this. The normalizer gained
`numberValue()`, which returns decimal text for `numeric` types:

```js
function numberValue(numeral, nativeType) {
  if (nativeType !== void 0 && DECIMAL_TEXT_TYPE_PATTERN.test(nativeType)) return numeral;
  ...
}
```

so no digit is lost to a JavaScript number. The function is absent in rc.11.
`PgNumericCodec.decodeJson` itself is unchanged — the fix is upstream of it.

## Tested version matrix

Reproduced with a minimal fixture (`Numeric(10,2) @default(0)` + snapshot + ref):

| CLI | orm-postgres | orm-target-postgres | `migration plan` |
|---|---|---|---|
| 8.0.0-rc.15 | rc.11 | rc.11 | **fails** — numeric default rejected |
| 8.0.0-rc.17 | rc.12 | rc.12 | **passes** |
| 8.0.0-rc.19 | rc.13 | rc.13 | passes |

CLI and runtime packages release on different cadences; each row is the contemporaneous pair.

## Project upgrade

- `prisma` → **8.0.0-rc.17**
- `@prisma/orm-postgres` → **8.0.0-rc.12**
- `@prisma/orm-target-postgres` → **8.0.0-rc.12**

rc.17 also removed the `dbgenerated(...)` default function; the 13 `gen_random_uuid()` PK
defaults were migrated to the documented `@default(sql\`gen_random_uuid()\`)` form. The SQL
expressions are unchanged.

## Current state

`appointments.totalAmount Numeric(10,2) @default(0)` is retained as the faithful
representation. With rc.17/rc.12 it passes all four gates:

- `contract emit` — 0 diagnostics
- `db verify --schema-only` — 0 issues
- `db verify` / `db verify --strict` — "Database marker and schema match contract"
- `migration plan` — plans successfully against the signed baseline

**No workaround is currently required.** The emitted storage hash changes between rc.11 and
rc.12 (the default is stored as `"0"` rather than `0`), so the contract must be re-emitted and
the database re-signed once after the upgrade.
