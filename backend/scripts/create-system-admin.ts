// One-off: create the hidden system ADMIN account (is_system = true).
//
// Not reachable from any UI. The generated password is written ONLY to
// gitignored backend/.seed-credentials.local (mode 0600) and never printed.
// Lockout guard: the run refuses unless at least one ACTIVE, non-system ADMIN
// remains visible after the operation (the seed admin@ account stays normal).
//
// Usage: npm run db:system-admin
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { db } from '../src/prisma/db.js'
import { pgVarchar } from '../src/prisma/contract-compat.js'

const SYSTEM_ADMIN_EMAIL = 'cabuntas.jeremybscs2024@gmail.com'
const CREDENTIALS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.seed-credentials.local')

/** 20 characters, mixed case + digits + symbols, shuffled (no look-alikes). */
function generatePassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*'
  const all = upper + lower + digits + symbols
  const bytes = randomBytes(length * 2)
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ]
  for (let i = chars.length; i < length; i += 1) {
    chars.push(all[bytes[i + 4] % all.length])
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i + 64] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

async function visibleActiveAdmins(): Promise<number> {
  const rows = await db.orm.public.Account.where({ role: 'ADMIN', status: 'ACTIVE', isSystem: false }).all()
  return rows.length
}

async function main(): Promise<void> {
  const existing = await db.orm.public.Account.where({ email: pgVarchar<255>(SYSTEM_ADMIN_EMAIL) }).first()
  if (existing !== null) {
    console.log(`Account already exists (id ${existing.id}, is_system=${existing.isSystem}). Nothing to do.`);
    return
  }

  // Lockout guard (before): a visible admin must already exist.
  const before = await visibleActiveAdmins()
  if (before < 1) {
    throw new Error('Refusing to create the system admin: no ACTIVE visible ADMIN would remain able to sign in.');
  }

  const password = generatePassword(20)
  const passwordHash = await bcrypt.hash(password, 12) // CPU-bound: outside any transaction

  const account = await db.orm.public.Account.create({
    email: pgVarchar<255>(SYSTEM_ADMIN_EMAIL),
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
    isSystem: true,
  })

  // Lockout guard (after): the visible admin must still be there.
  const after = await visibleActiveAdmins()
  if (after < 1) {
    throw new Error('Lockout guard failed after create: no ACTIVE visible ADMIN remains.')
  }

  // Credentials file only (never stdout). Tab-separated like the seed entries.
  const line = `${SYSTEM_ADMIN_EMAIL}\tADMIN\t${password}\n`
  if (!existsSync(CREDENTIALS_FILE)) appendFileSync(CREDENTIALS_FILE, '', { mode: 0o600 })
  appendFileSync(CREDENTIALS_FILE, line, { mode: 0o600 })
  chmodSync(CREDENTIALS_FILE, 0o600)

  console.log(`Created system admin: id=${account.id} email=${SYSTEM_ADMIN_EMAIL} role=ADMIN is_system=true`)
  console.log(`Password (20 chars, generated) written only to backend/.seed-credentials.local`)
  console.log(`Visible ACTIVE admins before/after: ${before}/${after}`)
}

main().then(
  () => process.exit(0),
  (error: Error) => {
    console.error(error.message)
    process.exit(1)
  },
)
