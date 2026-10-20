// GET /health: prompt_sha256 (sha256 of the exact system prompt sent to the model), git_commit and git_dirty. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApp, readBuildInfo, SERVER_DIR } from "../src/server.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";

const SYSTEM = buildSystemPrompt(loadTuningRows());
const FAKE_KEY = "sk-ant-TEST-ONLY-not-a-real-key";
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test("/health reports the sha256 of the system prompt the model receives, stable across requests, with the build identity", async (t) => {
  const app = createApp({ client: null, keyConfigured: true, systemPrompt: SYSTEM, build: { gitCommit: COMMIT, gitDirty: true } });
  const { server, base } = await startServer(app);
  t.after(() => new Promise((r) => server.close(r)));
  const bodies = [];
  for (let i = 0; i < 3; i++) bodies.push(await (await fetch(`${base}/health`)).json());
  assert.deepEqual(Object.keys(bodies[0]).sort(), ["git_commit", "git_dirty", "key", "model", "ok", "prompt_sha256", "request_config_sha256"]);
  assert.equal(bodies[0].prompt_sha256, sha(buildSystemPrompt(loadTuningRows())));
  assert.equal(bodies[0].prompt_sha256, sha(SYSTEM));
  assert.match(bodies[0].prompt_sha256, /^[0-9a-f]{64}$/);
  assert.match(bodies[0].request_config_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
  assert.equal(bodies[0].git_commit, COMMIT);
  assert.equal(bodies[0].git_dirty, true);
  assert.ok(!JSON.stringify(bodies).includes(FAKE_KEY));
});

test("the hash changes when the system prompt changes (the recorder relies on this)", async (t) => {
  const app = createApp({ client: null, keyConfigured: false, systemPrompt: SYSTEM + "\n" });
  const { server, base } = await startServer(app);
  t.after(() => new Promise((r) => server.close(r)));
  const body = await (await fetch(`${base}/health`)).json();
  assert.notEqual(body.prompt_sha256, sha(SYSTEM));
  assert.equal(body.prompt_sha256, sha(SYSTEM + "\n"));
  assert.equal(body.git_commit, null, "no build info supplied: null");
  assert.equal(body.git_dirty, null);
});

test("readBuildInfo: commit and dirty state from git; null when git is unavailable or the output is not a commit", () => {
  const fake = (outputs) => (cmd, args) => {
    const key = args.join(" ");
    if (!(key in outputs)) throw new Error("git not found");
    return outputs[key];
  };
  assert.deepEqual(readBuildInfo(SERVER_DIR, fake({ "rev-parse HEAD": `${COMMIT}\n`, "status --porcelain -- .": "" })), { gitCommit: COMMIT, gitDirty: false });
  assert.deepEqual(readBuildInfo(SERVER_DIR, fake({ "rev-parse HEAD": `${COMMIT}\n`, "status --porcelain -- .": " M server.js\n" })), { gitCommit: COMMIT, gitDirty: true });
  assert.deepEqual(readBuildInfo(SERVER_DIR, fake({})), { gitCommit: null, gitDirty: null });
  assert.deepEqual(readBuildInfo(SERVER_DIR, fake({ "rev-parse HEAD": "not-a-sha\n", "status --porcelain -- .": "" })), { gitCommit: null, gitDirty: false });
});

test("readBuildInfo on the real server directory gives a 40-hex commit or null, never throws", () => {
  const info = readBuildInfo();
  assert.ok(info.gitCommit === null || /^[0-9a-f]{40}$/.test(info.gitCommit));
  assert.ok(info.gitDirty === null || typeof info.gitDirty === "boolean");
});
