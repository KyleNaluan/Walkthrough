import {z} from 'zod';

const isTest = process.env.NODE_ENV === 'test';

// Supabase vars are optional in tests so CI runs without real secrets.
const supabaseVar = isTest ? z.string().optional() : z.string().min(1);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: isTest ? z.string().optional() : z.string().url(),
  SUPABASE_ANON_KEY: supabaseVar,
  SUPABASE_SERVICE_ROLE_KEY: supabaseVar,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses process.env once and fails fast with the list of bad variables. */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment variables (see server/.env.example):\n${problems}`,
    );
  }
  cached = result.data;
  return cached;
}
