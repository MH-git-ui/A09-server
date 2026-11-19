import { z } from 'zod';
export function readConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_URL: z.url().default('http://localhost:3000'),
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('mentorlagbe'),
    BETTER_AUTH_SECRET: z.string().min(32),
    JWT_SECRET: z.string().min(32),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    IMGBB_API_KEY: z.string().optional(),
  });
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment fields: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  return result.data;
}
