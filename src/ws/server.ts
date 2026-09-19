import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Match } from "../types/db.ts";
import { wsArcjet } from "../arcjet.ts";

const matchSubscribers = new Map<number, Set<WebSocket>>();
const subscriptionCounts = new WeakMap<WebSocket, number>();
const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;

interface SendJsonParams {
  socket: WebSocket;
  payload: unknown;
}

interface BroadcastParams {
  wss: WebSocketServer;
  payload: unknown;
}

interface BroadcastToMatchParams {
  matchId: number;
  payload: unknown;
}

interface BroadcastMatchCreatedParams {
  match: Match;
}

interface BroadcastCommentaryParams {
  matchId: number;
  comment: unknown;
}

interface BroadcastScoreUpdateParams {
  matchId: number;
  homeScore: number;
  awayScore: number;
  stats: unknown;
}

interface AttachWssParams {
  server: Server;
}

interface WebSocketApi {
  broadcastMatchCreated: (params: BroadcastMatchCreatedParams) => void;
  broadcastCommentary: (params: BroadcastCommentaryParams) => void;
  broadcastScoreUpdate: (params: BroadcastScoreUpdateParams) => void;
}

interface SubscriptionParams {
  matchId: number;
  socket: WebSocket;
}

interface SubscribeResult {
  isNew: boolean;
  ok: boolean;
}

function isValidMatchId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    Number.isSafeInteger(value)
  );
}

function subscribe({ matchId, socket }: SubscriptionParams): SubscribeResult {
  const currentCount = subscriptionCounts.get(socket) ?? 0;
  if (currentCount >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
    return { isNew: false, ok: false };
  }

  let subscribers = matchSubscribers.get(matchId);
  if (!subscribers) {
    subscribers = new Set();
    matchSubscribers.set(matchId, subscribers);
  }

  const wasAlreadySubscribed = subscribers.has(socket);
  subscribers.add(socket);

  if (!wasAlreadySubscribed) {
    subscriptionCounts.set(socket, currentCount + 1);
  }
  return { isNew: !wasAlreadySubscribed, ok: true };
}

function unsubscribe({ matchId, socket }: SubscriptionParams): boolean {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return false;

  const wasSubscribed = subscribers.delete(socket);

  if (wasSubscribed) {
    const currentCount = subscriptionCounts.get(socket) ?? 0;
    subscriptionCounts.set(socket, Math.max(0, currentCount - 1));
  }

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }

  return wasSubscribed;
}

function cleanupSubscription(socket: WebSocket) {
  for (const [matchId, subscribers] of matchSubscribers) {
    if (subscribers.delete(socket) && subscribers.size === 0) {
      matchSubscribers.delete(matchId);
    }
  }

  subscriptionCounts.delete(socket);
}

function sendJson({ socket, payload }: SendJsonParams): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcastToAll({ wss, payload }: BroadcastParams) {
  if (wss.clients.size === 0) return;

  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(message);
  }
}

function broadcastToMatch({ matchId, payload }: BroadcastToMatchParams) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify(payload);

  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function handleMessage(socket: WebSocket, data: string) {
  let message: unknown;

  try {
    message = JSON.parse(data.toString());
  } catch {
    return sendJson({
      socket,
      payload: { type: "error", message: "Invalid JSON" },
    });
  }

  if (message === null || typeof message !== "object") {
    return sendJson({
      socket,
      payload: { type: "error", message: "Invalid message format" },
    });
  }

  const msg = message as Record<string, unknown>;

  if (msg.type === "subscribe" && isValidMatchId(msg.matchId)) {
    const { isNew, ok } = subscribe({ matchId: msg.matchId, socket });

    if (!ok) {
      return sendJson({
        socket,
        payload: {
          type: "error",
          message: "Subscription limit reached",
          matchId: msg.matchId,
        },
      });
    }

    sendJson({
      socket,
      payload: isNew
        ? { type: "subscribed", matchId: msg.matchId }
        : {
            type: "already_subscribed",
            matchId: msg.matchId,
          },
    });
    return;
  }

  if (msg.type === "unsubscribe" && isValidMatchId(msg.matchId)) {
    const wasSubscribed = unsubscribe({ matchId: msg.matchId, socket });

    sendJson({
      socket,
      payload: wasSubscribed
        ? { type: "unsubscribed", matchId: msg.matchId }
        : {
            type: "not_subscribed",
            matchId: msg.matchId,
          },
    });
    return;
  }

  if (msg.type === "subscribe" || msg.type === "unsubscribe") {
    return sendJson({
      socket,
      payload: { type: "error", message: "Invalid matchId" },
    });
  }

  return sendJson({
    socket,
    payload: { type: "error", message: "Unknown message type" },
  });
}

export function attachWebSocketServer({
  server,
}: AttachWssParams): WebSocketApi {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", async (socket: WebSocket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);

        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;
          const reason = decision.reason.isRateLimit()
            ? "Rate limit exceeded"
            : "Access denied";
          socket.close(code, reason);
          return;
        }
      } catch (e) {
        console.error(`WS connection error ${e}`);
        socket.close(1011, "Server security error");
        return;
      }
    }

    console.log("WebSocket client connected");

    sendJson({ socket, payload: { type: "welcome" } });

    socket.on("message", (data) => {
      handleMessage(socket, data.toString());
    });

    socket.on("error", (err) => {
      console.error(`WebSocket error: ${err}`);
    });

    socket.on("close", () => {
      console.log("Client disconnected");
      cleanupSubscription(socket);
    });
  });

  function broadcastMatchCreated({ match }: BroadcastMatchCreatedParams) {
    broadcastToAll({ wss, payload: { type: "match_created", data: match } });
  }

  function broadcastCommentary({
    matchId,
    comment,
  }: BroadcastCommentaryParams) {
    broadcastToMatch({
      matchId,
      payload: { type: "commentary", data: comment },
    });
  }

  function broadcastScoreUpdate({
    matchId,
    homeScore,
    awayScore,
    stats
  }: BroadcastScoreUpdateParams) {
    broadcastToAll({
      wss,
      payload: {
        type: "score_update",
        matchId,
        data: { homeScore, awayScore, stats },
      },
    });
  }

  return { broadcastMatchCreated, broadcastCommentary, broadcastScoreUpdate };
}
