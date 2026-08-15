import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTypeScript, parseSqlSchema, schemaToTypeScript } from '../src/index.js';

const BASE_SQL = `
  CREATE TYPE user_role AS ENUM ('admin', 'member');

  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role user_role DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login DATE,
    score NUMERIC NOT NULL
  );

  CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    title TEXT NOT NULL,
    published_at TIMESTAMP
  );
`;

// ── datesAsStrings ──────────────────────────────────────────────────────────

test('datesAsStrings: maps date/timestamp columns to string instead of Date', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);

  const ts = generateTypeScript(parsed, { datesAsStrings: true });
  assert.ok(ts.includes('created_at: string | null;'),  'timestamptz -> string');
  assert.ok(ts.includes('last_login: string | null;'),  'date -> string');
  assert.ok(ts.includes('published_at: string | null;'), 'timestamp -> string');
});

test('datesAsStrings: Date is kept by default', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed);
  assert.ok(ts.includes('created_at: Date | null;'));
  assert.ok(ts.includes('last_login: Date | null;'));
});

test('datesAsStrings: does not affect non-date types', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { datesAsStrings: true });
  assert.ok(ts.includes('id: number;'));
  assert.ok(ts.includes('email: string;'));
  assert.ok(ts.includes('score: number;'));
});

// ── camelCase ───────────────────────────────────────────────────────────────

test('camelCase: renames snake_case column properties to camelCase', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { camelCase: true });
  assert.ok(ts.includes('userName: string;'),        'user_name -> userName');
  assert.ok(ts.includes('createdAt: Date | null;'),  'created_at -> createdAt');
  assert.ok(ts.includes('lastLogin: Date | null;'),  'last_login -> lastLogin');
  assert.ok(ts.includes('userId: number;'),          'user_id -> userId in posts');
  assert.ok(ts.includes('publishedAt: Date | null;'),'published_at -> publishedAt');
});

test('camelCase: column names in runtime consts stay as snake_case', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { camelCase: true, generateTableConsts: true });
  assert.ok(ts.includes("'user_name'"), 'column name in const is snake_case');
  assert.ok(ts.includes("'created_at'"), 'column name in const is snake_case');
});

test('camelCase: Insert/Update types also use camelCase property names', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { camelCase: true, generateInsertUpdateTypes: true });
  assert.ok(ts.includes('userName: string;'));
  assert.ok(ts.includes('createdAt?: Date | null;'));
});

test('camelCase: enum values and type names are unchanged', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { camelCase: true });
  assert.ok(ts.includes("export type UserRole = 'admin' | 'member';"));
  assert.ok(ts.includes('role: UserRole | null;'));
});

// ── generateTableConsts ─────────────────────────────────────────────────────

test('generateTableConsts: emits const with tableName, columns, requiredForInsert', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { generateTableConsts: true });

  assert.ok(ts.includes('export const users = {'));
  assert.ok(ts.includes("tableName: 'users',"));
  assert.ok(ts.includes("'id', 'user_name', 'email', 'role', 'created_at', 'last_login', 'score'"));
  assert.ok(ts.includes('] as const,'));
  assert.ok(ts.includes('} as const;'));
});

test('generateTableConsts: requiredForInsert only contains non-null non-default columns', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { generateTableConsts: true });

  // id (serial -> has default), role (has default), created_at (has default), last_login (nullable) are excluded
  // user_name, email, score are NOT nullable and have NO default
  const constBlock = ts.slice(ts.indexOf('export const users'));
  assert.ok(constBlock.includes("requiredForInsert: ['user_name', 'email', 'score'] as const"));
});

test('generateTableConsts: schema-qualified table uses schema.name as tableName', async () => {
  const sql = `
    CREATE TABLE auth.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `;
  const parsed = await parseSqlSchema(sql);
  const ts = generateTypeScript(parsed, { generateTableConsts: true });

  assert.ok(ts.includes('export const authSessions = {'));
  assert.ok(ts.includes("tableName: 'auth.sessions',"));
  assert.ok(ts.includes("requiredForInsert: ['token', 'expires_at'] as const"));
});

test('generateTableConsts: multiple tables each get their own const', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, { generateTableConsts: true });

  assert.ok(ts.includes('export const users = {'));
  assert.ok(ts.includes('export const posts = {'));
  assert.ok(ts.includes("tableName: 'posts',"));
  // title in posts is NOT NULL and no default -> required
  assert.ok(ts.includes("'user_id', 'title'"));
});

// ── combinations ────────────────────────────────────────────────────────────

test('datesAsStrings + camelCase + generateTableConsts work together', async () => {
  const parsed = await parseSqlSchema(BASE_SQL);
  const ts = generateTypeScript(parsed, {
    datesAsStrings: true,
    camelCase: true,
    generateTableConsts: true,
  });

  // camelCase properties
  assert.ok(ts.includes('createdAt: string | null;'));
  assert.ok(ts.includes('lastLogin: string | null;'));

  // const column names still snake_case
  assert.ok(ts.includes("'created_at'"));

  // table const present
  assert.ok(ts.includes('export const users = {'));
});
