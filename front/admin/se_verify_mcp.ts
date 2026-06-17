// Verifica que Dust ve nuestro Remote MCP Server y su tool project_query.
// Uso: npx tsx admin/se_verify_mcp.ts
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";

const WORKSPACE_ID = "RCZE0JGoXI";
const MCP_URL = "http://agents.lndo.site/mcp";
const SHARED_SECRET = process.env.MCP_SHARED_SECRET ?? "";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  // 1) What Dust has persisted/cached.
  const servers = await listMCPServersWithViews(auth);
  const ours = servers.find((s) => "url" in s && (s as any).url === MCP_URL);
  if (!ours) {
    throw new Error("Server not found in listMCPServersWithViews");
  }
  log("PERSISTED_SERVER_SID=" + ours.sId);
  log("PERSISTED_TOOLS=" + JSON.stringify(ours.tools?.map((t: any) => t.name)));
  log(
    "VIEWS=" +
      JSON.stringify(
        ours.views.map((v: any) => ({
          sId: v.sId,
          spaceId: v.spaceId,
          oAuthUseCase: v.oAuthUseCase,
        }))
      )
  );

  // 2) Live tools/list via Dust's own MCP client transport (same code path
  //    createRemoteMCPServer + sync use). Proves Dust can talk MCP to us now.
  const live = await fetchRemoteServerMetaDataByURL(auth, MCP_URL, {
    Authorization: `Bearer ${SHARED_SECRET}`,
  });
  if (live.isErr()) {
    throw new Error("Live tools/list failed: " + live.error.message);
  }
  log("LIVE_NAME=" + live.value.name);
  log("LIVE_VERSION=" + live.value.version);
  log("LIVE_TOOLS=" + JSON.stringify(live.value.tools.map((t: any) => t.name)));
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
