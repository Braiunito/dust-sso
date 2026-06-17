// Script de bootstrap (SmartEscrow) — crea un USER + MEMBERSHIP (admin) headless
// en el workspace de Dust, para poder ser autor/editor de un agente de workspace.
// Uso: npx tsx admin/se_create_workspace_user.ts
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
//
// WorkOS está bypassed en dev: creamos el user con workOSUserId=null, así que ni
// makeNew ni createMembership invocan WorkOS (su updateWorkOSMembershipRole es no-op).
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

const WORKSPACE_ID = "RCZE0JGoXI";
const USER_EMAIL = "se-bot@smartescrow.es";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  const ws = await WorkspaceResource.fetchById(WORKSPACE_ID);
  if (!ws) {
    throw new Error(`Workspace not found: ${WORKSPACE_ID}`);
  }
  const light = renderLightWorkspaceType({ workspace: ws });

  // Reuse an existing user with the same email if present (idempotent re-runs).
  const existing = await UserResource.fetchByEmail(USER_EMAIL);
  let user = existing;
  if (user) {
    log("EXISTING_USER_MODEL_ID=" + user.id, "USER_SID=" + user.sId);
  } else {
    user = await UserResource.makeNew({
      sId: generateRandomModelSId(),
      provider: "google",
      providerId: null,
      username: "se-bot",
      email: USER_EMAIL,
      name: "SE Bot",
      firstName: "SE",
      lastName: "Bot",
      imageUrl: null,
      workOSUserId: null,
      lastLoginAt: new Date(),
    });
    log("CREATED_USER_MODEL_ID=" + user.id, "USER_SID=" + user.sId);
  }

  // Membership (idempotent: createMembership throws if already active).
  const activeMemberships = await MembershipResource.getActiveMemberships({
    users: [user],
    workspace: light,
  });
  if (activeMemberships.memberships.length > 0) {
    log(
      "EXISTING_MEMBERSHIP role=" + activeMemberships.memberships[0].role,
      "id=" + activeMemberships.memberships[0].id
    );
  } else {
    const membership = await MembershipResource.createMembership({
      user,
      workspace: light,
      role: "admin",
      origin: "invited",
      seatType: "workspace",
      startAt: new Date(),
    });
    log("CREATED_MEMBERSHIP_MODEL_ID=" + membership.id, "role=admin");
  }

  log("USER_MODEL_ID=" + user.id);
  log("USER_SID=" + user.sId);
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
