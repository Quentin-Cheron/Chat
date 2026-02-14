import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

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

  private readonly voiceMembership = new Map<string, Set<string>>();

  handleConnection(_client: Socket): void {
    // no-op
  }

  handleDisconnect(client: Socket): void {
    const rooms = this.voiceMembership.get(client.id);
    if (!rooms) {
      return;
    }
    for (const room of rooms) {
      client.to(room).emit("voice-peer-left", { peerId: client.id });
    }
    this.voiceMembership.delete(client.id);
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

  @SubscribeMessage("join-voice")
  joinVoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ): void {
    if (!payload?.channelId) {
      return;
    }
    const room = `voice:${payload.channelId}`;
    const peers = Array.from(
      this.server.sockets.adapter.rooms.get(room) ?? [],
    ).filter((id) => id !== client.id);
    client.join(room);

    if (!this.voiceMembership.has(client.id)) {
      this.voiceMembership.set(client.id, new Set<string>());
    }
    this.voiceMembership.get(client.id)!.add(room);

    client.emit("voice-peers", { channelId: payload.channelId, peers });
    client.to(room).emit("voice-peer-joined", {
      channelId: payload.channelId,
      peerId: client.id,
    });
  }

  @SubscribeMessage("leave-voice")
  leaveVoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ): void {
    if (!payload?.channelId) {
      return;
    }
    const room = `voice:${payload.channelId}`;
    client.leave(room);
    const rooms = this.voiceMembership.get(client.id);
    rooms?.delete(room);
    client.to(room).emit("voice-peer-left", {
      channelId: payload.channelId,
      peerId: client.id,
    });
  }

  @SubscribeMessage("voice-signal")
  relayVoiceSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      channelId: string;
      targetId: string;
      description?: Record<string, unknown>;
      candidate?: Record<string, unknown>;
    },
  ): void {
    if (!payload?.channelId || !payload?.targetId) {
      return;
    }

    const room = `voice:${payload.channelId}`;
    const roomMembers = this.server.sockets.adapter.rooms.get(room);
    if (!roomMembers?.has(client.id) || !roomMembers.has(payload.targetId)) {
      return;
    }

    this.server.to(payload.targetId).emit("voice-signal", {
      channelId: payload.channelId,
      fromId: client.id,
      description: payload.description,
      candidate: payload.candidate,
    });
  }

  emitNewMessage(channelId: string, message: unknown): void {
    this.server.to(`channel:${channelId}`).emit("message:new", message);
  }
}
