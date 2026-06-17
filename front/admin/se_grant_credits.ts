// Script de bootstrap (SmartEscrow) — concede créditos "free" a un workspace
// para desbloquear el API programático en SELF-HOST (sin Metronome).
// Uso: npx tsx admin/se_grant_credits.ts --wId <sId> [--usd 1000000]
// Gitignored (vive bajo /dust/). No forma parte del repo de Dust.
//
// Por qué: checkProgrammaticUsageLimits() corta con "credits_exhausted" cuando
// CreditResource.listActive(auth).length === 0. Concediendo un crédito "free"
// sin expiración, listActive devuelve >=1 y el gate pasa. No forkea código Dust.
import parseArgs from "minimist";

import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const wId = argv.wId as string;
  if (!wId) {
    throw new Error("Missing --wId");
  }
  const usd = Number(argv.usd ?? 1_000_000); // $1M por defecto
  const microUsd = Math.round(usd * 1_000_000);

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${wId}`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(wId);

  await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountMicroUsd: microUsd,
    consumedAmountMicroUsd: 0,
    startDate: new Date(), // listActive exige startDate != null y <= now
    expirationDate: null,
    metronomeCreditId: null,
  } as never);

  const active = await CreditResource.listActive(auth);
  // eslint-disable-next-line no-console
  console.log(
    `SE_CREDITS_OK wId=${wId} granted=$${usd} activeCredits=${active.length}`
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
);
