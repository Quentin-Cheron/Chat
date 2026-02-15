import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ChannelType, MemberRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma.service";

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

type UpdateMemberRoleInput = {
  workspaceId: string;
  actorUserId: string;
  memberId: string;
  role: MemberRole;
};

type WorkspaceAction =
  | "channel:create"
  | "channel:delete"
  | "invite:create"
  | "member:role:update"
  | "member:kick";

const rolePermissions: Record<MemberRole, WorkspaceAction[]> = {
  OWNER: [
    "channel:create",
    "channel:delete",
    "invite:create",
    "member:role:update",
    "member:kick",
  ],
  ADMIN: [
    "channel:create",
    "channel:delete",
    "invite:create",
    "member:role:update",
    "member:kick",
  ],
  MEMBER: ["channel:create"],
};

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(input: CreateWorkspaceInput) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new BadRequestException(
        "Workspace name must contain at least 2 characters.",
      );
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
              {
                name: "general",
                slug: "general",
                type: ChannelType.TEXT,
                position: 0,
              },
              {
                name: "random",
                slug: "random",
                type: ChannelType.TEXT,
                position: 1,
              },
            ],
          },
        },
      },
      include: {
        channels: {
          orderBy: { position: "asc" },
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
      orderBy: { createdAt: "asc" },
    });
  }

  async createInvite(input: CreateInviteInput) {
    const actor = await this.assertMember(input.workspaceId, input.userId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { allowMemberInviteCreation: true },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found.");
    }
    this.assertPermission(actor.role, "invite:create");
    if (
      actor.role === MemberRole.MEMBER &&
      !workspace.allowMemberInviteCreation
    ) {
      throw new ForbiddenException(
        "Members cannot create invites in this workspace.",
      );
    }

    const code = randomBytes(6).toString("base64url");
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
      throw new NotFoundException("Invite not found.");
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException("Invite expired.");
    }

    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw new BadRequestException("Invite reached max uses.");
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
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async createChannel(input: CreateChannelInput) {
    const actor = await this.assertMember(input.workspaceId, input.userId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { allowMemberChannelCreation: true },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found.");
    }
    this.assertPermission(actor.role, "channel:create");
    if (
      actor.role === MemberRole.MEMBER &&
      !workspace.allowMemberChannelCreation
    ) {
      throw new ForbiddenException(
        "Members cannot create channels in this workspace.",
      );
    }

    const cleanName = input.name.trim().toLowerCase();
    if (cleanName.length < 2) {
      throw new BadRequestException(
        "Channel name must contain at least 2 characters.",
      );
    }

    const slug = cleanName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) {
      throw new BadRequestException("Invalid channel name.");
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

  async deleteChannel(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true, slug: true },
    });
    if (!channel) {
      throw new NotFoundException("Channel not found.");
    }
    const actor = await this.assertMember(channel.workspaceId, userId);
    this.assertPermission(actor.role, "channel:delete");

    if (channel.slug === "general") {
      throw new ForbiddenException("The general channel cannot be deleted.");
    }

    await this.prisma.channel.delete({ where: { id: channelId } });
  }

  async kickMember(workspaceId: string, actorUserId: string, memberId: string) {
    const actor = await this.assertMember(workspaceId, actorUserId);
    this.assertPermission(actor.role, "member:kick");

    const target = await this.prisma.member.findUnique({
      where: { id: memberId },
    });
    if (!target || target.workspaceId !== workspaceId) {
      throw new NotFoundException("Member not found.");
    }
    if (target.role === MemberRole.OWNER) {
      throw new ForbiddenException("Cannot kick the workspace owner.");
    }
    if (target.userId === actor.userId) {
      throw new ForbiddenException("You cannot kick yourself.");
    }
    if (actor.role === MemberRole.ADMIN && target.role === MemberRole.ADMIN) {
      throw new ForbiddenException("Admins cannot kick other admins.");
    }

    await this.prisma.member.delete({ where: { id: memberId } });
  }

  async listMessages(
    channelId: string,
    userId: string,
    limit = 30,
    cursor?: string,
  ) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true },
    });

    if (!channel) {
      throw new NotFoundException("Channel not found.");
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
      orderBy: { createdAt: "desc" },
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
      throw new NotFoundException("Channel not found.");
    }

    await this.assertMember(channel.workspaceId, input.userId);

    const content = input.content.trim();
    if (content.length === 0) {
      throw new BadRequestException("Message cannot be empty.");
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

  async listMembers(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    return this.prisma.member.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async updateMemberRole(input: UpdateMemberRoleInput) {
    const actor = await this.assertMember(input.workspaceId, input.actorUserId);
    this.assertPermission(actor.role, "member:role:update");

    if (input.role !== MemberRole.ADMIN && input.role !== MemberRole.MEMBER) {
      throw new BadRequestException(
        "Only ADMIN or MEMBER roles can be assigned.",
      );
    }

    const target = await this.prisma.member.findUnique({
      where: { id: input.memberId },
    });

    if (!target || target.workspaceId !== input.workspaceId) {
      throw new NotFoundException("Member not found.");
    }
    if (target.role === MemberRole.OWNER) {
      throw new ForbiddenException("Owner role cannot be changed.");
    }
    if (target.userId === actor.userId) {
      throw new ForbiddenException("You cannot change your own role.");
    }

    // Admins can only moderate MEMBER roles.
    if (actor.role === MemberRole.ADMIN && target.role !== MemberRole.MEMBER) {
      throw new ForbiddenException("Admins can only change MEMBER roles.");
    }

    return this.prisma.member.update({
      where: { id: input.memberId },
      data: { role: input.role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getWorkspaceSettings(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        allowMemberChannelCreation: true,
        allowMemberInviteCreation: true,
      },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found.");
    }
    return workspace;
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    userId: string,
    input: {
      allowMemberChannelCreation?: boolean;
      allowMemberInviteCreation?: boolean;
    },
  ) {
    await this.assertMember(workspaceId, userId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(typeof input.allowMemberChannelCreation === "boolean"
          ? { allowMemberChannelCreation: input.allowMemberChannelCreation }
          : {}),
        ...(typeof input.allowMemberInviteCreation === "boolean"
          ? { allowMemberInviteCreation: input.allowMemberInviteCreation }
          : {}),
      },
      select: {
        id: true,
        allowMemberChannelCreation: true,
        allowMemberInviteCreation: true,
      },
    });
  }

  private async assertMember(
    workspaceId: string,
    userId: string,
    allowedRoles?: MemberRole[],
  ) {
    const member = await this.prisma.member.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException("You are not a member of this workspace.");
    }

    if (allowedRoles && !allowedRoles.includes(member.role)) {
      throw new ForbiddenException("Insufficient permissions.");
    }

    return member;
  }

  private assertPermission(role: MemberRole, action: WorkspaceAction) {
    const actions = rolePermissions[role] || [];
    if (!actions.includes(action)) {
      throw new ForbiddenException("Insufficient permissions.");
    }
  }

  private async registerInviteRouteIfEnabled(
    code: string,
    expiresAt: Date | null,
  ) {
    const controlPlaneUrl = process.env.CONTROL_PLANE_URL?.trim();
    const resolverToken = process.env.RESOLVER_REGISTER_TOKEN?.trim();
    const instancePublicUrl = this.getInstancePublicUrl();

    if (!controlPlaneUrl || !resolverToken || !instancePublicUrl) {
      return;
    }

    const endpoint = `${controlPlaneUrl.replace(/\/$/, "")}/api/resolver/register`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-resolver-token": resolverToken,
        },
        body: JSON.stringify({
          code,
          targetUrl: instancePublicUrl,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        console.warn(
          `[resolver] failed to register invite code ${code}: HTTP ${response.status} ${details}`,
        );
      }
    } catch (error) {
      console.warn(`[resolver] failed to register invite code ${code}:`, error);
    }
  }

  private getInstancePublicUrl(): string | null {
    const explicit = process.env.INSTANCE_PUBLIC_URL?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }

    const domain = process.env.DOMAIN?.trim();
    if (!domain) {
      return null;
    }
    if (domain.startsWith("http://") || domain.startsWith("https://")) {
      return domain.replace(/\/$/, "");
    }
    return `https://${domain}`;
  }
}
