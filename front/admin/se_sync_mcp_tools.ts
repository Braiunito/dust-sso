// One-off (SmartEscrow) — re-sincroniza los cachedTools del Remote MCP Server en Dust.
// Necesario tras AÑADIR una tool a nuestro server (p.ej. wallet_balance): vuelve a hacer
// tools/list contra el transporte y actualiza la metadata cacheada en Dust, de modo que el
// agente (que usa la vista del server) vea la tool nueva. Idempotente.
//   npx tsx admin/se_sync_mcp_tools.ts
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

const WS = "RCZE0JGoXI";
const SERVER_SID = "rms_M3noyTRbIM";

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const server = await RemoteMCPServerResource.fetchById(auth, SERVER_SID);
  if (!server) {
    throw new Error("Remote MCP server no encontrado: " + SERVER_SID);
  }

  const meta = await fetchRemoteServerMetaDataByURL(
    auth,
    server.url,
    server.customHeaders ?? undefined
  );
  if (meta.isErr()) {
    throw new Error("fetchRemoteServerMetaDataByURL falló: " + meta.error.message);
  }
  const tools = meta.value.tools ?? [];

  const res = await server.updateMetadata(auth, {
    cachedTools: tools,
    lastSyncAt: new Date(),
  });
  if (res.isErr()) {
    throw new Error("updateMetadata falló: " + res.error.message);
  }

  // eslint-disable-next-line no-console
  console.log("SYNCED_TOOLS=" + JSON.stringify(tools.map((t: any) => t.name)));
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
