import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AppController } from './app.controller';
import { AuthController } from './auth.controller';
import { ChatGateway } from './chat.gateway';
import { RateLimitService } from './rate-limit.service';
import { ResolverController } from './resolver.controller';
import { ResolverService } from './resolver.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { VoiceSfuService } from './voice-sfu.service';

@Module({
  controllers: [AppController, AuthController, WorkspaceController, ResolverController],
  providers: [PrismaService, WorkspaceService, ResolverService, RateLimitService, VoiceSfuService, ChatGateway],
})
export class AppModule {}
