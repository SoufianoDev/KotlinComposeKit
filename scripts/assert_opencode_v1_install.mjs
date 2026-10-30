import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.HOME;
const expectedRepository = process.env.KOTLIN_COMPOSE_KIT_REPOSITORY;
const expectedCommit = process.env.KOTLIN_COMPOSE_KIT_SHA;
const expectedVersion = process.env.OPENCODE_EXPECTED_VERSION;

assert.ok(home, "The V1 integration job must provide an isolated HOME directory.");
assert.ok(expectedRepository, "The V1 integration job must provide the tested repository.");
assert.ok(expectedCommit, "The V1 integration job must provide the tested commit SHA.");
assert.ok(expectedVersion, "The V1 integration job must provide the expected CLI version.");

for (const directory of [
  home,
  process.env.XDG_CONFIG_HOME,
  process.env.XDG_DATA_HOME,
  process.env.XDG_CACHE_HOME,
].filter(Boolean)) {
  await fs.mkdir(directory, { recursive: true });
}

const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "kotlin-compose-kit-opencode-v1-"));
const env = { ...process.env, CI: "true" };

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: workdir,
    env,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} failed (status=${result.status}):\n` +
      `${result.error?.message || ""}\n` +
      `${result.stdout || ""}\n` +
      `${result.stderr || ""}`,
    );
  }

  return result.stdout.trim();
}

function isWithin(directory, target) {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

try {
  const cliVersion = run("opencode", ["--version"], "OpenCode V1 version");
  assert.ok(
    cliVersion.includes(expectedVersion),
    `Expected OpenCode V1 ${expectedVersion}; received: ${cliVersion}`,
  );

  const expectedPluginSpec =
    `git+https://github.com/${expectedRepository}.git#${expectedCommit}`;
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const globalConfigDirectory = path.join(configRoot, "opencode");
  const configCandidates = ["opencode.json", "opencode.jsonc"];
  let config;
  let configFile;
  for (const name of configCandidates) {
    const file = path.join(globalConfigDirectory, name);
    try {
      config = JSON.parse(await fs.readFile(file, "utf8"));
      configFile = file;
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  assert.ok(config, "OpenCode V1 must create its isolated global plugin configuration.");
  assert.ok(
    Array.isArray(config.plugin),
    `Expected a V1 plugin array in ${configFile}; received: ${JSON.stringify(config)}`,
  );
  assert.ok(
    config.plugin.includes(expectedPluginSpec),
    `The global V1 config must contain the exact tested Git commit: ${expectedPluginSpec}`,
  );

  // debug skill calls OpenCode V1's real Skill.Service. The only way the
  // repository skills appear here is if the installed V1 server plugin loads
  // and contributes its skills.paths configuration.
  const rawSkills = run("opencode", ["debug", "skill"], "OpenCode V1 skill discovery");
  let skills;
  try {
    skills = JSON.parse(rawSkills);
  } catch (error) {
    throw new Error(
      `OpenCode V1 debug skill did not return JSON: ${error.message}\n${rawSkills.slice(0, 5000)}`,
    );
  }

  assert.ok(Array.isArray(skills), "OpenCode V1 debug skill must return an array.");
  const discovered = new Map(skills.map((skill) => [skill.name, skill]));
  const expectedNames = [];
  for (const entry of await fs.readdir(path.join(root, "skills"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(root, "skills", entry.name, "SKILL.md"));
      expectedNames.push(entry.name);
    } catch {
      // Supporting directories without SKILL.md are not discoverable skills.
    }
  }

  const missing = expectedNames.filter((name) => !discovered.has(name));
  assert.deepEqual(missing, [], "Every repository SKILL.md must be discovered by OpenCode V1.");

  for (const name of expectedNames) {
    const skill = discovered.get(name);
    assert.equal(skill.name, name);
    assert.match(skill.location || "", /SKILL\.md$/);
    assert.equal(
      isWithin(root, skill.location),
      false,
      `V1 loaded ${name} from the repository checkout instead of the installed package: ${skill.location}`,
    );
  }

  const router = discovered.get("using-kotlin-compose-kit");
  assert.ok(router, "The V1 runtime must discover using-kotlin-compose-kit.");
  assert.match(router.content || "", /KotlinComposeKit|Kotlin|Compose/i);

  console.log(`OpenCode CLI: ${cliVersion}`);
  console.log(`OpenCode V1 loaded the tested plugin commit: ${expectedCommit}`);
  console.log(`OpenCode V1 discovered all ${expectedNames.length} installed repository skills.`);
} finally {
  await fs.rm(workdir, { recursive: true, force: true });
}
