import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { load } from "js-yaml";
import definition, { KotlinComposeKitPlugin } from "../plugins/kotlin-compose-kit.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const marker = "KOTLIN_COMPOSE_KIT_OPENCODE_GUIDANCE";

test("the package manifest exposes the V2 entrypoint and avoids Git-install lifecycle scripts", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

  assert.equal(manifest.exports["."], "./.opencode/plugins/kotlin-compose-kit.js");
  assert.equal(manifest.dependencies["@opencode/plugin"], "2.1.2");

  for (const key of ["build", "prepare", "preinstall", "install", "postinstall", "prepack", "workspaces"]) {
    assert.equal(Object.hasOwn(manifest, key), false, `package.json must not define reserved Git-install key: ${key}`);
    assert.equal(Object.hasOwn(manifest.scripts, key), false, `package.json scripts must not define reserved Git-install key: ${key}`);
  }
});


async function register(plugin = definition) {
  let transform;
  let hook;
  await plugin.setup({
    skill: {
      transform: async (callback) => {
        assert.equal(transform, undefined, "register one catalog transform");
        transform = callback;
        return { dispose() {} };
      },
    },
    session: {
      hook: async (name, callback) => {
        assert.equal(name, "context");
        assert.equal(hook, undefined, "register one context hook");
        hook = callback;
        return { dispose() {} };
      },
    },
  });
  return { transform, hook };
}

function replay(transform) {
  const skills = new Map();
  const result = transform({ add: (skill) => skills.set(skill.id, skill) });
  assert.equal(result, undefined, "catalog edits are synchronous");
  return skills;
}

async function fixture(t, files = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-plugin-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const entry = path.join(directory, ".opencode/plugins/kotlin-compose-kit.js");
  await fs.mkdir(path.dirname(entry), { recursive: true });
  await fs.copyFile(path.join(root, ".opencode/plugins/kotlin-compose-kit.js"), entry);
  await fs.writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await fs.symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, "skills", name, "SKILL.md");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return { directory, plugin: (await import(pathToFileURL(entry).href)).default };
}

test("the package exposes separate V1 and V2 entrypoints", () => {
  assert.equal(definition.id, "kotlin-compose-kit");
  assert.equal(definition.server, KotlinComposeKitPlugin);
  assert.equal(typeof definition.setup, "function");
});

test("V1 registers the skills directory once and retains user guidance", async () => {
  const hooks = await definition.server({});
  const config = { skills: { paths: ["/existing"] } };
  await hooks.config(config);
  await hooks.config(config);
  assert.deepEqual(config.skills.paths, ["/existing", path.join(root, "skills")]);

  const messages = [
    { info: { role: "assistant" }, parts: [{ type: "text", text: "Earlier" }] },
    { info: { role: "user" }, parts: [{ id: "part-1", type: "text", text: "Review Compose" }] },
  ];
  const original = structuredClone(messages);
  await hooks["experimental.chat.messages.transform"]({}, { messages });
  await hooks["experimental.chat.messages.transform"]({}, { messages });
  assert.deepEqual(messages[0], original[0]);
  assert.equal(messages[1].parts.length, 2);
  assert.ok(messages[1].parts[0].text.includes(marker));
  assert.deepEqual(messages[1].parts[1], original[1].parts[0]);
});

