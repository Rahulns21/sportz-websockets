import "dotenv/config";
import express from "express";
import http from "http";
import { securityMiddleware } from "./arcjet.ts";
import { env } from "./config/env.ts";
import { commentaryRouter } from "./routes/commentary.ts";
import { matchRouter } from "./routes/matches.ts";
import { attachWebSocketServer } from "./ws/server.ts";

const PORT = env.PORT;
const HOST: string = env.HOST;

const app = express();
const server = http.createServer(app);

app.use(securityMiddleware());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from express server!");
});

app.use("/matches", matchRouter);
app.use("/matches/:id/commentary", commentaryRouter);

const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer({
  server,
});
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Http Server is running on ${baseUrl}`);
  console.log(
    `WebSocket Server is running on ${baseUrl.replace("http", "ws")}/ws`
  );
});
