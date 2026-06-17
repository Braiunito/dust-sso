// Inspecciona el agente se-wallet: instrucciones, modelo y acciones MCP a runtime.
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";

const WORKSPACE_ID = "RCZE0JGoXI";
const AGENT_SID = process.env.SE_AGENT_SID ?? "1FdaVcjyKI";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);
  const agent = await getAgentConfiguration(auth, {
    agentId: AGENT_SID,
    variant: "full",
  });
  if (!agent) {
    throw new Error("Agent not found: " + AGENT_SID);
  }
  log("NAME=" + agent.name);
  log("SID=" + agent.sId);
  log("STATUS=" + agent.status);
  log("SCOPE=" + agent.scope);
  log("VERSION=" + agent.version);
  log("INSTRUCTIONS=" + JSON.stringify(agent.instructions));
  log("MODEL=" + JSON.stringify(agent.model));
  log(
    "ACTIONS=" +
      JSON.stringify(
        agent.actions.map((a: any) => ({
          type: a.type,
          name: a.name,
          mcpServerViewId: a.mcpServerViewId,
        }))
      )
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
