// Setup (SmartEscrow) — Plan B: agente ROUTER (claude-sonnet-4-6) que DELEGA en
// sub-agentes vía el internal server `run_agent`. Hoy enruta a `se-wallet` (saldo en
// vivo); deja patrón para añadir más especialistas (factoring, etc.). Idempotente.
//   npx tsx admin/se_setup_router.ts
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { UserResource } from "@app/lib/resources/user_resource";

const WS = "RCZE0JGoXI";
const USER_EMAIL = "se-bot@smartescrow.es";
const ROUTER_NAME = "se-router";
// Especialista al que delega. se-wallet (demo) fue retirado; hoy el "trabajador" con todas
// las tools es el orquestador. Cuando haya especialistas reales por dominio, se añaden aquí.
const CHILD_NAME = process.env.SE_ROUTER_CHILD || "se-orquestador";

const ROUTER_INSTRUCTIONS =
  "Eres el ENRUTADOR de SmartEscrow. Tu trabajo es decidir qué especialista atiende cada consulta y " +
  "delegar en él. Cuando el usuario pregunte por su SALDO, dinero disponible, balance o estado de su " +
  "WALLET, DELEGA en el sub-agente especialista de wallet usando la herramienta de delegación " +
  "disponible (run_…): pásale la pregunta del usuario tal cual. Cuando recibas su respuesta, " +
  "transmítela al usuario de forma clara y en español, sin inventar datos. Para consultas que no " +
  "encajen con ningún especialista, responde tú mismo como asistente general.";

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const user = await UserResource.fetchByEmail(USER_EMAIL);
  if (!user) {
    throw new Error(`User ${USER_EMAIL} not found`);
  }

  // sId del sub-agente (se-wallet).
  const found = await searchAgentConfigurationsByName(auth, CHILD_NAME);
  const child = found.find((a) => a.name === CHILD_NAME);
  if (!child) {
    throw new Error(`Child agent ${CHILD_NAME} not found — run se_setup_orchestration.ts first`);
  }

  // Vista (global) del internal server run_agent (auto-provisionado por se_provision_auto_tools.ts).
  const runAgentView = await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
    auth,
    "run_agent"
  );
  if (!runAgentView) {
    throw new Error("Vista de run_agent no encontrada — corre se_provision_auto_tools.ts");
  }
  // eslint-disable-next-line no-console
  console.log("RUN_AGENT_VIEW_SID=" + runAgentView.sId + " CHILD_SID=" + child.sId);

  const action: any = {
    type: "mcp_server_configuration",
    name: "delegar_a_se_wallet",
    description:
      "Delega la consulta en el agente especialista de wallet (saldo en vivo de Sefide).",
    mcpServerViewId: runAgentView.sId,
    dataSources: null,
    tables: null,
    childAgentId: child.sId,
    additionalConfiguration: { executionMode: "run-agent" },
    dustAppConfiguration: null,
    secretName: null,
    timeFrame: null,
    jsonSchema: null,
    dustProject: null,
  };

  const assistant: any = {
    name: ROUTER_NAME,
    description:
      "Enrutador de SmartEscrow: delega en sub-agentes especialistas (hoy se-wallet) según la consulta.",
    instructions: ROUTER_INSTRUCTIONS,
    instructionsHtml: null,
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: "active",
    scope: "visible",
    model: {
      providerId: process.env.DUST_AGENT_PROVIDER || "anthropic",
      modelId: process.env.DUST_AGENT_MODEL || "claude-sonnet-4-6",
      temperature: Number(process.env.DUST_AGENT_TEMPERATURE || "0.7"),
      reasoningEffort: process.env.DUST_AGENT_REASONING || "medium",
    },
    actions: [action],
    templateId: null,
    tags: [],
    editors: [{ sId: user.sId }],
    skills: [],
    additionalRequestedSpaceIds: [],
    maxStepsPerRun: 8,
    visualizationEnabled: false,
  };

  const existing = await searchAgentConfigurationsByName(auth, ROUTER_NAME);
  const match = existing.find((a) => a.name === ROUTER_NAME);
  const res = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    authorId: user.id,
    agentConfigurationId: match?.sId,
  });
  if (res.isErr()) {
    throw new Error("upsert se-router failed: " + res.error.message);
  }
  // eslint-disable-next-line no-console
  console.log(
    "SE_ROUTER_SID=" + res.value.sId + " v" + res.value.version +
    " childAgentId=" + JSON.stringify(res.value.actions.map((a: any) => a.childAgentId))
  );
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
