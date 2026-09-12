import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, mock, test } from "node:test";
import express from "express";

const now = Date.now();
const storedMatches = [
  {
    id: 1,
    sport: "football",
    homeTeam: "Lions",
    awayTeam: "Tigers",
    status: "scheduled",
    startTime: new Date(now - 60_000),
    endTime: new Date(now + 60_000),
    homeScore: 0,
    awayScore: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  },
  {
    id: 2,
    sport: "football",
    homeTeam: "Bears",
    awayTeam: "Wolves",
    status: "scheduled",
    startTime: new Date(now - 120_000),
    endTime: new Date(now - 60_000),
    homeScore: 2,
    awayScore: 1,
    createdAt: new Date(now - 1_000),
    updatedAt: new Date(now - 1_000),
  },
] as const;

const statusUpdates: string[] = [];
const fakeDb = {
  select: () => ({
    from: () => ({
      orderBy: () => ({
        limit: async () => storedMatches,
      }),
    }),
  }),
  update: () => ({
    set: ({ status }: { status: string }) => ({
      where: async () => {
        statusUpdates.push(status);
      },
    }),
  }),
};

mock.module("../src/db/db.ts", {
  namedExports: { db: fakeDb },
});

const { matchRouter } = await import("../src/routes/matches.ts");
const app = express();
app.use(express.json());
app.use("/matches", matchRouter);

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

test("GET /matches syncs scheduled matches and returns current statuses", async () => {
  const response = await fetch(`${baseUrl}/matches`);
  const body = (await response.json()) as {
    data: Array<{ id: number; status: string }>;
  };

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.data.map(({ id, status }) => ({ id, status })),
    [
      { id: 1, status: "live" },
      { id: 2, status: "finished" },
    ]
  );
  assert.deepEqual(statusUpdates.sort(), ["finished", "live"]);
});

const validMatch = {
  sport: "football",
  homeTeam: "Lions",
  awayTeam: "Tigers",
  startTime: "2026-09-12T12:00:00Z",
  endTime: "2026-09-12T14:00:00Z",
};

for (const field of ["startTime", "endTime"] as const) {
  test(`POST /matches rejects a null ${field}`, async () => {
    const response = await fetch(`${baseUrl}/matches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validMatch, [field]: null }),
    });

    assert.equal(response.status, 400);
  });
}

for (const field of ["homeScore", "awayScore"] as const) {
  test(`POST /matches rejects a boolean ${field}`, async () => {
    const response = await fetch(`${baseUrl}/matches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validMatch, [field]: true }),
    });

    assert.equal(response.status, 400);
  });
}
