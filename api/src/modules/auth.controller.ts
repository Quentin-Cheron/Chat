import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';

type AuthBody = {
  email: string;
  password: string;
  name?: string;
};

function normalizeAuthBody(body: AuthBody | undefined): AuthBody {
  return {
    email: body?.email?.trim?.() || '',
    password: body?.password || '',
    name: body?.name?.trim?.(),
  };
}

async function sendAuthResponse(reply: FastifyReply, response: Response): Promise<void> {
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  reply.status(response.status);

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    reply.send();
    return;
  }

  if (contentType.includes('application/json')) {
    reply.send(JSON.parse(text));
    return;
  }

  reply.send(text);
}

@Controller('auth')
export class AuthController {
  @Get('get-session')
  async session(@Req() req: FastifyRequest) {
    return auth.api.getSession({
      headers: fromNodeHeaders(req.raw.headers),
    });
  }

  @Post('sign-up/email')
  async register(@Body() body: AuthBody, @Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const input = normalizeAuthBody(body);
    if (!input.email || !input.password) {
      reply.status(400).send({ message: 'Email and password are required.' });
      return;
    }

    const response = await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name || input.email,
      },
      headers: fromNodeHeaders(req.raw.headers),
      asResponse: true,
    });

    await sendAuthResponse(reply, response);
  }

  @Post('sign-in/email')
  async login(@Body() body: AuthBody, @Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const input = normalizeAuthBody(body);
    if (!input.email || !input.password) {
      reply.status(400).send({ message: 'Email and password are required.' });
      return;
    }

    const response = await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
      },
      headers: fromNodeHeaders(req.raw.headers),
      asResponse: true,
    });

    await sendAuthResponse(reply, response);
  }

  @Post('sign-out')
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const response = await auth.api.signOut({
      headers: fromNodeHeaders(req.raw.headers),
      asResponse: true,
    });

    await sendAuthResponse(reply, response);
  }
}
