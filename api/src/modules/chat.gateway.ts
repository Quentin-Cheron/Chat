import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { fromNodeHeaders } from "better-auth/node";
import { Server, Socket } from "socket.io";
import { auth } from "../auth";
import { VoiceSfuService } from "./voice-sfu.service";

type VoiceUser = {
  socketId: string;
  userId: string;
  name: string;
  email: string;
  speaking: boolean;
};

type VoiceRequest =
  | {
      action: "join";
      data: {
        channelId: string;
        user?: { id?: string; name?: string; email?: string };
      };
    }
  | {
      action: "leave";
      data: {
        channelId: string;
      };
    }
  | {
      action: "createTransport";
      data: {
        channelId: string;
      };
    }
  | {
      action: "connectTransport";
      data: {
        channelId: string;
        transportId: string;
        dtlsParameters: Record<string, unknown>;
      };
    }
  | {
      action: "produce";
      data: {
        channelId: string;
        transportId: string;
        kind: "audio";
        rtpParameters: Record<string, unknown>;
      };
    }
  | {
      action: "consume";
      data: {
        channelId: string;
        transportId: string;
        producerId: string;
        rtpCapabilities: Record<string, unknown>;
      };
    }
  | {
      action: "setSpeaking";
      data: {
        channelId: string;
        speaking: boolean;
      };
    };

@WebSocketGateway({
  namespace: "/ws",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly socketUsers = new Map<string, VoiceUser>();

  constructor(private readonly voiceSfuService: VoiceSfuService) {}

  private resolveUser(peerId: string): VoiceUser {
    const user = this.socketUsers.get(peerId);
    return {
      socketId: peerId,
      userId: user?.userId || peerId,
      name: user?.name || "User",
      email: user?.email || "",
      speaking: Boolean(user?.speaking),
    };
  }

  private emitVoicePresence(channelId: string): void {
    const participants = this.voiceSfuService.getParticipantRoster(
      channelId,
      (peerId) => {
        const user = this.resolveUser(peerId);
        return {
          peerId,
          name: user.name,
          email: user.email,
          speaking: user.speaking,
        };
      },
    );
    this.server.to(`voice:${channelId}`).emit("voice-presence", {
      channelId,
      participants,
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(client.handshake.headers),
      });
      if (session?.user) {
        this.socketUsers.set(client.id, {
          socketId: client.id,
          userId: session.user.id,
          name: session.user.name,
          email: session.user.email,
          speaking: false,
        });
      }
    } catch {
      // keep socket connected
    }

    client.on(
      "voice:req",
      async (
        payload: VoiceRequest,
        ack?: (res: { ok: boolean; data?: unknown; error?: string }) => void,
      ) => {
        const send = (res: { ok: boolean; data?: unknown; error?: string }) => {
          if (ack) {
            ack(res);
          }
        };
        try {
          const response = await this.handleVoiceRequest(client, payload);
          send({ ok: true, data: response });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "voice-request-failed";
          send({ ok: false, error: message });
        }
      },
    );
  }

  handleDisconnect(client: Socket): void {
    const channelId = this.voiceSfuService.leaveChannel(client.id);
    if (channelId) {
      client.to(`voice:${channelId}`).emit("voice-peer-left", {
        channelId,
        peerId: client.id,
      });
      this.emitVoicePresence(channelId);
    }
    this.socketUsers.delete(client.id);
  }

  private async handleVoiceRequest(
    client: Socket,
    payload: VoiceRequest,
  ): Promise<unknown> {
    switch (payload.action) {
      case "join": {
        const channelId = payload.data.channelId;
        if (!channelId) {
          throw new Error("channel-required");
        }
        const known = this.socketUsers.get(client.id);
        if (payload.data.user) {
          this.socketUsers.set(client.id, {
            socketId: client.id,
            userId: payload.data.user.id || known?.userId || client.id,
            name: payload.data.user.name || known?.name || "User",
            email: payload.data.user.email || known?.email || "",
            speaking: known?.speaking ?? false,
          });
        } else if (!known) {
          this.socketUsers.set(client.id, {
            socketId: client.id,
            userId: client.id,
            name: "User",
            email: "",
            speaking: false,
          });
        }

        this.voiceSfuService.joinChannel(client.id, channelId);
        client.join(`voice:${channelId}`);
        const producers = this.voiceSfuService.listProducers(channelId, client.id);
        this.emitVoicePresence(channelId);
        return {
          channelId,
          rtpCapabilities: this.voiceSfuService.getRouterRtpCapabilities(),
          producers,
        };
      }
      case "leave": {
        const channelId = payload.data.channelId;
        this.voiceSfuService.leaveChannel(client.id);
        client.leave(`voice:${channelId}`);
        this.emitVoicePresence(channelId);
        return { channelId };
      }
      case "createTransport": {
        const channelId = payload.data.channelId;
        const activeChannel = this.voiceSfuService.getChannelId(client.id);
        if (!activeChannel || activeChannel !== channelId) {
          throw new Error("not-joined");
        }
        return this.voiceSfuService.createWebRtcTransport(client.id);
      }
      case "connectTransport": {
        const channelId = payload.data.channelId;
        const activeChannel = this.voiceSfuService.getChannelId(client.id);
        if (!activeChannel || activeChannel !== channelId) {
          throw new Error("not-joined");
        }
        await this.voiceSfuService.connectTransport(
          client.id,
          payload.data.transportId,
          payload.data.dtlsParameters as any,
        );
        return { connected: true };
      }
      case "produce": {
        const channelId = payload.data.channelId;
        const activeChannel = this.voiceSfuService.getChannelId(client.id);
        if (!activeChannel || activeChannel !== channelId) {
          throw new Error("not-joined");
        }
        const producerId = await this.voiceSfuService.produce(
          client.id,
          payload.data.transportId,
          payload.data.kind,
          payload.data.rtpParameters as any,
        );
        client.to(`voice:${channelId}`).emit("voice-new-producer", {
          channelId,
          producerId,
          peerId: client.id,
        });
        return { id: producerId };
      }
      case "consume": {
        const channelId = payload.data.channelId;
        const activeChannel = this.voiceSfuService.getChannelId(client.id);
        if (!activeChannel || activeChannel !== channelId) {
          throw new Error("not-joined");
        }
        return this.voiceSfuService.consume(
          client.id,
          payload.data.transportId,
          payload.data.producerId,
          payload.data.rtpCapabilities as any,
        );
      }
      case "setSpeaking": {
        const channelId = payload.data.channelId;
        const user = this.socketUsers.get(client.id);
        if (user) {
          user.speaking = Boolean(payload.data.speaking);
          this.socketUsers.set(client.id, user);
        }
        this.server.to(`voice:${channelId}`).emit("voice-speaking", {
          channelId,
          peerId: client.id,
          speaking: Boolean(payload.data.speaking),
        });
        this.emitVoicePresence(channelId);
        return { ok: true };
      }
      default:
        throw new Error("unsupported-action");
    }
  }

  @SubscribeMessage("join-channel")
  joinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ): void {
    if (!payload?.channelId) {
      return;
    }
    client.join(`channel:${payload.channelId}`);
  }

  @SubscribeMessage("leave-channel")
  leaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ): void {
    if (!payload?.channelId) {
      return;
    }
    client.leave(`channel:${payload.channelId}`);
  }

  emitNewMessage(channelId: string, message: unknown): void {
    this.server.to(`channel:${channelId}`).emit("message:new", message);
  }
}
