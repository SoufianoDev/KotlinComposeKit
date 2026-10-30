import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { load } from "js-yaml";
import { Plugin, Skill } from "@opencode/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, "../../skills");
const guidanceMarker = "KOTLIN_COMPOSE_KIT_OPENCODE_GUIDANCE";
const guidance = `<${guidanceMarker}>
KotlinComposeKit guidance is available in OpenCode. Use OpenCode's native skill tool to load focused modules. For broad Kotlin, Android, JVM, or Jetpack Compose tasks, start by loading the using-kotlin-compose-kit module.
</${guidanceMarker}>`;

const logWarning = async (client, message) => {
  try {
    await client?.app?.log?.({
      body: {
        service: "kotlin-compose-kit",
        level: "warn",
        message,
      },
    });
  } catch {
    // Logging must never prevent OpenCode from starting.
  }
};

const ensureSkillPath = (config) => {
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];

  if (!config.skills.paths.includes(skillsDir)) {
    config.skills.paths.push(skillsDir);
  }
};

const injectGuidance = (messages) => {
  if (!Array.isArray(messages)) return;

  const firstUser = messages.find((message) => message?.info?.role === "user");
  if (!firstUser || !Array.isArray(firstUser.parts) || firstUser.parts.length === 0) return;

  const alreadyInjected = firstUser.parts.some(
    (part) => part?.type === "text" && part.text?.includes(guidanceMarker),
  );
  if (alreadyInjected) return;

  const referencePart = firstUser.parts[0];
  firstUser.parts.unshift({ ...referencePart, type: "text", text: guidance });
};

export const KotlinComposeKitPlugin = async ({ client }) => {
  return {
    config: async (config) => {
      if (!fs.existsSync(skillsDir)) {
        await logWarning(client, `Guidance module directory not found: ${skillsDir}`);
        return;
      }

      ensureSkillPath(config);
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      injectGuidance(output?.messages);
    },
  };
};

const readSkills = () => {
  const skills = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;

    const source = fs.readFileSync(skillPath, "utf8");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    const metadata = match && load(match[1]);
    if (metadata?.name !== entry.name || typeof metadata?.description !== "string" || !metadata.description.trim()) {
      throw new Error(`Invalid skill metadata: ${skillPath}`);
    }

    const autoinvoke = metadata.metadata?.["opencode/autoinvoke"];
    skills.push({
      id: entry.name,
      name: metadata.name,
      description: metadata.description,
      autoinvoke: autoinvoke === undefined
        ? metadata["disable-model-invocation"] !== true
        : autoinvoke !== false && autoinvoke !== "false",
      path: skillPath,
      content: match[2],
    });
  }
  return skills;
};

const setup = async (ctx) => {
  if (!fs.existsSync(skillsDir)) {
    console.warn(`[kotlin-compose-kit] Guidance module directory not found: ${skillsDir}`);
    return;
  }

  const skills = readSkills();
  if (skills.length === 0) return;

  await ctx.skill.transform((editor) => {
    for (const skill of skills) {
      editor.add({
        id: Skill.ID.make(skill.id),
        name: Skill.Name.make(skill.name),
        description: skill.description,
        autoinvoke: skill.autoinvoke,
        path: Skill.Info.fields.path.make(skill.path),
        content: skill.content,
      });
    }
  });

  await ctx.session.hook("context", (event) => {
    if (event.system.some((part) => part?.type === "text" && part.text?.includes(guidanceMarker))) return;
    event.system.push({ type: "text", text: guidance });
  });
};

export default {
  ...Plugin.define({
    id: "kotlin-compose-kit",
    setup,
  }),
  server: KotlinComposeKitPlugin,
};
