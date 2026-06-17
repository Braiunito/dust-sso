// Archiva un agente de workspace por nombre (lo retira del workspace sin borrar historial).
// Uso: SE_AGENT_NAME=se-wallet npx tsx admin/se_archive_agent.ts
import {
  archiveAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";

const WS = "RCZE0JGoXI";
const NAME = process.env.SE_AGENT_NAME || "se-wallet";

(async () => {
  const auth = await Authenticator.internalAdminForWorkspace(WS);
  const found = await searchAgentConfigurationsByName(auth, NAME);
  const match = found.find((a) => a.name === NAME);
  if (!match) {
    // eslint-disable-next-line no-console
    console.log("NOT_FOUND " + NAME);
    process.exit(0);
  }
  const ok = await archiveAgentConfiguration(auth, match.sId);
  // eslint-disable-next-line no-console
  console.log("ARCHIVED " + NAME + " sId=" + match.sId + " ok=" + ok);
  process.exit(0);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
