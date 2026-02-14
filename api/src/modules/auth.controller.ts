import { BadRequestException, Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';
import { PrismaService } from '../prisma.service';
import { requireUserSession } from './auth-session';

type AuthBody = {
  email: string;
  password: string;
  name?: string;
};

type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
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
  constructor(private readonly prisma: PrismaService) {}

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

  @Get('password-status')
  async passwordStatus(@Req() req: FastifyRequest) {
    const user = await requireUserSession(req);
    const row = await this.prisma.userSecurity.findUnique({
      where: { userId: user.id },
      select: { mustChangePassword: true },
    });

    return {
      mustChangePassword: row?.mustChangePassword ?? false,
    };
  }

  @Get('profile')
  async profile(@Req() req: FastifyRequest) {
    const user = await requireUserSession(req);
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return dbUser;
  }

  @Post('profile')
  async updateProfile(@Req() req: FastifyRequest, @Body() body: { name?: string; image?: string | null }) {
    const user = await requireUserSession(req);
    const name = body?.name?.trim?.();
    if (!name || name.length < 2) {
      throw new BadRequestException('Name must contain at least 2 characters.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        image: body?.image || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return updated;
  }

  @Post('change-password')
  async changePassword(@Body() body: ChangePasswordBody, @Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const input = {
      currentPassword: body?.currentPassword || '',
      newPassword: body?.newPassword || '',
    };
    if (!input.currentPassword || !input.newPassword) {
      reply.status(400).send({ message: 'Current and new password are required.' });
      return;
    }

    const user = await requireUserSession(req);
    const response = await auth.api.changePassword({
      body: input,
      headers: fromNodeHeaders(req.raw.headers),
      asResponse: true,
    });

    if (response.ok) {
      await this.prisma.userSecurity.upsert({
        where: { userId: user.id },
        update: { mustChangePassword: false },
        create: { userId: user.id, mustChangePassword: false },
      });
    }

    await sendAuthResponse(reply, response);
  }
}
