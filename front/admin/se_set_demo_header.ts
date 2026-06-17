// Script de bootstrap (SmartEscrow) — ATAJO DE DEMO (1 usuario fijo).
// Cablea un Authorization: Bearer <seid_…> personal fijo en el remote MCP server
// rms_M3noyTRbIM via customHeaders, de modo que TODAS las llamadas del agente al
// /mcp viajen como ese usuario (angeles). El SDK MCP da prioridad a customHeaders
// sobre el sharedSecret del authProvider, así que nuestro McpIdentityResolver
// resuelve el seid_ → datos scoped server-side.
//
// El token NUNCA se hardcodea: se lee de la env var SE_DEMO_TOKEN.
// Uso:
//   SE_DEMO_TOKEN=seid_... npx tsx -r dotenv/config admin/se_set_demo_header.ts
//
// El multi-usuario real requiere el OAuth personal_actions interactivo por
// usuario (SE-3.5e), no este atajo. Gitignored (vive bajo /dust/).
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

const WORKSPACE_ID = "RCZE0JGoXI";
const SERVER_SID = "rms_M3noyTRbIM";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const seid = process.env.SE_DEMO_TOKEN;
  if (!seid || !seid.startsWith("seid_")) {
    throw new Error(
      "Missing/invalid SE_DEMO_TOKEN env var (expected a seid_… personal token)"
    );
  }

  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  const server = await RemoteMCPServerResource.fetchById(auth, SERVER_SID);
  if (!server) {
    throw new Error(`Remote MCP server ${SERVER_SID} not found`);
  }

  const res = await server.updateMetadata(auth, {
    customHeaders: { Authorization: `Bearer ${seid}` },
    lastSyncAt: new Date(),
  });
  if (res.isErr()) {
    throw new Error("updateMetadata failed: " + res.error.message);
  }

  // Reload to confirm the header was persisted (value redacted in logs).
  const reloaded = await RemoteMCPServerResource.fetchById(auth, SERVER_SID);
  const headerKeys = reloaded?.customHeaders
    ? Object.keys(reloaded.customHeaders)
    : [];
  log("SERVER_SID=" + SERVER_SID);
  log("CUSTOM_HEADER_KEYS=" + JSON.stringify(headerKeys));
  log(
    "AUTH_HEADER_SET=" +
      (reloaded?.customHeaders?.Authorization?.startsWith("Bearer seid_") ===
        true)
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
