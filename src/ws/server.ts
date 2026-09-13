import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { Match } from "../db/db.ts";

interface SendJsonParams {
  socket: WebSocket;
  payload: unknown;
}

interface BroadcastParams {
  wss: WebSocketServer;
  payload: unknown;
}

interface AttachWssParams {
  server: Server;
}

interface WebSocketApi {
    broadcastMatchCreated: (match: Match) => void;
}

function sendJson({ socket, payload }: SendJsonParams) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast({ wss, payload }: BroadcastParams) {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(message);
  }
}

export function attachWebSocketServer({ server }: AttachWssParams): WebSocketApi {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", (socket: WebSocket) => {
    console.log("WebSocket client connected");

    sendJson({ socket, payload: { type: "welcome" } });

    socket.on("close", () => {
        console.log("Client disconnected");
    })

    socket.on("error", (err) => {
        console.error(`WebSocket error: ${err}`);
    });
  });

  function broadcastMatchCreated(match: Match) {
    broadcast({ wss, payload: { type: 'match_created', data: match }})
  }

  return { broadcastMatchCreated }
}
