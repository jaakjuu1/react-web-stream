import { execSync } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default function setup() {
  // Fresh schema for every run; prisma resolves file: URLs relative to schema.prisma
  for (const suffix of ['', '-journal']) {
    rmSync(path.join(serverRoot, 'prisma', `test.db${suffix}`), { force: true });
  }
  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
