import fs from "node:fs";
import { migrateLegacyRunningHubWorkflows } from "../apps/desktop/src/runninghub-workflow";

const configPath = process.env.COWORKANY_DESKTOP_CONFIG_PATH ?? "C:/Users/liula/AppData/Local/CoworkAny/config.json";
const envPath = process.env.COWORKANY_LEGACY_ENV_PATH ?? ".env";

function envValue(raw: string, name: string) {
  return raw.split(/\r?\n/u).find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim();
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
const legacyEnv = fs.readFileSync(envPath, "utf8");
const digitalHumanWorkflowId = envValue(legacyEnv, "RUNNINGHUB_DIGITAL_HUMAN_WORKFLOW_ID");
const videoEnhanceWorkflowId = envValue(legacyEnv, "RUNNINGHUB_VIDEO_ENHANCE_WORKFLOW_ID");
if (!digitalHumanWorkflowId || !videoEnhanceWorkflowId) throw new Error("legacy_runninghub_workflow_ids_missing");
const importLegacyCredential = process.env.COWORKANY_IMPORT_LEGACY_RUNNINGHUB_CREDENTIALS === "1";
const legacyApiKey = envValue(legacyEnv, "RUNNINGHUB_API_KEY");

const providerId = config.defaults?.video ?? "video-minimax-h3";
const profile = config.providers?.[providerId] ?? { id: providerId, source: "runninghub", model: "MiniMax-Hailuo-H3" };
const workflows = migrateLegacyRunningHubWorkflows(profile.workflows, { digitalHumanWorkflowId, videoEnhanceWorkflowId });
if (!workflows?.length) throw new Error("legacy_runninghub_workflow_migration_empty");

config.providers ??= {};
config.providers[providerId] = {
  ...profile,
  id: providerId,
  source: "runninghub",
  baseUrl: profile.baseUrl ?? envValue(legacyEnv, "RUNNINGHUB_BASE_URL") ?? "https://www.runninghub.cn",
  ...(importLegacyCredential && legacyApiKey ? { apiKey: legacyApiKey } : {}),
  queryEndpoint: profile.queryEndpoint ?? envValue(legacyEnv, "RUNNINGHUB_QUERY_PATH") ?? "/openapi/v2/query",
  workflows,
};
config.defaults ??= {};
config.defaults.video = providerId;

const backupPath = configPath.replace(/\.json$/u, ".backup.json");
fs.copyFileSync(configPath, backupPath);
const tempPath = `${configPath}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
fs.renameSync(tempPath, configPath);

console.log(JSON.stringify({
  configPath,
  backupPath,
  providerId,
  workflows: workflows.map((workflow) => ({ id: workflow.id, capability: workflow.capability, remoteWorkflowId: workflow.remoteWorkflowId, bindingCount: workflow.nodeBindings.length })),
}, null, 2));
