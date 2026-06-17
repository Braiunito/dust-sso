// Setup (SmartEscrow) — deja listos los agentes que usan datos del cliente, sobre
// claude-sonnet-4-6 (tool-calling fiable) y la vista del server remoto (que ahora expone
// project_query + wallet_balance). Idempotente (upsert por nombre).
//
//   se-wallet      = ESPECIALISTA de wallet (usa wallet_balance, saldo EN VIVO de Sefide).
//   se-orquestador = ASISTENTE GENERAL (Plan A) que ADEMÁS resuelve saldo con wallet_balance.
//
// Uso: npx tsx admin/se_setup_orchestration.ts
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";

const WS = "RCZE0JGoXI";
const USER_EMAIL = "se-bot@smartescrow.es";
const SERVER_SID = "rms_M3noyTRbIM";
// Modelo base configurable por ENV (el orquestador/router lo usan). Es la "IA base"
// del generador de agentes: se define en el entorno y este script lo aplica a Dust.
const MODEL = {
  providerId: process.env.DUST_AGENT_PROVIDER || "anthropic",
  modelId: process.env.DUST_AGENT_MODEL || "claude-sonnet-4-6",
  temperature: Number(process.env.DUST_AGENT_TEMPERATURE || "0.7"),
  reasoningEffort: process.env.DUST_AGENT_REASONING || "medium",
};

const ORCHESTRATOR_INSTRUCTIONS =
  "Eres el asistente de SmartEscrow. Respondes con normalidad a cualquier consulta. Cuando el usuario " +
  "pregunte por su SALDO, dinero disponible, balance o estado de su WALLET, invoca la herramienta " +
  "`wallet_balance` SIN argumentos (el servidor resuelve su identidad y consulta Sefide en vivo) y " +
  "responde con el saldo disponible (`balance_available`), la divisa y el estado operativo. Si la respuesta " +
  "trae `shared: true` (eres staff de SmartEscrow), NO hay cuenta personal: informa que son las cuentas " +
  "COMPARTIDAS de la empresa y lista CADA wallet del array `wallets` con su `label` y su `balance`. NO uses " +
  "project_query para el saldo (BD desincronizada). Para otras consultas de datos del cliente (no el " +
  "saldo) puedes usar `project_query` (solo lectura, acotada al usuario). Para todo lo demás, responde " +
  "como un asistente general, sin inventar datos.";

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function upsertAgent(
  auth: any,
  userSid: string,
  authorId: number,
  viewSId: string,
  name: string,
  description: string,
  instructions: string
) {
  const assistant: any = {
    name,
    description,
    instructions,
    instructionsHtml: null,
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: "active",
    scope: "visible",
    model: MODEL,
    actions: [
      {
        type: "mcp_server_configuration",
        name: "smartescrow_datos_cliente",
        description:
          "Datos del cliente (SmartEscrow): wallet_balance (saldo EN VIVO de Sefide) y project_query " +
          "(consulta SOLO LECTURA de BD), ambas acotadas server-side al usuario autenticado.",
        mcpServerViewId: viewSId,
        dataSources: null,
        tables: null,
        childAgentId: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        secretName: null,
        timeFrame: null,
        jsonSchema: null,
        dustProject: null,
      },
    ],
    templateId: null,
    tags: [],
    editors: [{ sId: userSid }],
    skills: [],
    additionalRequestedSpaceIds: [],
    maxStepsPerRun: 8,
    visualizationEnabled: false,
  };

  const existing = await searchAgentConfigurationsByName(auth, name);
  const match = existing.find((a) => a.name === name);
  const res = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    authorId,
    agentConfigurationId: match?.sId,
  });
  if (res.isErr()) {
    throw new Error(`upsert ${name} failed: ${res.error.message}`);
  }
  log(
    `AGENT ${name}: sId=${res.value.sId} v${res.value.version} model=${res.value.model.modelId} ` +
      `actionView=${JSON.stringify(res.value.actions.map((a: any) => a.mcpServerViewId))}`
  );
  return res.value.sId;
}

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const user = await UserResource.fetchByEmail(USER_EMAIL);
  if (!user) {
    throw new Error(`User ${USER_EMAIL} not found — run se_create_workspace_user.ts first`);
  }

  const servers = await listMCPServersWithViews(auth);
  const server = servers.find((s) => s.sId === SERVER_SID);
  if (!server) {
    throw new Error(`Remote MCP server ${SERVER_SID} not found`);
  }
  log("SERVER_TOOLS=" + JSON.stringify(server.tools?.map((t: any) => t.name)));
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const view = server.views.find((v: any) => v.spaceId === globalSpace.sId);
  if (!view) {
    throw new Error("No global-space view found for the server");
  }
  log("VIEW_SID=" + view.sId);

  const orchSid = await upsertAgent(
    auth, user.sId, user.id, view.sId,
    "se-orquestador",
    "Asistente general de SmartEscrow (punto único): resuelve cualquier consulta y, con identidad por " +
      "usuario, datos de proyectos del cliente (saldo en vivo de wallet, etc.) vía las tools del server MCP.",
    ORCHESTRATOR_INSTRUCTIONS
  );

  log("SE_ORQUESTADOR_SID=" + orchSid + " MODEL=" + MODEL.providerId + "/" + MODEL.modelId);
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
