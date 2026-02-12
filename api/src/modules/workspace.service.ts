import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, MemberRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';

type CreateWorkspaceInput = {
  name: string;
  ownerId: string;
};

type CreateInviteInput = {
  workspaceId: string;
  userId: string;
  expiresInHours?: number;
  maxUses?: number;
};

type CreateChannelInput = {
  workspaceId: string;
  userId: string;
  name: string;
  type: ChannelType;
};

type CreateMessageInput = {
  channelId: string;
  userId: string;
  content: string;
};

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(input: CreateWorkspaceInput) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new BadRequestException('Workspace name must contain at least 2 characters.');
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name,
        ownerId: input.ownerId,
        members: {
          create: {
            userId: input.ownerId,
            role: MemberRole.OWNER,
          },
        },
        channels: {
          createMany: {
            data: [
              { name: 'general', slug: 'general', type: ChannelType.TEXT, position: 0 },
              { name: 'random', slug: 'random', type: ChannelType.TEXT, position: 1 },
            ],
          },
        },
      },
      include: {
        channels: {
          orderBy: { position: 'asc' },
        },
      },
    });

    return workspace;
  }

  async listWorkspacesForUser(userId: string) {
    return this.prisma.member.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true, channels: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createInvite(input: CreateInviteInput) {
    await this.assertMember(input.workspaceId, input.userId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const code = randomBytes(6).toString('base64url');
    const expiresAt = input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

    const invite = await this.prisma.invite.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.userId,
        code,
        maxUses: input.maxUses ?? null,
        expiresAt,
      },
    });

    await this.registerInviteRouteIfEnabled(invite.code, invite.expiresAt);
    return invite;
  }

  async joinWorkspaceWithInvite(code: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
    });

    if (!invite || invite.revoked) {
      throw new NotFoundException('Invite not found.');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite expired.');
    }

    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw new BadRequestException('Invite reached max uses.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingMember = await tx.member.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId,
          },
        },
      });

      if (!existingMember) {
        await tx.member.create({
          data: {
            workspaceId: invite.workspaceId,
            userId,
            role: MemberRole.MEMBER,
          },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });

      return tx.workspace.findUnique({
        where: { id: invite.workspaceId },
      });
    });
  }

  async listChannels(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    return this.prisma.channel.findMany({
      where: { workspaceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createChannel(input: CreateChannelInput) {
    await this.assertMember(input.workspaceId, input.userId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const cleanName = input.name.trim().toLowerCase();
    if (cleanName.length < 2) {
      throw new BadRequestException('Channel name must contain at least 2 characters.');
    }

    const slug = cleanName.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) {
      throw new BadRequestException('Invalid channel name.');
    }

    const count = await this.prisma.channel.count({
      where: { workspaceId: input.workspaceId },
    });

    return this.prisma.channel.create({
      data: {
        workspaceId: input.workspaceId,
        name: cleanName,
        slug,
        type: input.type,
        position: count,
      },
    });
  }

  async listMessages(channelId: string, userId: string, limit = 30, cursor?: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found.');
    }

    await this.assertMember(channel.workspaceId, userId);

    return this.prisma.message.findMany({
      where: { channelId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async createMessage(input: CreateMessageInput) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { workspaceId: true },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found.');
    }

    await this.assertMember(channel.workspaceId, input.userId);

    const content = input.content.trim();
    if (content.length === 0) {
      throw new BadRequestException('Message cannot be empty.');
    }

    return this.prisma.message.create({
      data: {
        channelId: input.channelId,
        authorId: input.userId,
        content,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  private async assertMember(workspaceId: string, userId: string, allowedRoles?: MemberRole[]) {
    const member = await this.prisma.member.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }

    if (allowedRoles && !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return member;
  }

  private async registerInviteRouteIfEnabled(code: string, expiresAt: Date | null) {
    const controlPlaneUrl = process.env.CONTROL_PLANE_URL?.trim();
    const resolverToken = process.env.RESOLVER_REGISTER_TOKEN?.trim();
    const instancePublicUrl = this.getInstancePublicUrl();

    if (!controlPlaneUrl || !resolverToken || !instancePublicUrl) {
      return;
    }

    const endpoint = `${controlPlaneUrl.replace(/\/$/, '')}/api/resolver/register`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-resolver-token': resolverToken,
        },
        body: JSON.stringify({
          code,
          targetUrl: instancePublicUrl,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        console.warn(`[resolver] failed to register invite code ${code}: HTTP ${response.status} ${details}`);
      }
    } catch (error) {
      console.warn(`[resolver] failed to register invite code ${code}:`, error);
    }
  }

  private getInstancePublicUrl(): string | null {
    const explicit = process.env.INSTANCE_PUBLIC_URL?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }

    const domain = process.env.DOMAIN?.trim();
    if (!domain) {
      return null;
    }
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain.replace(/\/$/, '');
    }
    return `https://${domain}`;
  }
}
