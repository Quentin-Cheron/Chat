import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(_client: Socket): void {
    // no-op
  }

  handleDisconnect(_client: Socket): void {
    // no-op
  }

  @SubscribeMessage('join-channel')
  joinChannel(@ConnectedSocket() client: Socket, @MessageBody() payload: { channelId: string }): void {
    if (!payload?.channelId) {
      return;
    }
    client.join(`channel:${payload.channelId}`);
  }

  @SubscribeMessage('leave-channel')
  leaveChannel(@ConnectedSocket() client: Socket, @MessageBody() payload: { channelId: string }): void {
    if (!payload?.channelId) {
      return;
    }
    client.leave(`channel:${payload.channelId}`);
  }

  emitNewMessage(channelId: string, message: unknown): void {
    this.server.to(`channel:${channelId}`).emit('message:new', message);
  }
}
