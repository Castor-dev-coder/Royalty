import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  STUDIO_TIME_ZONE: z.string().default('Asia/Manila').refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }, 'STUDIO_TIME_ZONE must be a valid IANA timezone'),
});

export type Env = z.infer<typeof envSchema>;

declare global {
  // eslint-disable-next-line no-var
  var __env: Env | undefined;
}

// Validate and cache env
export function getEnv(): Env {
  if (global.__env) return global.__env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment variable validation failed:');
    result.error.issues.forEach((err: z.ZodIssue) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }

  global.__env = result.data;
  return global.__env;
}

// Export singleton
export const env = getEnv();
