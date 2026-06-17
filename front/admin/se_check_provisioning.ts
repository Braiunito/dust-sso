// Checker de provisioning (SmartEscrow) — read-only. Lo usa scripts/smoke.sh para
// validar que el self-host de Dust está provisionado para el round-trip por el chat:
//   - INTERNAL_MCP_VIEWS: nº de vistas de tools internas/auto (common_utilities, files…).
//     Si es 0, el agent loop falla con "MCP server view not found ... Ensure auto tools
//     are created" → correr admin/se_provision_auto_tools.ts.
//   - REMOTE_MCP_VIEWS: nº de servers remotos (el nuestro, project_query).
//   - SE_WALLET_MODEL / SE_WALLET_ACTIONS: modelo y nº de actions del agente se-wallet.
// Uso: npx tsx admin/se_check_provisioning.ts   (con el env de front cargado)
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";

const WS = "RCZE0JGoXI";

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const views = await MCPServerViewResource.listByWorkspace(auth);
  const internal = views.filter((v: any) => v.serverType === "internal").length;
  const remote = views.filter((v: any) => v.serverType === "remote").length;
  log("INTERNAL_MCP_VIEWS=" + internal);
  log("REMOTE_MCP_VIEWS=" + remote);

  const found = await searchAgentConfigurationsByName(auth, "se-orquestador");
  const match = found.find((a) => a.name === "se-orquestador");
  if (match) {
    const cur = await getAgentConfiguration(auth, {
      agentId: match.sId,
      variant: "full",
    });
    log(
      "SE_ORCH_MODEL=" +
        (cur?.model
          ? `${cur.model.providerId}/${cur.model.modelId}`
          : "none")
    );
    log("SE_ORCH_ACTIONS=" + (cur?.actions?.length ?? 0));
  } else {
    log("SE_ORCH_MODEL=absent");
    log("SE_ORCH_ACTIONS=0");
  }
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
