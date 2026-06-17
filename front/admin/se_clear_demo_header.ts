// Limpia el "demo-header" (customHeaders Authorization) del Remote MCP Server en Dust.
// Tras esto, el Bearer hacia /mcp pasa a ser el MCP_SHARED_SECRET (máquina de confianza)
// y la identidad del usuario final la pone NUESTRO fork de Dust por el header
// `X-Dust-End-User-Email` (identidad real por usuario, automática, sin atajo de 1 usuario).
//   npx tsx admin/se_clear_demo_header.ts
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
  const res = await server.updateMetadata(auth, {
    customHeaders: {},
    lastSyncAt: new Date(),
  });
  if (res.isErr()) {
    throw new Error("updateMetadata falló: " + res.error.message);
  }
  const reloaded = await RemoteMCPServerResource.fetchById(auth, SERVER_SID);
  // eslint-disable-next-line no-console
  console.log(
    "CUSTOM_HEADERS=" + JSON.stringify(Object.keys(reloaded?.customHeaders ?? {}))
  );
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
