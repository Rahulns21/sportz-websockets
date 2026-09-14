import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Match } from "../types/db.ts";
import { wsArcjet } from "../arcjet.ts";

const matchSubscribers = new Map<number, Set<WebSocket>>();

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

interface AttachWssParams {
  server: Server;
}

interface WebSocketApi {
  broadcastMatchCreated: (params: BroadcastMatchCreatedParams) => void;
  broadcastCommentary: (params: BroadcastCommentaryParams) => void;
}

interface SubscriptionParams {
  matchId: number;
  socket: WebSocket;
}

function subscribe({ matchId, socket }: SubscriptionParams) {
  let subscribers = matchSubscribers.get(matchId);
  if (!subscribers) {
    subscribers = new Set();
    matchSubscribers.set(matchId, subscribers);
  }

  const wasAlreadySubscribed = subscribers.has(socket);
  subscribers.add(socket);
  return !wasAlreadySubscribed;
}

function unsubscribe({ matchId, socket }: SubscriptionParams) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return false;

  const wasSubscribed = subscribers.delete(socket);

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
}

function sendJson({ socket, payload }: SendJsonParams) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcastToAll({ wss, payload }: BroadcastParams) {
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

  if (
    msg.type === "subscribe" &&
    typeof msg.matchId === "number" &&
    Number.isInteger(msg.matchId)
  ) {
    const isNew = subscribe({ matchId: msg.matchId, socket });
    sendJson({
      socket,
      payload: isNew
        ? { type: "subscribed", matchId: msg.matchId }
        : {
            type: "error",
            message: "Already subscribed to this match",
            matchId: msg.matchId,
          },
    });
    return;
  }

  if (
    msg.type === "unsubscribe" &&
    typeof msg.matchId === "number" &&
    Number.isInteger(msg.matchId)
  ) {
    const wasSubscribed = unsubscribe({ matchId: msg.matchId, socket });

    sendJson({
      socket,
      payload: wasSubscribed
        ? { type: "unsubscribed", matchId: msg.matchId }
        : {
            type: "error",
            message: "Not subscribed to this match",
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

  return { broadcastMatchCreated, broadcastCommentary };
}
