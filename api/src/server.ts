import * as mediasoup from "mediasoup";
import * as http from "node:http";
import { Server, Socket } from "socket.io";

// ── Types ─────────────────────────────────────────────────────────────────────

type VoiceUser = {
  socketId: string;
  userId: string;
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

type VoiceRequest =
  | { action: "join"; data: { channelId: string; user?: { id?: string; name?: string; email?: string } } }
  | { action: "leave"; data: { channelId: string } }
  | { action: "createTransport"; data: { channelId: string } }
  | { action: "connectTransport"; data: { channelId: string; transportId: string; dtlsParameters: Record<string, unknown> } }
  | { action: "produce"; data: { channelId: string; transportId: string; kind: "audio"; rtpParameters: Record<string, unknown> } }
  | { action: "consume"; data: { channelId: string; transportId: string; producerId: string; rtpCapabilities: Record<string, unknown> } }
  | { action: "setSpeaking"; data: { channelId: string; speaking: boolean } };

// ── SFU state ─────────────────────────────────────────────────────────────────

let worker: mediasoup.types.Worker | null = null;
let router: mediasoup.types.Router | null = null;
const peers = new Map<string, MediaPeer>();
const rooms = new Map<string, Set<string>>();
const producerToPeer = new Map<string, string>();
const socketUsers = new Map<string, VoiceUser>();

async function initMediasoup(): Promise<void> {
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 40100),
  });
  router = await worker.createRouter({
    mediaCodecs: [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
    ],
  });
}

// ── SFU helpers ───────────────────────────────────────────────────────────────

function joinChannel(socketId: string, channelId: string): void {
  const existing = peers.get(socketId);
  if (existing && existing.channelId !== channelId) leaveChannel(socketId);
  if (peers.has(socketId)) return;
  peers.set(socketId, { socketId, channelId, transports: new Map(), producers: new Map(), consumers: new Map() });
  if (!rooms.has(channelId)) rooms.set(channelId, new Set());
  rooms.get(channelId)!.add(socketId);
}

function leaveChannel(socketId: string): string | null {
  const peer = peers.get(socketId);
  if (!peer) return null;
  for (const c of peer.consumers.values()) c.close();
  for (const p of peer.producers.values()) { producerToPeer.delete(p.id); p.close(); }
  for (const t of peer.transports.values()) t.close();
  peers.delete(socketId);
  const room = rooms.get(peer.channelId);
  room?.delete(socketId);
  if (room?.size === 0) rooms.delete(peer.channelId);
  return peer.channelId;
}

function listProducers(channelId: string, excludeSocketId: string): Array<{ producerId: string; peerId: string }> {
  const out: Array<{ producerId: string; peerId: string }> = [];
  for (const peerId of rooms.get(channelId) ?? []) {
    if (peerId === excludeSocketId) continue;
    for (const producer of peers.get(peerId)?.producers.values() ?? []) {
      out.push({ producerId: producer.id, peerId });
    }
  }
  return out;
}

// ── Socket.io handlers ────────────────────────────────────────────────────────

function resolveUser(peerId: string): VoiceUser {
  const u = socketUsers.get(peerId);
  return { socketId: peerId, userId: u?.userId || peerId, name: u?.name || "User", email: u?.email || "", speaking: Boolean(u?.speaking) };
}

function emitVoicePresence(io: Server, channelId: string): void {
  const participants = Array.from(rooms.get(channelId) ?? []).map((peerId) => {
    const u = resolveUser(peerId);
    return { peerId, name: u.name, email: u.email, speaking: u.speaking };
  });
  io.to(`voice:${channelId}`).emit("voice-presence", { channelId, participants });
}

