import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { APIError } from 'better-auth/api';
import { z } from 'zod';

export function createAuth(config, database) {
  return betterAuth({
    database: mongodbAdapter(database.authDatabase, { client: database.client, transaction: false }),
    baseURL: config.BETTER_AUTH_URL, secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.CLIENT_URL, config.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    user: { modelName: 'users', additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'student', input: true, validator: { input: z.enum(['student', 'tutor']) } },
      plan: { type: 'string', defaultValue: 'free', input: false },
      phone: { type: 'string', defaultValue: '', input: false },
      bio: { type: 'string', defaultValue: '', input: false },
    } },
    databaseHooks: { user: { create: { before: async (user) => {
      if (!['student', 'tutor'].includes(user.role ?? 'student')) throw new APIError('BAD_REQUEST', { message: 'Choose Student or Tutor.' });
      return { data: { ...user, role: user.role ?? 'student', plan: 'free', email: user.email.toLowerCase() } };
    } }, update: { before: async (user) => {
      // The role field is accepted at signup, never through public update-user.
      if ('role' in user || 'plan' in user) throw new APIError('FORBIDDEN', { message: 'Role and plan changes require a protected platform action.' });
      return { data: user };
    } } } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: config.NODE_ENV !== 'test', window: 60, max: 40 },
  });
}
