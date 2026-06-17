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
const MODEL = {
  providerId: "anthropic",
  modelId: "claude-sonnet-4-6",
  temperature: 0.7,
  reasoningEffort: "medium",
};

const WALLET_INSTRUCTIONS =
  "Eres el especialista de WALLET de SmartEscrow. Cuando el usuario pregunte por su saldo, dinero " +
  "disponible, balance o estado de su wallet, invoca SIEMPRE la herramienta `wallet_balance` SIN " +
  "argumentos: el servidor resuelve al usuario autenticado y consulta el saldo EN VIVO de Sefide " +
  "(fuente de verdad). NO uses project_query para el saldo: la columna de BD está DESINCRONIZADA. " +
  "Tras recibir el resultado, responde en español con el saldo disponible (`balance_available`), la " +
  "divisa y el estado operativo (`operation_status`), tal cual, sin inventar. Si `balance_available` " +
  "es null, di que la cuenta no está operativa en Sefide. No pidas datos al usuario: la identidad se " +
  "resuelve sola en el servidor.";

const ORCHESTRATOR_INSTRUCTIONS =
  "Eres el asistente de SmartEscrow. Respondes con normalidad a cualquier consulta. Cuando el usuario " +
  "pregunte por su SALDO, dinero disponible, balance o estado de su WALLET, invoca la herramienta " +
  "`wallet_balance` SIN argumentos (el servidor resuelve su identidad y consulta Sefide en vivo) y " +
  "responde con el saldo disponible (`balance_available`), la divisa y el estado operativo. NO uses " +
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

  const walletSid = await upsertAgent(
    auth, user.sId, user.id, view.sId,
    "se-wallet",
    "Especialista de wallet de SmartEscrow: consulta el saldo EN VIVO (Sefide) del usuario.",
    WALLET_INSTRUCTIONS
  );
  const orchSid = await upsertAgent(
    auth, user.sId, user.id, view.sId,
    "se-orquestador",
    "Asistente general de SmartEscrow; resuelve también el saldo de wallet (en vivo) del usuario.",
    ORCHESTRATOR_INSTRUCTIONS
  );

  log("SE_WALLET_SID=" + walletSid);
  log("SE_ORQUESTADOR_SID=" + orchSid);
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
