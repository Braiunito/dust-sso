// One-off (SmartEscrow): cambia el MODELO del agente `se-wallet` conservando su
// action MCP y sus instrucciones. Sirve para probar un modelo con tool-calling
// fiable (Claude) frente a los OpenAI que no emitían el tool-call.
//   SE_PROVIDER=anthropic SE_MODEL=claude-sonnet-4-6 SE_EFFORT=medium \
//     npx tsx admin/se_set_model.ts
import {
  getAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { Authenticator } from "@app/lib/auth";

const WS = "RCZE0JGoXI";
const AGENT_NAME = "se-wallet";
const PROVIDER = process.env.SE_PROVIDER || "anthropic";
const MODEL = process.env.SE_MODEL || "claude-sonnet-4-6";
const EFFORT = process.env.SE_EFFORT || "medium";

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const existing = await searchAgentConfigurationsByName(auth, AGENT_NAME);
  const match = existing.find((a) => a.name === AGENT_NAME);
  if (!match) {
    throw new Error("No existe el agente " + AGENT_NAME);
  }
  const cur = await getAgentConfiguration(auth, {
    agentId: match.sId,
    variant: "full",
  });
  if (!cur?.model) {
    throw new Error("No se pudo leer la config actual de " + AGENT_NAME);
  }

  const assistant: any = {
    name: cur.name,
    description: cur.description,
    instructions: cur.instructions,
    instructionsHtml: null,
    pictureUrl: cur.pictureUrl,
    status: "active",
    scope: cur.scope,
    model: {
      providerId: PROVIDER,
      modelId: MODEL,
      temperature: cur.model.temperature ?? 0.7,
      reasoningEffort: EFFORT,
    },
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
  // eslint-disable-next-line no-console
  console.log(
    "AGENT_SID=" +
      res.value.sId +
      " VERSION=" +
      res.value.version +
      " MODEL=" +
      JSON.stringify(res.value.model)
  );
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
