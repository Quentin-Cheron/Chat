import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import * as mediasoup from "mediasoup";

type VoiceParticipant = {
  peerId: string;
  name: string;
  email: string;
  speaking: boolean;
};

type MediaPeer = {
  socketId: string;
  channelId: string;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
};

@Injectable()
export class VoiceSfuService implements OnModuleInit, OnModuleDestroy {
  private worker: mediasoup.types.Worker | null = null;
  private router: mediasoup.types.Router | null = null;
  private readonly peers = new Map<string, MediaPeer>();
  private readonly rooms = new Map<string, Set<string>>();
  private readonly producerToPeer = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    this.worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
      rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 40100),
    });
    this.router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const peer of this.peers.values()) {
      for (const transport of peer.transports.values()) {
        transport.close();
      }
    }
    this.peers.clear();
    this.rooms.clear();
    this.producerToPeer.clear();
    this.router?.close();
    this.worker?.close();
    this.router = null;
    this.worker = null;
  }

  joinChannel(socketId: string, channelId: string): void {
    const existing = this.peers.get(socketId);
    if (existing && existing.channelId !== channelId) {
      this.leaveChannel(socketId);
    }
    if (this.peers.has(socketId)) {
      return;
    }
    this.peers.set(socketId, {
      socketId,
      channelId,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });
    if (!this.rooms.has(channelId)) {
      this.rooms.set(channelId, new Set());
    }
    this.rooms.get(channelId)!.add(socketId);
  }

  leaveChannel(socketId: string): string | null {
    const peer = this.peers.get(socketId);
    if (!peer) {
      return null;
    }
    for (const consumer of peer.consumers.values()) {
      consumer.close();
    }
    for (const producer of peer.producers.values()) {
      this.producerToPeer.delete(producer.id);
      producer.close();
    }
    for (const transport of peer.transports.values()) {
      transport.close();
    }
    this.peers.delete(socketId);
    const room = this.rooms.get(peer.channelId);
    room?.delete(socketId);
    if (room && room.size === 0) {
      this.rooms.delete(peer.channelId);
    }
    return peer.channelId;
  }

  getChannelId(socketId: string): string | null {
    return this.peers.get(socketId)?.channelId || null;
  }

  getPeersInRoom(channelId: string): string[] {
    return Array.from(this.rooms.get(channelId) ?? []);
  }

  listProducers(channelId: string, excludeSocketId: string): Array<{ producerId: string; peerId: string }> {
    const ids = this.getPeersInRoom(channelId).filter((peerId) => peerId !== excludeSocketId);
    const out: Array<{ producerId: string; peerId: string }> = [];
    for (const peerId of ids) {
      const peer = this.peers.get(peerId);
      if (!peer) continue;
      for (const producer of peer.producers.values()) {
        out.push({ producerId: producer.id, peerId });
      }
    }
    return out;
  }

  getRouterRtpCapabilities(): mediasoup.types.RtpCapabilities {
    if (!this.router) {
      throw new Error("router-not-ready");
    }
    return this.router.rtpCapabilities;
  }

  async createWebRtcTransport(socketId: string): Promise<{
    id: string;
    iceParameters: mediasoup.types.IceParameters;
    iceCandidates: mediasoup.types.IceCandidate[];
    dtlsParameters: mediasoup.types.DtlsParameters;
  }> {
    if (!this.router) {
      throw new Error("router-not-ready");
    }
    const peer = this.peers.get(socketId);
    if (!peer) {
      throw new Error("peer-not-in-room");
    }
    const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    peer.transports.set(transport.id, transport);
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    socketId: string,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters,
  ): Promise<void> {
    const peer = this.peers.get(socketId);
    if (!peer) {
      throw new Error("peer-not-in-room");
    }
    const transport = peer.transports.get(transportId);
    if (!transport) {
      throw new Error("transport-not-found");
    }
    await transport.connect({ dtlsParameters });
  }

  async produce(
    socketId: string,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
  ): Promise<string> {
    const peer = this.peers.get(socketId);
    if (!peer) {
      throw new Error("peer-not-in-room");
    }
    const transport = peer.transports.get(transportId);
    if (!transport) {
      throw new Error("transport-not-found");
    }
    const producer = await transport.produce({ kind, rtpParameters });
    peer.producers.set(producer.id, producer);
    this.producerToPeer.set(producer.id, socketId);
    producer.on("transportclose", () => {
      peer.producers.delete(producer.id);
      this.producerToPeer.delete(producer.id);
    });
    return producer.id;
  }

  async consume(
    socketId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
  ): Promise<{
    id: string;
    producerId: string;
    kind: mediasoup.types.MediaKind;
    rtpParameters: mediasoup.types.RtpParameters;
    peerId: string;
  }> {
    if (!this.router) {
      throw new Error("router-not-ready");
    }
    const peer = this.peers.get(socketId);
    if (!peer) {
      throw new Error("peer-not-in-room");
    }
    const transport = peer.transports.get(transportId);
    if (!transport) {
      throw new Error("transport-not-found");
    }
    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error("cannot-consume");
    }
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    peer.consumers.set(consumer.id, consumer);
    consumer.on("transportclose", () => {
      peer.consumers.delete(consumer.id);
    });
    const ownerPeerId = this.producerToPeer.get(producerId);
    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      peerId: ownerPeerId || "",
    };
  }

  getParticipantRoster(
    channelId: string,
    userResolver: (peerId: string) => VoiceParticipant,
  ): VoiceParticipant[] {
    return this.getPeersInRoom(channelId).map((peerId) => userResolver(peerId));
  }
}
