// Script de bootstrap (SmartEscrow) — crea un AGENTE DE WORKSPACE (scope "visible")
// basado en el modelo del agente global gpt-5-mini (openai), con la action
// mcp_server_configuration apuntando a la vista GLOBAL del server remoto
// rms_M3noyTRbIM (project_query). status="active".
// Uso: npx tsx -r dotenv/config admin/se_create_workspace_agent.ts
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";

const WORKSPACE_ID = "RCZE0JGoXI";
const USER_EMAIL = "se-bot@smartescrow.es";
const SERVER_SID = "rms_M3noyTRbIM";
const EXPECTED_VIEW_SID = "msv_artLNKrM6k";
const NEW_AGENT_NAME = "se-wallet";
const BASE_MODEL_AGENT = "gpt-5-mini";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  // Author/editor: the workspace user created in se_create_workspace_user.ts.
  const user = await UserResource.fetchByEmail(USER_EMAIL);
  if (!user) {
    throw new Error(
      `User ${USER_EMAIL} not found — run se_create_workspace_user.ts first`
    );
  }
  log("AUTHOR_USER_MODEL_ID=" + user.id, "USER_SID=" + user.sId);

  // Locate the remote MCP server and its GLOBAL-space view.
  const servers = await listMCPServersWithViews(auth);
  const server = servers.find((s) => s.sId === SERVER_SID);
  if (!server) {
    throw new Error(`Remote MCP server ${SERVER_SID} not found`);
  }
  log("SERVER_NAME=" + server.name);
  log("SERVER_TOOLS=" + JSON.stringify(server.tools?.map((t: any) => t.name)));

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const chosenView = server.views.find(
    (v: any) => v.spaceId === globalSpace.sId
  );
  if (!chosenView) {
    log("ALL_VIEWS=" + JSON.stringify(server.views, null, 2));
    throw new Error("No global-space view found for the server");
  }
  const viewSId = chosenView.sId;
  log("GLOBAL_VIEW_SID=" + viewSId);
  if (viewSId !== EXPECTED_VIEW_SID) {
    log(
      "WARNING: global view sId " +
        viewSId +
        " != expected " +
        EXPECTED_VIEW_SID +
        " (using the actual one)"
    );
  }

  // Reuse the gpt-5-mini GLOBAL agent's model. gpt-5-mini is a global agent
  // whose sId equals its name → fetch it directly (search does not list globals).
  const base = await getAgentConfiguration(auth, {
    agentId: BASE_MODEL_AGENT,
    variant: "full",
  });

  // Model: reuse the global agent's model if available, else fall back to the
  // canonical GPT-5 Mini (openai) model config.
  // Reusa fielmente el modelo del agente global gpt-5-mini (openai).
  const model = base?.model ?? {
    providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
    temperature: 0.7,
    reasoningEffort: GPT_5_MINI_MODEL_CONFIG.defaultReasoningEffort,
  };
  const pictureUrl =
    base?.pictureUrl ?? "https://dust.tt/static/systemavatar/helper_avatar_full.png";
  const maxStepsPerRun = base?.maxStepsPerRun ?? 8;
  log("BASE_AGENT_FOUND=" + !!base);
  log("BASE_MODEL=" + JSON.stringify(model));

  const newAction: any = {
    type: "mcp_server_configuration",
    name: "smartescrow_project_query",
    description:
      "Consulta SOLO LECTURA contra la BD del proyecto del cliente, acotada server-side al usuario.",
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
  };

  const assistant: any = {
    name: NEW_AGENT_NAME,
    description:
      "Agente de demo que consulta el saldo del usuario via project_query (MCP SmartEscrow).",
    instructions:
      "Eres un agente de SmartEscrow. SIEMPRE que el usuario pregunte por su saldo, dinero, " +
      "balance o estado de su wallet, DEBES invocar OBLIGATORIAMENTE la herramienta " +
      "project_query con estos argumentos EXACTOS:\n" +
      "  project = \"wallet\"\n" +
      "  query = \"SELECT a.email, a.first_name, a.last_name, r.wallet_available_money, " +
      "r.operation_status FROM applicant a LEFT JOIN record r ON r.taxdown_id = a.taxdown_id\"\n" +
      "NO añadas filtros por email ni WHERE: el servidor acota automáticamente al usuario " +
      "autenticado. NUNCA respondas sobre wallets de criptomonedas, exchanges ni des " +
      "instrucciones genéricas: aquí 'wallet' es un proyecto interno del cliente cuyos datos " +
      "SOLO se obtienen llamando a project_query. No pidas la dirección ni más datos al " +
      "usuario; la identidad se resuelve sola en el servidor. Tras recibir el resultado de la " +
      "herramienta, responde en español con el saldo disponible (wallet_available_money) y el " +
      "estado, tal cual, sin inventar nada.",
    instructionsHtml: null,
    pictureUrl,
    status: "active",
    scope: "visible",
    model,
    actions: [newAction],
    templateId: null,
    tags: [],
    editors: [{ sId: user.sId }],
    skills: [],
    additionalRequestedSpaceIds: [],
    maxStepsPerRun,
    visualizationEnabled: false,
  };

  // Reuse existing se-wallet agent if present (create new version), else create.
  const existing = await searchAgentConfigurationsByName(auth, NEW_AGENT_NAME);
  const existingMatch = existing.find((a) => a.name === NEW_AGENT_NAME);

  const res = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    authorId: user.id,
    agentConfigurationId: existingMatch?.sId,
  });
  if (res.isErr()) {
    throw new Error("Create/upgrade failed: " + res.error.message);
  }

  log("AGENT_SID=" + res.value.sId);
  log("AGENT_NAME=" + res.value.name);
  log("AGENT_VERSION=" + res.value.version);
  log("AGENT_STATUS=" + res.value.status);
  log("AGENT_SCOPE=" + res.value.scope);
  log(
    "AGENT_ACTION_VIEWS=" +
      JSON.stringify(
        res.value.actions
          .filter((a: any) => a.type === "mcp_server_configuration")
          .map((a: any) => a.mcpServerViewId)
      )
  );
  log(
    "ATTACHED=" +
      res.value.actions.some((a: any) => a.mcpServerViewId === viewSId)
  );
  log("DONE");
}

main().then(
  () => process.exit(0),
  (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
);
