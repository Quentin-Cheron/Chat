import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type RegisterInviteRouteInput = {
  code: string;
  targetUrl: string;
  expiresAt?: Date | null;
};

@Injectable()
export class ResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async registerInviteRoute(input: RegisterInviteRouteInput) {
    const code = normalizeCode(input.code);
    const targetUrl = normalizeTargetUrl(input.targetUrl);

    return this.prisma.inviteRoute.upsert({
      where: { code },
      update: {
        targetUrl,
        expiresAt: input.expiresAt ?? null,
      },
      create: {
        code,
        targetUrl,
        expiresAt: input.expiresAt ?? null,
      },
      select: {
        code: true,
        targetUrl: true,
        expiresAt: true,
      },
    });
  }

  async resolveInviteRoute(codeInput: string) {
    const code = normalizeCode(codeInput);

    const route = await this.prisma.inviteRoute.findUnique({
      where: { code },
    });

    if (!route) {
      throw new NotFoundException('Invite code not found.');
    }

    if (route.expiresAt && route.expiresAt < new Date()) {
      throw new NotFoundException('Invite code expired.');
    }

    await this.prisma.inviteRoute.update({
      where: { code },
      data: {
        resolveCount: { increment: 1 },
        lastResolvedAt: new Date(),
      },
    });

    return {
      code: route.code,
      targetUrl: route.targetUrl,
      redirectTo: `${route.targetUrl}/invite/${route.code}`,
      expiresAt: route.expiresAt,
    };
  }

  async getResolverStats() {
    const now = new Date();
    const [total, active, expired, topCodes] = await this.prisma.$transaction([
      this.prisma.inviteRoute.count(),
      this.prisma.inviteRoute.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.inviteRoute.count({
        where: {
          expiresAt: { lte: now },
        },
      }),
      this.prisma.inviteRoute.findMany({
        orderBy: [{ resolveCount: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
        select: {
          code: true,
          targetUrl: true,
          resolveCount: true,
          lastResolvedAt: true,
          expiresAt: true,
        },
      }),
    ]);

    return {
      totalRoutes: total,
      activeRoutes: active,
      expiredRoutes: expired,
      topCodes,
      ts: new Date().toISOString(),
    };
  }

  async purgeExpiredRoutes() {
    const now = new Date();
    const result = await this.prisma.inviteRoute.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    return {
      deleted: result.count,
      ts: now.toISOString(),
    };
  }
}

function normalizeCode(code: string): string {
  const normalized = code.trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(normalized)) {
    throw new BadRequestException('Invalid invite code format.');
  }
  return normalized;
}

function normalizeTargetUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new BadRequestException('Invalid targetUrl.');
  }

  const isHttps = parsed.protocol === 'https:';
  const isHttpLocalhost = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (!isHttps && !isHttpLocalhost) {
    throw new BadRequestException('targetUrl must use https (or http on localhost for local dev).');
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/$/, '');

  return parsed.toString().replace(/\/$/, '');
}
