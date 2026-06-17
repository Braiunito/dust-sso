// Script de bootstrap (SmartEscrow) — crea una API key para un workspace.
// Uso: npx tsx admin/se_create_key.ts --wId <sId>
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
import parseArgs from "minimist";

import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Authenticator } from "@app/lib/auth";

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const wId = argv.wId as string;
  if (!wId) {
    throw new Error("Missing --wId");
  }

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${wId}`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(wId);
  const systemGroup = await GroupResource.fetchWorkspaceSystemGroup(auth);
  const globalGroup = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  const groups = [systemGroup, globalGroup]
    .filter((g) => g.isOk())
    .map((g) => (g as { value: GroupResource }).value);

  const key = await KeyResource.makeNew(
    {
      name: "smartescrow-dev",
      workspaceId: workspace.id,
      isSystem: false,
      status: "active",
    } as never,
    groups
  );

  // eslint-disable-next-line no-console
  console.log("SE_API_KEY=" + key.secret);
}

main().then(
  () => process.exit(0),
  (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
);
