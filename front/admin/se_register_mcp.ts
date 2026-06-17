// Script de bootstrap (SmartEscrow) — registra NUESTRO Remote MCP Server en Dust
// y lo habilita en el agente gpt-5-mini.
// Uso: npx tsx admin/se_register_mcp.ts
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import {
  createRemoteMCPServer,
  listMCPServersWithViews,
} from "@app/lib/api/mcp/servers";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { searchAgentConfigurationsByName } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

const WORKSPACE_ID = "RCZE0JGoXI";
const MCP_URL = "http://agents.lndo.site/mcp";
const SHARED_SECRET = process.env.MCP_SHARED_SECRET ?? "";
const AGENT_NAME = "gpt-5-mini";
const TARGET_TOOL = "project_query";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  // --- Step 1: register (or reuse) the remote MCP server -------------------
  const existing = await listMCPServersWithViews(auth);
  let server = existing.find((s) => "url" in s && (s as any).url === MCP_URL);

  if (server) {
    log("EXISTING_SERVER_SID=" + server.sId);
  } else {
    const res = await createRemoteMCPServer(auth, {
      url: MCP_URL,
      sharedSecret: SHARED_SECRET,
      includeGlobal: true,
      useCase: "platform_actions",
    });
    if (res.isErr()) {
      throw new Error("createRemoteMCPServer failed: " + res.error.message);
    }
    server = (await listMCPServersWithViews(auth)).find(
      (s) => s.sId === res.value.sId
    );
    if (!server) {
      throw new Error("Server not found after creation");
    }
    log("CREATED_SERVER_SID=" + server.sId);
  }

  log("SERVER_NAME=" + server.name);
  log("SERVER_TOOLS=" + JSON.stringify(server.tools?.map((t: any) => t.name)));

  // Identify the GLOBAL-space view sId (the one usable by agents).
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  log("GLOBAL_SPACE_SID=" + globalSpace.sId);
  log(
    "ALL_VIEW_SPACES=" +
      JSON.stringify(server.views.map((v: any) => ({ sId: v.sId, spaceId: v.spaceId })))
  );
  const chosenView = server.views.find(
    (v: any) => v.spaceId === globalSpace.sId
  );

  if (!chosenView) {
    log("ALL_VIEWS=" + JSON.stringify(server.views, null, 2));
    throw new Error("No global-space view found for the server");
  }
  const viewSId = chosenView.sId;
  log("GLOBAL_VIEW_SID=" + viewSId);
  log("CHOSEN_VIEW=" + JSON.stringify(chosenView));

  // --- Step 2: locate the gpt-5-mini agent --------------------------------
  const candidates = await searchAgentConfigurationsByName(auth, AGENT_NAME);
  const match =
    candidates.find((a) => a.name === AGENT_NAME) ?? candidates[0];
  if (!match) {
    throw new Error(`Agent ${AGENT_NAME} not found`);
  }
  log("AGENT_SID=" + match.sId);

  const agent = await getAgentConfiguration(auth, {
    agentId: match.sId,
    variant: "full",
  });
  if (!agent) {
    throw new Error("Could not fetch full agent configuration");
  }
  log("AGENT_VERSION_BEFORE=" + agent.version);

  const currentActions = agent.actions.filter(
    isServerSideMCPServerConfiguration
  );
  log(
    "CURRENT_ACTION_VIEWS=" +
      JSON.stringify(currentActions.map((a: any) => a.mcpServerViewId))
  );

  // Already attached?
  if (currentActions.some((a: any) => a.mcpServerViewId === viewSId)) {
    log("ALREADY_ATTACHED=true");
    log("DONE");
    return;
  }

  // --- Step 3: upgrade the agent adding the new mcp_server_configuration ----
  const newAction: any = {
    type: "mcp_server_configuration",
    name: "smartescrow_project_query",
    description:
      "Consulta SOLO LECTURA contra la base de datos de un proyecto del cliente (wallet/factoring), acotada server-side al usuario autenticado.",
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
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    instructionsHtml: agent.instructionsHtml ?? null,
    pictureUrl: agent.pictureUrl,
    status: agent.status,
    scope: agent.scope,
    model: agent.model,
    actions: [...currentActions, newAction],
    templateId: agent.templateId ?? null,
    tags: agent.tags ?? [],
    editors: (agent.editors ?? []).map((e: any) => ({ sId: e.sId })),
    skills: (agent.skills ?? []).map((s: any) => ({ sId: s.sId })),
    additionalRequestedSpaceIds: agent.requestedSpaceIds ?? [],
    maxStepsPerRun: agent.maxStepsPerRun,
    visualizationEnabled: agent.visualizationEnabled,
  };

  const upgradeRes = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    agentConfigurationId: agent.sId,
  });
  if (upgradeRes.isErr()) {
    throw new Error("Upgrade failed: " + upgradeRes.error.message);
  }
  log("AGENT_VERSION_AFTER=" + upgradeRes.value.version);
  log(
    "AGENT_ACTION_VIEWS_AFTER=" +
      JSON.stringify(
        upgradeRes.value.actions
          .filter(isServerSideMCPServerConfiguration)
          .map((a: any) => a.mcpServerViewId)
      )
  );
  log("ATTACHED=" + upgradeRes.value.actions.some(
    (a: any) => a.mcpServerViewId === viewSId
  ));
  log("DONE");
}

main().then(
  () => process.exit(0),
  (e) => {
    logger.error({ err: e }, "se_register_mcp failed");
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
);