test("V2 registers every repository skill with decoded metadata and exact source paths", async () => {
  const { transform } = await register();
  const skills = replay(transform);
  const entries = (await fs.readdir(path.join(root, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const expected = [];
  for (const entry of entries) {
    const file = path.join(root, "skills", entry.name, "SKILL.md");
    const source = await fs.readFile(file, "utf8");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    const metadata = load(match[1]);
    expected.push(entry.name);
    const skill = skills.get(entry.name);
    assert.equal(skill.name, metadata.name);
    assert.equal(skill.description, metadata.description);
    assert.equal(skill.path, file);
    assert.equal(skill.content, match[2]);
    assert.equal(skill.autoinvoke, metadata["disable-model-invocation"] !== true);
  }
  assert.deepEqual([...skills.keys()].sort(), expected.sort());
  assert.deepEqual(replay(transform), skills);
});

test("V2 adds guidance once per request without changing conversation messages", async () => {
  const { hook } = await register();
  const event = {
    system: [{ type: "text", text: "Existing instructions" }],
    messages: [{ role: "user", content: [{ type: "text", text: "Review Compose" }] }],
  };
  const original = structuredClone(event);
  await hook(event);
  await hook(event);
  assert.deepEqual(event.messages, original.messages);
  assert.deepEqual(event.system[0], original.system[0]);
  assert.equal(event.system.length, 2);
  assert.ok(event.system[1].text.includes(marker));
  const nextRequest = { system: [], messages: [] };
  await hook(nextRequest);
  assert.equal(nextRequest.system.length, 1);
});

test("V2 handles quoted and multiline YAML and captures files before transform replay", async (t) => {
  const { directory, plugin } = await fixture(t, {
    example: '---\nname: example\ndescription: >-\n  Use when a task has\n  multiple lines: preserve them.\ndisable-model-invocation: true\n---\n# Example\n\nRead `references/details.md`.\n',
    quoted: '---\nname: quoted\ndescription: "Use when quoting: \\"hello\\"."\n---\nQuoted body\n',
    override: '---\nname: override\ndescription: Use when checking metadata priority.\ndisable-model-invocation: true\nmetadata:\n  opencode/autoinvoke: "true"\n---\nOverride body\n',
  });
  await fs.writeFile(path.join(directory, "skills", "README.md"), "Not a skill");
  await fs.mkdir(path.join(directory, "skills", "supporting-directory"));
  const { transform } = await register(plugin);
  await fs.rm(path.join(directory, "skills"), { recursive: true });
  const skills = replay(transform);
  assert.equal(skills.size, 3);
  assert.equal(skills.get("example").description, "Use when a task has multiple lines: preserve them.");
  assert.equal(skills.get("example").autoinvoke, false);
  assert.equal(skills.get("quoted").description, 'Use when quoting: "hello".');
  assert.equal(skills.get("override").autoinvoke, true);
  assert.deepEqual(replay(transform), skills);
});

test("a missing skills directory warns without advertising unavailable skills", async (t) => {
  const { plugin } = await fixture(t);
  const warnings = t.mock.method(console, "warn", () => {});
  const registration = await register(plugin);
  assert.equal(registration.transform, undefined);
  assert.equal(registration.hook, undefined);
  assert.equal(warnings.mock.callCount(), 1);
  assert.match(warnings.mock.calls[0].arguments[0], /Guidance module directory not found/);
  const logged = [];
  const hooks = await plugin.server({ client: { app: { log: async (entry) => logged.push(entry) } } });
  const config = {};
  await hooks.config(config);
  assert.deepEqual(config, {});
  assert.match(logged[0].body.message, /Guidance module directory not found/);
});

test("malformed metadata fails setup before any partial registration", async (t) => {
  const { plugin } = await fixture(t, {
    example: '---\nname: example\ndescription: [not a string]\n---\nBody\n',
  });
  await assert.rejects(register(plugin), /Invalid skill metadata.*example/);
});


test("OpenCode installation guide preserves V1 compatibility alongside native V2 installation", async () => {
  const guide = await fs.readFile(path.join(root, ".opencode/INSTALL.md"), "utf8");

  assert.ok(guide.includes("OpenCode V2 2.1.2 or newer"));
  assert.ok(guide.includes("OpenCode V1 1.18.29 or newer"));
  assert.ok(guide.includes("opencode plugin add github:SoufianoDev/KotlinComposeKit"));
  assert.ok(
    guide.includes(
      "opencode plugin 'git+https://github.com/SoufianoDev/KotlinComposeKit.git' --global",
    ),
  );
  assert.ok(guide.includes("opencode debug skill"));
});

test("OpenCode install workflow targets the PR head repository and commit", async () => {
  const workflow = load(await fs.readFile(path.join(root, ".github/workflows/lint.yml"), "utf8"));
  const checkoutStep = workflow.jobs["opencode-v2-plugin-install"].steps.find(
    (step) => step.uses === "actions/checkout@v4",
  );
  assert.ok(checkoutStep, "The OpenCode integration job must check out its tested source.");
  assert.equal(
    checkoutStep.with.repository,
    "${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  );
  assert.equal(
    checkoutStep.with.ref,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );

  const installStep = workflow.jobs["opencode-v2-plugin-install"].steps.find(
    (step) => step.name === "Install KotlinComposeKit from the tested branch",
  );

  assert.ok(installStep, "The OpenCode integration job must install the package explicitly.");
  assert.equal(
    installStep.env.KOTLIN_COMPOSE_KIT_REPOSITORY,
    "${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  );
  assert.equal(
    installStep.env.KOTLIN_COMPOSE_KIT_REF,
    "${{ github.event.pull_request.head.ref || github.ref_name }}",
  );
  assert.equal(
    installStep.env.KOTLIN_COMPOSE_KIT_SHA,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );
  assert.ok(
    installStep.run.includes(
      'repository_url="https://github.com/${KOTLIN_COMPOSE_KIT_REPOSITORY}.git"',
    ),
    "The package URL must include github.com and use the resolved head repository.",
  );
  assert.ok(
    installStep.run.includes(
      'git ls-remote "$repository_url" "refs/heads/${KOTLIN_COMPOSE_KIT_REF}"',
    ),
    "The workflow must verify that the remote PR branch still points to the expected head commit.",
  );
  assert.ok(
    installStep.run.includes(
      'opencode plugin add "git+${repository_url}#${KOTLIN_COMPOSE_KIT_SHA}"',
    ),
    "The install command must use the immutable, verified PR head commit.",
  );

  const verifyStep = workflow.jobs["opencode-v2-plugin-install"].steps.find(
    (step) => step.name === "Verify installed package and discovered skills",
  );
  assert.ok(verifyStep, "The OpenCode integration job must verify its installed package.");
  assert.equal(
    verifyStep.env.KOTLIN_COMPOSE_KIT_REPOSITORY,
    "${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  );
  assert.equal(
    verifyStep.env.KOTLIN_COMPOSE_KIT_SHA,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );

  const verifierSource = await fs.readFile(path.join(root, "scripts/assert_opencode_install.mjs"), "utf8");
  assert.ok(verifierSource.includes("process.env.KOTLIN_COMPOSE_KIT_REPOSITORY"));
  assert.ok(verifierSource.includes("process.env.KOTLIN_COMPOSE_KIT_SHA"));
  assert.ok(!verifierSource.includes("/SoufianoDev\\/KotlinComposeKit/i"));
});

test("OpenCode V1 CI installs the tested commit and verifies server-plugin skill discovery", async () => {
  const workflow = load(await fs.readFile(path.join(root, ".github/workflows/lint.yml"), "utf8"));
  const job = workflow.jobs["opencode-v1-plugin-install"];
  assert.ok(job, "The OpenCode V1 integration job must exist.");
  assert.deepEqual(job.strategy.matrix["opencode-version"], ["1.18.29", "1.19.5"]);

  const checkoutStep = job.steps.find((step) => step.uses === "actions/checkout@v4");
  assert.ok(checkoutStep, "The V1 job must check out the tested source.");
  assert.equal(
    checkoutStep.with.repository,
    "${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  );
  assert.equal(
    checkoutStep.with.ref,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );

  const cliInstall = job.steps.find((step) => step.name === "Install OpenCode V1 CLI");
  assert.ok(cliInstall.run.includes('opencode-ai@${{ matrix.opencode-version }}'));

  const installStep = job.steps.find((step) => step.name === "Install KotlinComposeKit from the tested commit");
  assert.ok(installStep, "The V1 job must install the tested package.");
  assert.equal(
    installStep.env.KOTLIN_COMPOSE_KIT_SHA,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );
  assert.ok(
    installStep.run.includes('opencode plugin "git+${repository_url}#${KOTLIN_COMPOSE_KIT_SHA}" --global'),
    "The V1 test must use OpenCode's legacy global plugin installer with an immutable Git commit.",
  );

  const verifyStep = job.steps.find((step) => step.name === "Verify V1 plugin loading and skill discovery");
  assert.ok(verifyStep, "The V1 job must verify the actual loaded plugin.");
  assert.equal(verifyStep.run, "node scripts/assert_opencode_v1_install.mjs");
  assert.equal(
    verifyStep.env.OPENCODE_EXPECTED_VERSION,
    "${{ matrix.opencode-version }}",
  );
});
