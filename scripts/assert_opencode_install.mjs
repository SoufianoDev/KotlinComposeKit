import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const home = process.env.HOME;
assert.ok(home, "The integration job must provide an isolated HOME directory.");

for (const directory of [
  home,
  process.env.XDG_CONFIG_HOME,
  process.env.XDG_DATA_HOME,
  process.env.XDG_CACHE_HOME,
].filter(Boolean)) {
  await fs.mkdir(directory, { recursive: true });
}

const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "kotlin-compose-kit-opencode-"));
const port = Number(process.env.OPENCODE_TEST_PORT || 43179);
const baseUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, CI: "true" };
const serverPassword = "kotlin-compose-kit-ci-password";
const serverEnv = { ...env, OPENCODE_PASSWORD: serverPassword };
const serverAuthorization = `Basic ${Buffer.from(`opencode:${serverPassword}`).toString("base64")}`;
let server;
let serverOutput = "";

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: workdir,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} failed (status=${result.status}):\n${result.error?.message || ""}\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return result.stdout.trim();
}

async function getJson(route) {
  const url = new URL(`${baseUrl}${route}`);
  url.searchParams.set("location[directory]", workdir);
  const response = await fetch(url, {
    headers: { Authorization: serverAuthorization },
  });
  const body = await response.text();
  assert.equal(response.ok, true, `GET ${route} returned ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function hasSkillManifest(directory) {
  try {
    await fs.access(path.join(directory, "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

try {
  const cliVersion = run("opencode", ["--version"], "OpenCode version");
  console.log(`OpenCode CLI: ${cliVersion}`);

  // Run outside the repository checkout so a local .opencode/plugins copy
  // cannot make this package-install test pass accidentally.
  // The first plugin-list request can race the cold-start background service.
  // OpenCode may temporarily report "No plugins found" while it loads configured
  // package plugins, so poll instead of treating the first empty response as final.
  const pluginListDeadline = Date.now() + 30_000;
  let listed = "";
  let pluginListAttempt = 0;
  while (Date.now() < pluginListDeadline) {
    pluginListAttempt += 1;
    listed = run("opencode", ["plugin", "list"], "OpenCode plugin list");
    if (/kotlin-compose-kit/i.test(listed)) break;
    if (!/No plugins found/i.test(listed)) {
      throw new Error(`Unexpected OpenCode plugin-list output:\\n${listed}`);
    }
    console.log(
      `OpenCode plugin service is still initializing (attempt ${pluginListAttempt}); retrying...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert.match(
    listed,
    /kotlin-compose-kit/i,
    `OpenCode did not list KotlinComposeKit after the cold-start wait. Last output:\\n${listed}`,
  );
  console.log(listed);

  server = spawn(
    "opencode",
    ["--print-logs", "--log-level", "debug", "serve", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: workdir, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on("data", (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-100_000);
    });
  }

  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`OpenCode server exited before becoming ready (code ${server.exitCode}).\nServer output:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/global/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, "OpenCode server did not become ready within 60 seconds.");

  const pluginDeadline = Date.now() + 30_000;
  let pluginResponse = { data: [] };
  let plugin;
  while (Date.now() < pluginDeadline) {
    pluginResponse = await getJson("/api/plugin");
    assert.ok(Array.isArray(pluginResponse.data), "plugin.list must return a data array.");
    plugin = pluginResponse.data.find((entry) => entry.id === "kotlin-compose-kit");
    if (plugin) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!plugin) {
    const logDirectory = path.join(
      process.env.XDG_DATA_HOME || path.join(home, ".local", "share"),
      "opencode",
      "log",
    );
    const logFiles = (await fs.readdir(logDirectory).catch(() => []))
      .filter((name) => name.endsWith(".log"))
      .sort();
    const fileLogs = [];
    for (const name of logFiles.slice(-3)) {
      const content = await fs.readFile(path.join(logDirectory, name), "utf8").catch(() => "");
      fileLogs.push(`--- ${name} ---\n${content.split(/\r?\n/).slice(-240).join("\n")}`);
    }
    throw new Error(
      `KotlinComposeKit was not registered by the OpenCode server after 30 seconds.\n` +
      `Plugin API response: ${JSON.stringify(pluginResponse.data)}\n` +
      `Server output:\n${serverOutput}\n` +
      `OpenCode log files:\n${fileLogs.join("\n")}`,
    );
  }
  assert.equal(
    plugin.state?.status,
    "active",
    `KotlinComposeKit must be active; received state: ${JSON.stringify(plugin.state)}`,
  );
  assert.equal(plugin.source?.type, "package", "The installed Git package must load as a package.");
  const expectedRepository = process.env.KOTLIN_COMPOSE_KIT_REPOSITORY;
  const expectedCommit = process.env.KOTLIN_COMPOSE_KIT_SHA;
  assert.ok(expectedRepository, "The integration job must provide the tested repository.");
  assert.ok(expectedCommit, "The integration job must provide the tested commit SHA.");
  assert.equal(
    plugin.source?.target,
    `git+https://github.com/${expectedRepository}.git#${expectedCommit}`,
    "OpenCode must load the exact package repository and immutable commit tested by this job.",
  );

  const skillResponse = await getJson("/api/skill");
  assert.ok(Array.isArray(skillResponse.data), "skill.list must return a data array.");
  const discoveredIds = new Set(skillResponse.data.map((skill) => skill.id));
  const expectedIds = [];
  for (const entry of await fs.readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (await hasSkillManifest(path.join(skillsRoot, entry.name))) expectedIds.push(entry.name);
  }

  const missing = expectedIds.filter((id) => !discoveredIds.has(id));
  assert.deepEqual(missing, [], "Every repository SKILL.md must be registered in OpenCode.");

  const router = skillResponse.data.find((skill) => skill.id === "using-kotlin-compose-kit");
  assert.ok(router, "The using-kotlin-compose-kit routing skill must be discoverable.");
  assert.match(router.content || "", /Kotlin|Compose/i);

  console.log(`KotlinComposeKit plugin is active; OpenCode discovered ${skillResponse.data.length} skills.`);
  console.log("Git package installation and V2 plugin runtime checks passed.");
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  await fs.rm(workdir, { recursive: true, force: true });
}
