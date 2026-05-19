import { writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ServerConfig {
  port: number;
  pid:  number;
  ts:   string;
}

export function getServerConfigPath(): string {
  const localAppData = process.env['LOCALAPPDATA']
    ?? join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.', 'AppData', 'Local');
  return join(localAppData, 'FactumIL', 'runtime', 'server_config.json');
}

export async function writeServerConfig(cfg: ServerConfig): Promise<void> {
  const dest = getServerConfigPath();
  const tmp  = dest + '.tmp';
  await mkdir(join(dest, '..'), { recursive: true });
  await writeFile(tmp, JSON.stringify(cfg), 'utf8');
  await rename(tmp, dest);
}

export async function clearServerConfig(): Promise<void> {
  try {
    await unlink(getServerConfigPath());
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
