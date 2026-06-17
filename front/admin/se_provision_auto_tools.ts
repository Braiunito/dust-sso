// Script de bootstrap (SmartEscrow) — provisiona las INTERNAL "auto-tools" de Dust
// (common_utilities, files, …) creando sus MCPServerView por defecto en el workspace.
//
// PARA QUÉ: en Dust cloud estas vistas vienen creadas de fábrica; en nuestro self-host
// el workspace se bootstrapeó sin ellas. El agent loop SIEMPRE carga estas tools base
// (JIT actions), así que sin ellas falla con:
//   "MCP server view not found for common_utilities. Ensure auto tools are created."
// y el loop no ejecuta NINGUNA acción (stepsCompleted:0), aunque el modelo emita el tool-call.
//
// Es idempotente: ensureAllAutoToolsAreCreated() comprueba las vistas existentes y solo
// crea las que faltan (requiere auth de admin del workspace).
//
// Uso: npx tsx admin/se_provision_auto_tools.ts
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";

const WORKSPACE_ID = "RCZE0JGoXI";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);
  if (!auth.isAdmin()) {
    throw new Error(
      "auth no es admin del workspace; ensureAllAutoToolsAreCreated no crearía nada."
    );
  }
  const { createdViewsCount } =
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  log("AUTO_TOOLS_CREATED_VIEWS=" + createdViewsCount);
  log(
    createdViewsCount > 0
      ? "✅ Auto-tools provisionadas. El agent loop ya puede ejecutar acciones."
      : "ℹ️ Ya estaban creadas (0 nuevas). Si el loop sigue en stepsCompleted:0, el bloqueo es otro."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, "se_provision_auto_tools failed");
    process.exit(1);
  });
