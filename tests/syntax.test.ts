import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTypeScript, parseSqlSchema, schemaToTypeScript } from '../src/index.js';

test('supports CREATE DOMAIN custom type aliases', async () => {
  const sql = `
    CREATE DOMAIN email_address AS VARCHAR(255);
    CREATE DOMAIN user_ids AS INT[];

    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email email_address NOT NULL,
      friend_ids user_ids
    );
  `;

  const parsed = await parseSqlSchema(sql);
  assert.equal(parsed.domains.length, 2);
  assert.equal(parsed.domains[0]!.name, 'email_address');
  assert.equal(parsed.domains[0]!.baseType, 'varchar');

  const ts = await schemaToTypeScript(sql);
  assert.ok(ts.includes('export type EmailAddress = string;'));
  assert.ok(ts.includes('export type UserIds = number[];'));
  assert.ok(ts.includes('email: EmailAddress;'));
  assert.ok(ts.includes('friend_ids: UserIds | null;'));
});

test('supports CREATE VIEW with joins, aliases, and aggregate functions', async () => {
  const sql = `
    CREATE TYPE user_role AS ENUM ('admin', 'member');

    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      role user_role DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      amount NUMERIC NOT NULL
    );

    CREATE VIEW user_order_summaries AS
    SELECT
      u.id AS user_id,
      u.email,
      u.role,
      COALESCE(COUNT(o.id), 0) AS total_orders,
      MAX(o.amount) AS highest_order,
      MAX(u.created_at) AS last_seen
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    GROUP BY u.id, u.email, u.role;
  `;

  const parsed = await parseSqlSchema(sql);
  assert.equal(parsed.views.length, 1);
  const view = parsed.views[0]!;
  assert.equal(view.name, 'user_order_summaries');
  assert.equal(view.columns.length, 6);

  assert.deepEqual(
    view.columns.map((c) => c.name),
    ['user_id', 'email', 'role', 'total_orders', 'highest_order', 'last_seen']
  );

  const ts = await schemaToTypeScript(sql);
  assert.ok(ts.includes('export interface UserOrderSummaries {'));
  assert.ok(ts.includes('user_id: number | null;'));
  assert.ok(ts.includes('email: string | null;'));
  assert.ok(ts.includes('role: UserRole | null;'));
  assert.ok(ts.includes('total_orders: string | null;'));
  assert.ok(ts.includes('highest_order: string | null;'));
  assert.ok(ts.includes('last_seen: string | null;'));
});

test('public schema strips prefix, other schemas prefix with PascalCase schema name', async () => {
  const sql = `
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
    CREATE TYPE auth.session_status AS ENUM ('active', 'expired');

    CREATE TABLE public.organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL
    );

    CREATE TABLE auth.users (
      id SERIAL PRIMARY KEY,
      org_id UUID NOT NULL,
      role public.app_role NOT NULL,
      status auth.session_status DEFAULT 'active'
    );

    CREATE VIEW auth.active_users AS
    SELECT id, role FROM auth.users WHERE status = 'active';
  `;

  const parsed = await parseSqlSchema(sql);

  // Parser stores schema correctly
  assert.equal(parsed.enums[0]!.schema, undefined);        // public => stripped
  assert.equal(parsed.enums[1]!.schema, 'auth');
  assert.equal(parsed.tables[0]!.schema, undefined);       // public => stripped
  assert.equal(parsed.tables[1]!.schema, 'auth');
  assert.equal(parsed.views[0]!.schema, 'auth');

  const ts = await schemaToTypeScript(sql);

  // public schema objects: no prefix
  assert.ok(ts.includes("export type AppRole = 'admin' | 'user';"));
  assert.ok(ts.includes('export interface Organizations {'));

  // auth schema objects: AuthXxx prefix
  assert.ok(ts.includes("export type AuthSessionStatus = 'active' | 'expired';"));
  assert.ok(ts.includes('export interface AuthUsers {'));
  assert.ok(ts.includes('export interface AuthActiveUsers {'));

  // cross-schema type references resolve correctly
  assert.ok(ts.includes('role: AppRole;'));
  assert.ok(ts.includes('status: AuthSessionStatus | null;'));
});

test('unqualified objects behave identically to public-qualified ones', async () => {
  const unqualified = await schemaToTypeScript(`
    CREATE TYPE job_status AS ENUM ('queued', 'done');
    CREATE TABLE jobs ( id SERIAL PRIMARY KEY, status job_status NOT NULL );
  `);

  const publicQualified = await schemaToTypeScript(`
    CREATE TYPE public.job_status AS ENUM ('queued', 'done');
    CREATE TABLE public.jobs ( id SERIAL PRIMARY KEY, status public.job_status NOT NULL );
  `);

  assert.equal(unqualified, publicQualified);
});
