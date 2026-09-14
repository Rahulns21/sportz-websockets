import express from "express";
import http from "http";
import { matchRouter } from "./routes/matches.js";
import { env } from "./config/env.ts";
import { attachWebSocketServer } from "./ws/server.ts";
import { securityMiddleware } from "./arcjet.ts";

const PORT: number = env.PORT;
const HOST: string = env.HOST;

const app = express();
const server = http.createServer(app);

app.use(securityMiddleware());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from express server!");
});

app.use("/matches", matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer({ server });
app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Http Server is running on ${baseUrl}`);
  console.log(`WebSocket Server is running on ${baseUrl.replace('http', 'ws')}/ws`);
});
