import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const DEVTOOLS_DIR = "public/.well-known/appspecific";
const DEVTOOLS_FILE = `${DEVTOOLS_DIR}/com.chrome.devtools.json`;
const UUID_FILE = ".uuid";

async function getUuid(): Promise<string> {
  try {
    const uuid = await Deno.readTextFile(UUID_FILE);
    return uuid.trim();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      const newUuid = crypto.randomUUID();
      await Deno.writeTextFile(UUID_FILE, newUuid);
      return newUuid;
    }
    throw error;
  }
}

export async function generateDevtoolsJson() {
  await ensureDir(DEVTOOLS_DIR);

  const absolutePath = Deno.cwd();
  const uuid = await getUuid();

  const devtoolsConfig = {
    workspace: {
      root: absolutePath,
      uuid: uuid,
    },
  };

  await Deno.writeTextFile(DEVTOOLS_FILE, JSON.stringify(devtoolsConfig, null, 2));
}
