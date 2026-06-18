// One-off (SmartEscrow) — re-sincroniza los cachedTools del Remote MCP Server SIN pasar por el
// flujo OAuth del SDK de Dust. Desde que el server /mcp anuncia metadata OAuth, el helper
// `fetchRemoteServerMetaDataByURL` (se_sync_mcp_tools.ts) intenta OAuth y falla, aunque nuestro
// transporte se autentica por shared-secret en customHeaders. Aquí hacemos `tools/list` por fetch
// directo con esos headers y escribimos cachedTools. Idempotente.
//   npx tsx admin/se_sync_mcp_tools_direct.ts
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

  // server.customHeaders viene REDACTADO por el resource (seguridad), así que NO sirve para
  // autenticar. Usamos el MCP_SHARED_SECRET real (pasado por env al invocar) como Bearer.
  const sharedSecret = process.env.MCP_SHARED_SECRET ?? "";
  if (sharedSecret === "") {
    throw new Error("MCP_SHARED_SECRET no está en el entorno (pásalo al invocar el script).");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Bearer " + sharedSecret,
  };

  const resp = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  if (!resp.ok) {
    throw new Error("tools/list HTTP " + resp.status + ": " + (await resp.text()));
  }
  const json: any = await resp.json();
  const rawTools: any[] = json?.result?.tools ?? [];
  if (rawTools.length === 0) {
    throw new Error("tools/list devolvió 0 tools (revisa MCP_SHARED_SECRET/MCP_EXPOSED_TOOLS)");
  }

  const tools = rawTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema,
  }));

  const res = await server.updateMetadata(auth, {
    cachedTools: tools,
    lastSyncAt: new Date(),
  });
  if (res.isErr()) {
    throw new Error("updateMetadata falló: " + res.error.message);
  }

  // eslint-disable-next-line no-console
  console.log("SYNCED_TOOLS(" + tools.length + ")=" + JSON.stringify(tools.map((t: any) => t.name)));
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
