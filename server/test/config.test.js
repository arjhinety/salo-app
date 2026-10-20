// SALO_SDK_MAX_RETRIES: default 1, integers 0 or more, and the value reaches the SDK client. No network, no key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readSdkMaxRetries, DEFAULT_SDK_MAX_RETRIES } from "../src/config.js";
import { createModelClient } from "../src/server.js";

const SERVER = fileURLToPath(new URL("../src/server.js", import.meta.url));

test("SALO_SDK_MAX_RETRIES unset gives the default (1, today's value)", () => {
  assert.equal(DEFAULT_SDK_MAX_RETRIES, 1);
  assert.equal(readSdkMaxRetries({}), 1);
});

test("SALO_SDK_MAX_RETRIES accepts integers 0 and up", () => {
  assert.equal(readSdkMaxRetries({ SALO_SDK_MAX_RETRIES: "0" }), 0);
  assert.equal(readSdkMaxRetries({ SALO_SDK_MAX_RETRIES: "3" }), 3);
});

test("SALO_SDK_MAX_RETRIES rejects negative, fractional, empty and non-numeric values", () => {
  for (const bad of ["-1", "1.5", "", "abc", " 0", "1e2"]) {
    assert.throws(() => readSdkMaxRetries({ SALO_SDK_MAX_RETRIES: bad }), /SALO_SDK_MAX_RETRIES must be an integer 0 or more/, `value "${bad}"`);
  }
});

test("the client gets maxRetries from the setting (0 means no SDK retry)", () => {
  assert.equal(createModelClient({ apiKey: "sk-ant-TEST-ONLY-not-a-real-key", maxRetries: 0 }).maxRetries, 0);
  assert.equal(createModelClient({ apiKey: "sk-ant-TEST-ONLY-not-a-real-key", maxRetries: 1 }).maxRetries, 1);
});

test("startup refuses an invalid SALO_SDK_MAX_RETRIES", async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: "18797", ANTHROPIC_API_KEY: "", SALO_SDK_MAX_RETRIES: "two" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d) => { err += d; });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 1);
  assert.match(err, /SALO_SDK_MAX_RETRIES must be an integer 0 or more \(got "two"\)/);
});

test("startup prints the SDK retry count it uses (0 for evaluation runs)", async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: "18798", ANTHROPIC_API_KEY: "", SALO_SDK_MAX_RETRIES: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no startup line; got: ${out}`)), 10000);
      child.stdout.on("data", () => {
        if (out.includes("SDK retries per /parse call: 0")) { clearTimeout(timer); resolve(); }
      });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`exited ${code}: ${out}`)); });
    });
  } finally {
    child.kill();
  }
});
