import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { RateLimitService } from "./rate-limit.service";
import { ResolverService } from "./resolver.service";

@Controller("resolver")
export class ResolverController {
  constructor(
    private readonly resolverService: ResolverService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post("register")
  async registerInviteRoute(
    @Req() req: FastifyRequest,
    @Headers("x-resolver-token") token: string | undefined,
    @Body()
    body: { code: string; targetUrl: string; expiresAt?: string | null },
  ) {
    await this.rateLimitService.assertWithinLimit(
      `resolver:register:${req.ip}`,
      120,
      60_000,
    );

    const expectedToken = process.env.RESOLVER_REGISTER_TOKEN;
    if (!isValidResolverToken(token, expectedToken)) {
      throw new ForbiddenException("resolver token is invalid");
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("expiresAt is invalid");
    }

    return this.resolverService.registerInviteRoute({
      code: body.code,
      targetUrl: body.targetUrl,
      expiresAt,
    });
  }

  @Get("resolve/:code")
  async resolveInviteRoute(
    @Req() req: FastifyRequest,
    @Param("code") code: string,
  ) {
    await this.rateLimitService.assertWithinLimit(
      `resolver:resolve:${req.ip}`,
      240,
      60_000,
    );
    return this.resolverService.resolveInviteRoute(code);
  }

  @Get("stats")
  async getStats(
    @Req() req: FastifyRequest,
    @Headers("x-resolver-token") token: string | undefined,
  ) {
    await this.rateLimitService.assertWithinLimit(
      `resolver:stats:${req.ip}`,
      60,
      60_000,
    );
    const expectedToken = process.env.RESOLVER_REGISTER_TOKEN;
    if (!isValidResolverToken(token, expectedToken)) {
      throw new ForbiddenException("resolver token is invalid");
    }
    return this.resolverService.getResolverStats();
  }

  @Delete("expired")
  async purgeExpired(
    @Req() req: FastifyRequest,
    @Headers("x-resolver-token") token: string | undefined,
  ) {
    await this.rateLimitService.assertWithinLimit(
      `resolver:purge:${req.ip}`,
      30,
      60_000,
    );
    const expectedToken = process.env.RESOLVER_REGISTER_TOKEN;
    if (!isValidResolverToken(token, expectedToken)) {
      throw new ForbiddenException("resolver token is invalid");
    }
    return this.resolverService.purgeExpiredRoutes();
  }
}

function isValidResolverToken(
  token: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !token) {
    return false;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
