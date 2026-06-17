// Inspecciona los cachedTools del remote MCP server (nombre, descripción, inputSchema).
import { listMCPServersWithViews } from "@app/lib/api/mcp/servers";
import { Authenticator } from "@app/lib/auth";

const WORKSPACE_ID = "RCZE0JGoXI";
const SERVER_SID = "rms_M3noyTRbIM";

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);
  const servers = await listMCPServersWithViews(auth);
  const server = servers.find((s) => s.sId === SERVER_SID);
  if (!server) {
    throw new Error("server not found");
  }
  log("NAME=" + server.name);
  log("DESCRIPTION=" + server.description);
  log("TOOLS=" + JSON.stringify(server.tools, null, 2));
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
