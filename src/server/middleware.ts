import { createMiddleware } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '~/lib/auth';

/** Puts the signed-in user on `context`; rejects the call otherwise. */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders()
    });
    if (!session) throw new Error('Please sign in again.');
    return next({ context: { user: session.user } });
  }
);
