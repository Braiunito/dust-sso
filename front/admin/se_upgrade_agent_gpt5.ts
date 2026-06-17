// One-off (SmartEscrow): regenera el agente de workspace `se-wallet` para que use
// el modelo del agente global `gpt-5` (gpt-5.5, mejor en tool-calling que gpt-5-mini),
// conservando la action MCP project_query. Prueba si un modelo OpenAI más fuerte SÍ
// emite el tool-call que gpt-5-mini no emitía.
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { Authenticator } from "@app/lib/auth";

const WS = "RCZE0JGoXI";
const AGENT_NAME = "se-wallet";
const BASE_GLOBAL = "gpt-5"; // agente global cuyo modelo (gpt-5.5) reusamos

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);

  const existing = await searchAgentConfigurationsByName(auth, AGENT_NAME);
  const match = existing.find((a) => a.name === AGENT_NAME);
  if (!match) {
    throw new Error("No existe el agente " + AGENT_NAME);
  }
  const cur = await getAgentConfiguration(auth, { agentId: match.sId, variant: "full" });
  if (!cur) {
    throw new Error("No se pudo leer la config actual de " + AGENT_NAME);
  }

  const base = await getAgentConfiguration(auth, { agentId: BASE_GLOBAL, variant: "full" });
  if (!base?.model) {
    throw new Error("No se pudo leer el modelo del agente global " + BASE_GLOBAL);
  }
  console.log("NEW_MODEL=" + JSON.stringify(base.model));

  // Reusa todo lo de la versión actual, solo cambia el modelo.
  const assistant: any = {
    name: cur.name,
    description: cur.description,
    instructions: cur.instructions,
    instructionsHtml: null,
    pictureUrl: cur.pictureUrl,
    status: "active",
    scope: cur.scope,
    model: base.model,
    actions: (cur.actions ?? []).map((a: any) => ({
      type: a.type,
      name: a.name,
      description: a.description,
      mcpServerViewId: a.mcpServerViewId,
      dataSources: a.dataSources ?? null,
      tables: a.tables ?? null,
      childAgentId: a.childAgentId ?? null,
      additionalConfiguration: a.additionalConfiguration ?? {},
      dustAppConfiguration: a.dustAppConfiguration ?? null,
      secretName: a.secretName ?? null,
      timeFrame: a.timeFrame ?? null,
      jsonSchema: a.jsonSchema ?? null,
      dustProject: a.dustProject ?? null,
    })),
    templateId: null,
    tags: [],
    editors: (cur.editors ?? []).map((e: any) => ({ sId: e.sId })),
    skills: [],
    additionalRequestedSpaceIds: [],
    maxStepsPerRun: cur.maxStepsPerRun ?? 8,
    visualizationEnabled: false,
  };

  const res = await createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    authorId: cur.versionAuthorId ?? undefined,
    agentConfigurationId: match.sId,
  });
  if (res.isErr()) {
    throw new Error("Upgrade failed: " + res.error.message);
  }
  console.log("AGENT_SID=" + res.value.sId);
  console.log("AGENT_VERSION=" + res.value.version);
  console.log("AGENT_MODEL=" + JSON.stringify(res.value.model));
  console.log("AGENT_TOOLS=" + (res.value.actions ?? []).length);
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
