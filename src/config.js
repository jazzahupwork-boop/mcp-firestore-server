import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

/**
 * Auto-detect Google Cloud Project ID from environment, gcloud config,
 * or Firebase config files.
 */
export function detectProjectId() {
  // 1. Check environment variables
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;

  // 2. Try to get from gcloud config
  try {
    const gcloudProject = execSync("gcloud config get-value project 2>/dev/null", {
      encoding: "utf8",
    }).trim();
    if (gcloudProject && gcloudProject !== "") {
      console.error(`Auto-detected project from gcloud: ${gcloudProject}`);
      return gcloudProject;
    }
  } catch (e) {
    // gcloud not installed or not configured
  }

  // 3. Check for firebase.json / .firebaserc in current and parent directories
  let currentDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const firebaseJsonPath = join(currentDir, "firebase.json");
    if (existsSync(firebaseJsonPath)) {
      try {
        const firebaseConfig = JSON.parse(readFileSync(firebaseJsonPath, "utf8"));
        if (firebaseConfig.projects?.default) {
          console.error(
            `Auto-detected project from firebase.json: ${firebaseConfig.projects.default}`,
          );
          return firebaseConfig.projects.default;
        }
      } catch (e) {
        // Invalid firebase.json
      }
    }

    const firebasercPath = join(currentDir, ".firebaserc");
    if (existsSync(firebasercPath)) {
      try {
        const firebaserc = JSON.parse(readFileSync(firebasercPath, "utf8"));
        if (firebaserc.projects?.default) {
          console.error(
            `Auto-detected project from .firebaserc: ${firebaserc.projects.default}`,
          );
          return firebaserc.projects.default;
        }
      } catch (e) {
        // Invalid .firebaserc
      }
    }

    const parentDir = join(currentDir, "..");
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}
