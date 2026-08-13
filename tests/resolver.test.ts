import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { schemaFileToTypeScript } from '../src/index.js';

test('resolves recursive \\i and \\include modular schema files', async () => {
  const testDir = mkdtempSync(join(tmpdir(), 'pgschema_test_'));
  mkdirSync(join(testDir, 'tables'), { recursive: true });
  mkdirSync(join(testDir, 'enums'), { recursive: true });

  const enumsSql = `CREATE TYPE app_role AS ENUM ('admin', 'user');`;
  const usersSql = `
    \\i ../enums/roles.sql
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      role app_role DEFAULT 'user'
    );
  `;
  const mainSql = `
    \\i tables/users.sql
  `;

  writeFileSync(join(testDir, 'enums', 'roles.sql'), enumsSql);
  writeFileSync(join(testDir, 'tables', 'users.sql'), usersSql);
  writeFileSync(join(testDir, 'main.sql'), mainSql);

  const mainFilePath = join(testDir, 'main.sql');
  const tsOutput = await schemaFileToTypeScript(mainFilePath);

  assert.ok(tsOutput.includes("export type AppRole = 'admin' | 'user';"));
  assert.ok(tsOutput.includes('export interface Users {'));
  assert.ok(tsOutput.includes('role: AppRole | null;'));

  rmSync(testDir, { recursive: true, force: true });
});
