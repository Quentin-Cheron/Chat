import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ChannelType, MemberRole } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { requireUserSession } from './auth-session';
import { ChatGateway } from './chat.gateway';
import { WorkspaceService } from './workspace.service';

@Controller()
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('workspaces')
  async listWorkspaces(@Req() req: FastifyRequest) {
    const user = await requireUserSession(req);
    return this.workspaceService.listWorkspacesForUser(user.id);
  }

  @Post('workspaces')
  async createWorkspace(@Req() req: FastifyRequest, @Body() body: { name: string }) {
    const user = await requireUserSession(req);
    return this.workspaceService.createWorkspace({
      name: body.name,
      ownerId: user.id,
    });
  }

  @Get('workspaces/:workspaceId/channels')
  async listChannels(@Req() req: FastifyRequest, @Param('workspaceId') workspaceId: string) {
    const user = await requireUserSession(req);
    return this.workspaceService.listChannels(workspaceId, user.id);
  }

  @Post('workspaces/:workspaceId/channels')
  async createChannel(
    @Req() req: FastifyRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name: string; type?: ChannelType },
  ) {
    const user = await requireUserSession(req);
    return this.workspaceService.createChannel({
      workspaceId,
      userId: user.id,
      name: body.name,
      type: body.type || ChannelType.TEXT,
    });
  }

  @Post('workspaces/:workspaceId/invites')
  async createInvite(
    @Req() req: FastifyRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { maxUses?: number; expiresInHours?: number },
  ) {
    const user = await requireUserSession(req);
    return this.workspaceService.createInvite({
      workspaceId,
      userId: user.id,
      maxUses: body.maxUses,
      expiresInHours: body.expiresInHours,
    });
  }

  @Post('invites/:code/join')
  async joinWithInvite(@Req() req: FastifyRequest, @Param('code') code: string) {
    const user = await requireUserSession(req);
    return this.workspaceService.joinWorkspaceWithInvite(code, user.id);
  }

  @Get('channels/:channelId/messages')
  async listMessages(
    @Req() req: FastifyRequest,
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const user = await requireUserSession(req);
    return this.workspaceService.listMessages(channelId, user.id, limit, cursor);
  }

  @Post('channels/:channelId/messages')
  async createMessage(@Req() req: FastifyRequest, @Param('channelId') channelId: string, @Body() body: { content: string }) {
    const user = await requireUserSession(req);
    const message = await this.workspaceService.createMessage({
      channelId,
      userId: user.id,
      content: body.content,
    });
    this.chatGateway.emitNewMessage(channelId, message);
    return message;
  }

  @Get('workspaces/:workspaceId/members')
  async listMembers(@Req() req: FastifyRequest, @Param('workspaceId') workspaceId: string) {
    const user = await requireUserSession(req);
    return this.workspaceService.listMembers(workspaceId, user.id);
  }

  @Post('workspaces/:workspaceId/members/:memberId/role')
  async updateMemberRole(
    @Req() req: FastifyRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: { role: MemberRole },
  ) {
    const user = await requireUserSession(req);
    return this.workspaceService.updateMemberRole({
      workspaceId,
      actorUserId: user.id,
      memberId,
      role: body.role,
    });
  }
}
