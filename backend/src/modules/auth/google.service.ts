// Google Identity Services (One Tap / Sign-In) — server-side ID-token
// verification and CUSTOMER account creation.
//
// Security posture:
//   - The token audience MUST equal GOOGLE_CLIENT_ID.
//   - Only tokens with email_verified are accepted.
//   - Accounts are looked up by the stable Google `sub` first. A matching
//     email that is NOT linked to that Google identity is a CONTROLLED
//     CONFLICT (409): the user must sign in with their password. Accounts are
//     never merged silently.
//   - Google sign-in can only reach CUSTOMER accounts. Inactive accounts and
//     STAFF/MANAGER/ADMIN roles get the same generic auth failure as a wrong
//     password (no account-state disclosure).
import { db } from '../../prisma/db.js'
import { pgVarchar } from '../../prisma/contract-compat.js'
import { ConflictError, UnauthorizedError } from '../../errors/index.js'
import { env } from '../../config/env.js'
import { createAccessToken, createRefreshToken } from '../../lib/jwt.js'
import { generateAuditLog } from '../../utils/audit.js'

export interface GoogleProfile {
  sub: string
  email: string
  emailVerified: boolean
  givenName: string | null
  familyName: string | null
}

export interface GoogleIdVerifier {
  verify(idToken: string, audience: string): Promise<GoogleProfile>
}

export interface GoogleAuthResult {
  id: string
  email: string
  role: string
  accessToken: string
  refreshToken: string
  created: boolean
}

// Lazy default verifier (google-auth-library). Injectable for tests.
let realVerifier: GoogleIdVerifier | null = null
async function defaultVerifier(): Promise<GoogleIdVerifier> {
  if (!realVerifier) {
    const { OAuth2Client } = await import('google-auth-library')
    const client = new OAuth2Client()
    realVerifier = {
      async verify(idToken: string, audience: string): Promise<GoogleProfile> {
        const ticket = await client.verifyIdToken({ idToken, audience })
        const payload = ticket.getPayload()
        if (!payload?.sub || !payload.email) throw new UnauthorizedError('Google sign-in failed')
        return {
          sub: payload.sub,
          email: payload.email,
          emailVerified: payload.email_verified === true,
          givenName: payload.given_name ?? null,
          familyName: payload.family_name ?? null,
        }
      },
    }
  }
  return realVerifier
}

export class GoogleAuthService {
  static async signIn(
    idToken: string,
    options: { rememberMe?: boolean; verifier?: GoogleIdVerifier } = {},
  ): Promise<GoogleAuthResult> {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedError('Google sign-in is not configured')
    }
    const verifier = options.verifier ?? (await defaultVerifier())
    let profile: GoogleProfile
    try {
      profile = await verifier.verify(idToken, env.GOOGLE_CLIENT_ID)
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error
      throw new UnauthorizedError('Google sign-in failed')
    }
    if (!profile.emailVerified) throw new UnauthorizedError('Google sign-in failed')

    // 1. Linked Google identity wins (email may have changed at Google).
    const byGoogle = await db.orm.public.Account.where({ googleId: pgVarchar<255>(profile.sub) }).first()
    if (byGoogle) {
      this.assertUsableCustomer(byGoogle)
      return this.issueTokens(byGoogle, false)
    }

    // 2. Same email, different identity: NEVER merge silently.
    const byEmail = await db.orm.public.Account.where({ email: pgVarchar<255>(profile.email) }).first()
    if (byEmail) {
      throw new ConflictError('An account with this email already exists. Sign in with your password to continue.')
    }

    // 3. New CUSTOMER account (Google-only: no password).
    const firstName = pgVarchar<100>((profile.givenName ?? profile.email.split('@')[0]).slice(0, 100))
    const lastName = pgVarchar<100>((profile.familyName ?? '').slice(0, 100))
    const account = await db.orm.public.Account.create({
      email: pgVarchar<255>(profile.email),
      googleId: pgVarchar<255>(profile.sub),
      passwordHash: null,
      role: 'CUSTOMER',
      status: 'ACTIVE',
    })
    await db.orm.public.Customer.create({
      accountId: account.id,
      firstName,
      lastName,
      gender: null,
      phone: null,
    })
    await generateAuditLog({
      actorAccountId: account.id,
      action: 'GOOGLE_SIGN_UP',
      entityType: 'Account',
      entityId: account.id,
      newData: { email: profile.email },
    })
    return this.issueTokens(account, true)
  }

  private static assertUsableCustomer(account: Record<string, unknown>): void {
    // Generic failure: no disclosure of role or account state.
    if (String(account.status) !== 'ACTIVE' || String(account.role) !== 'CUSTOMER') {
      throw new UnauthorizedError('Invalid email or password')
    }
  }

  private static issueTokens(account: Record<string, unknown>, created: boolean): GoogleAuthResult {
    const payload = { sub: String(account.id), email: String(account.email), role: String(account.role) }
    return {
      id: String(account.id),
      email: String(account.email),
      role: String(account.role),
      accessToken: createAccessToken(payload),
      refreshToken: createRefreshToken(payload, { rememberMe: true }),
      created,
    }
  }
}