async function handleVoiceRequest(io: Server, client: Socket, payload: VoiceRequest): Promise<unknown> {
  switch (payload.action) {
    case "join": {
      const { channelId, user } = payload.data;
      if (!channelId) throw new Error("channel-required");
      const known = socketUsers.get(client.id);
      socketUsers.set(client.id, {
        socketId: client.id,
        userId: user?.id || known?.userId || client.id,
        name: user?.name || known?.name || "User",
        email: user?.email || known?.email || "",
        speaking: known?.speaking ?? false,
      });
      joinChannel(client.id, channelId);
      client.join(`voice:${channelId}`);
      const producers = listProducers(channelId, client.id);
      emitVoicePresence(io, channelId);
      return { channelId, rtpCapabilities: router!.rtpCapabilities, producers };
    }
    case "leave": {
      const { channelId } = payload.data;
      leaveChannel(client.id);
      client.leave(`voice:${channelId}`);
      emitVoicePresence(io, channelId);
      return { channelId };
    }
    case "createTransport": {
      const { channelId } = payload.data;
      if (peers.get(client.id)?.channelId !== channelId) throw new Error("not-joined");
      const peer = peers.get(client.id)!;
      const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;
      const transport = await router!.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp }],
        enableUdp: true, enableTcp: true, preferUdp: true,
      });
      peer.transports.set(transport.id, transport);
      return { id: transport.id, iceParameters: transport.iceParameters, iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters };
    }
    case "connectTransport": {
      const { channelId, transportId, dtlsParameters } = payload.data;
      if (peers.get(client.id)?.channelId !== channelId) throw new Error("not-joined");
      const transport = peers.get(client.id)?.transports.get(transportId);
      if (!transport) throw new Error("transport-not-found");
      await transport.connect({ dtlsParameters: dtlsParameters as mediasoup.types.DtlsParameters });
      return { connected: true };
    }
    case "produce": {
      const { channelId, transportId, kind, rtpParameters } = payload.data;
      if (peers.get(client.id)?.channelId !== channelId) throw new Error("not-joined");
      const transport = peers.get(client.id)?.transports.get(transportId);
      if (!transport) throw new Error("transport-not-found");
      const producer = await transport.produce({ kind, rtpParameters: rtpParameters as mediasoup.types.RtpParameters });
      peers.get(client.id)!.producers.set(producer.id, producer);
      producerToPeer.set(producer.id, client.id);
      producer.on("transportclose", () => { peers.get(client.id)?.producers.delete(producer.id); producerToPeer.delete(producer.id); });
      client.to(`voice:${channelId}`).emit("voice-new-producer", { channelId, producerId: producer.id, peerId: client.id });
      return { id: producer.id };
    }
    case "consume": {
      const { channelId, transportId, producerId, rtpCapabilities } = payload.data;
      if (peers.get(client.id)?.channelId !== channelId) throw new Error("not-joined");
      const transport = peers.get(client.id)?.transports.get(transportId);
      if (!transport) throw new Error("transport-not-found");
      if (!router!.canConsume({ producerId, rtpCapabilities: rtpCapabilities as mediasoup.types.RtpCapabilities })) throw new Error("cannot-consume");
      const consumer = await transport.consume({ producerId, rtpCapabilities: rtpCapabilities as mediasoup.types.RtpCapabilities, paused: false });
      peers.get(client.id)!.consumers.set(consumer.id, consumer);
      consumer.on("transportclose", () => { peers.get(client.id)?.consumers.delete(consumer.id); });
      return { id: consumer.id, producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters, peerId: producerToPeer.get(producerId) || "" };
    }
    case "setSpeaking": {
      const { channelId, speaking } = payload.data;
      const u = socketUsers.get(client.id);
      if (u) { u.speaking = Boolean(speaking); socketUsers.set(client.id, u); }
      io.to(`voice:${channelId}`).emit("voice-speaking", { channelId, peerId: client.id, speaking: Boolean(speaking) });
      emitVoicePresence(io, channelId);
      return { ok: true };
    }
    default:
      throw new Error("unsupported-action");
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await initMediasoup();

  const httpServer = http.createServer((_req, res) => {
    if (_req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "voice", ts: new Date().toISOString() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  const wsNs = io.of("/ws");

  wsNs.on("connection", (client: Socket) => {
    client.on(
      "voice:req",
      async (payload: VoiceRequest, ack?: (res: { ok: boolean; data?: unknown; error?: string }) => void) => {
        const send = (res: { ok: boolean; data?: unknown; error?: string }) => ack?.(res);
        try {
          send({ ok: true, data: await handleVoiceRequest(wsNs as unknown as Server, client, payload) });
        } catch (e) {
          send({ ok: false, error: e instanceof Error ? e.message : "voice-request-failed" });
        }
      },
    );

    client.on("join-channel", (payload: { channelId: string }) => {
      if (payload?.channelId) client.join(`channel:${payload.channelId}`);
    });

    client.on("leave-channel", (payload: { channelId: string }) => {
      if (payload?.channelId) client.leave(`channel:${payload.channelId}`);
    });

    client.on("disconnect", () => {
      const channelId = leaveChannel(client.id);
      if (channelId) {
        client.to(`voice:${channelId}`).emit("voice-peer-left", { channelId, peerId: client.id });
        emitVoicePresence(wsNs as unknown as Server, channelId);
      }
      socketUsers.delete(client.id);
    });
  });

  const port = Number(process.env.PORT || 3001);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[voice] listening on ${port}`);
  });

  process.on("SIGTERM", () => {
    for (const peer of peers.values()) {
      for (const t of peer.transports.values()) t.close();
    }
    router?.close();
    worker?.close();
    process.exit(0);
  });
}

start().catch((e) => { console.error(e); process.exit(1); });
