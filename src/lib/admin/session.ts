import 'server-only';

import { cookies } from 'next/headers';
import { getAdminSessionSecret } from '@/lib/google-calendar/config';
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  validateAdminSession,
} from './session-core.mjs';

export const ADMIN_SESSION_COOKIE = 'rec_admin_session';

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

export function issueAdminSession(subject: string, email: string) {
  return createAdminSession(subject, email, getAdminSessionSecret());
}

export async function getAdminSession() {
  const value = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!value) return null;
  return validateAdminSession(value, getAdminSessionSecret());
}
