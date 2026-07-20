import os from "node:os";
import path from "node:path";

export interface DataPaths {
  root: string;
  database: string;
  originalResumesDir: string;
  parsedResumesDir: string;
  generatedDir: string;
  backupsDir: string;
}

export function resolveDataPaths(explicitRoot?: string): DataPaths {
  const configured = explicitRoot ?? process.env.CAMPUS_JOB_AGENT_DATA_DIR;
  let root: string;

  if (configured) {
    root = path.resolve(configured);
  } else if (process.platform === "win32") {
    if (!process.env.LOCALAPPDATA) {
      throw new Error("Local application data directory is unavailable");
    }
    root = path.join(process.env.LOCALAPPDATA, "CampusJobAgent");
  } else {
    root = path.join(os.homedir(), ".local", "share", "campus-job-agent");
  }

  return {
    root,
    database: path.join(root, "data.sqlite"),
    originalResumesDir: path.join(root, "resumes", "original"),
    parsedResumesDir: path.join(root, "resumes", "parsed"),
    generatedDir: path.join(root, "generated"),
    backupsDir: path.join(root, "backups"),
  };
}
