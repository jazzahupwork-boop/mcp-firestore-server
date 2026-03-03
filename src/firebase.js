import admin from "firebase-admin";
import { detectProjectId } from "./config.js";
import { TARGETS } from "./constants.js";

let emulatorDb = null;
let productionDb = null;
let defaultTarget = null;
let availableTargets = [];

/**
 * Initialize Firebase with dual-endpoint support.
 *
 * Uses env var toggling at construction time:
 * 1. Set FIRESTORE_EMULATOR_HOST -> init emulator app -> Firestore captures it
 * 2. Delete FIRESTORE_EMULATOR_HOST -> init production app -> goes to real Firestore
 * 3. Restore env var -> both instances retain their construction-time settings
 *
 * This is safe because @google-cloud/firestore reads the env var only during
 * construction. Once created, settings are immutable.
 */
export function initFirebase() {
  // Reset state for idempotent re-initialization
  emulatorDb = null;
  productionDb = null;
  defaultTarget = null;
  availableTargets = [];

  const projectId = detectProjectId();

  if (!projectId) {
    throw new Error(
      "Could not detect Google Cloud Project ID. " +
        "Set GOOGLE_CLOUD_PROJECT, FIREBASE_PROJECT_ID, configure gcloud, " +
        "or add a .firebaserc / firebase.json file.",
    );
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!emulatorHost && !hasCredentials) {
    throw new Error(
      "No Firestore target configured. " +
        "Set FIRESTORE_EMULATOR_HOST (for emulator) and/or " +
        "GOOGLE_APPLICATION_CREDENTIALS (for production).",
    );
  }

  console.error(`Project ID: ${projectId}`);

  // Initialize emulator target
  if (emulatorHost) {
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
    const app = admin.initializeApp({ projectId }, TARGETS.EMULATOR);
    emulatorDb = admin.firestore(app);
    availableTargets.push(TARGETS.EMULATOR);
    console.error(`[${TARGETS.EMULATOR}] Firestore initialized -> ${emulatorHost}`);
  }

  // Initialize production target
  if (hasCredentials) {
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;

    const app = admin.initializeApp({ projectId }, TARGETS.PRODUCTION);
    productionDb = admin.firestore(app);
    availableTargets.push(TARGETS.PRODUCTION);
    console.error(`[${TARGETS.PRODUCTION}] Firestore initialized`);

    if (savedHost) process.env.FIRESTORE_EMULATOR_HOST = savedHost;
  }

  // Resolve default target
  const envDefault = process.env.MCP_FIRESTORE_DEFAULT_TARGET;
  if (envDefault && availableTargets.includes(envDefault)) {
    defaultTarget = envDefault;
  } else if (availableTargets.length === 1) {
    defaultTarget = availableTargets[0];
  } else {
    defaultTarget = TARGETS.EMULATOR; // prefer emulator when both available
  }

  console.error(`Default target: ${defaultTarget}`);
  console.error(`Available targets: ${availableTargets.join(", ")}`);

  return { projectId, defaultTarget, availableTargets: [...availableTargets] };
}

/**
 * Get a Firestore database instance for the given target.
 * Falls back to the default target if none specified.
 */
export function getDb(target) {
  const resolved = target || defaultTarget;

  if (resolved === TARGETS.EMULATOR) {
    if (!emulatorDb) {
      throw new Error(
        "Emulator target is not available. Set FIRESTORE_EMULATOR_HOST to enable it.",
      );
    }
    return { db: emulatorDb, target: TARGETS.EMULATOR };
  }

  if (resolved === TARGETS.PRODUCTION) {
    if (!productionDb) {
      throw new Error(
        "Production target is not available. Set GOOGLE_APPLICATION_CREDENTIALS to enable it.",
      );
    }
    return { db: productionDb, target: TARGETS.PRODUCTION };
  }

  throw new Error(
    `Unknown target "${resolved}". Available: ${availableTargets.join(", ")}`,
  );
}
