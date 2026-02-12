import { UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
};

export async function requireUserSession(req: FastifyRequest): Promise<AuthedUser> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.raw.headers),
  });

  if (!session?.user) {
    throw new UnauthorizedException('Authentication required.');
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
