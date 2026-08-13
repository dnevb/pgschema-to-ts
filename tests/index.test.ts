import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTypeScript, parseSqlSchema, schemaToTypeScript } from '../src/index.js';

test('parseSqlSchema extracts basic tables and columns', async () => {
  const sql = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      tags TEXT[]
    );
  `;

  const parsed = await parseSqlSchema(sql);
  assert.equal(parsed.tables.length, 1);
  const table = parsed.tables[0]!;
  assert.equal(table.name, 'users');
  assert.equal(table.columns.length, 5);

  const [id, name, email, createdAt, tags] = table.columns;
  assert.equal(id!.name, 'id');
  assert.equal(id!.isPrimaryKey, true);
  assert.equal(id!.hasDefault, true);

  assert.equal(name!.name, 'name');
  assert.equal(name!.isNullable, false);

  assert.equal(email!.name, 'email');
  assert.equal(email!.isNullable, true);

  assert.equal(createdAt!.name, 'created_at');
  assert.equal(createdAt!.hasDefault, true);

  assert.equal(tags!.name, 'tags');
  assert.equal(tags!.isArray, true);
});

test('handles multiple tables, enums, foreign key references, and custom types', async () => {
  const sql = `
    CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'member', 'guest');
    CREATE TYPE order_status AS ENUM ('pending', 'processing', 'completed', 'cancelled');

    CREATE TABLE organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      metadata JSONB,
      is_active BOOLEAN DEFAULT true NOT NULL
    );

    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      org_id UUID REFERENCES organizations(id),
      email TEXT NOT NULL,
      role user_role DEFAULT 'member' NOT NULL,
      scores INT4[],
      last_login TIMESTAMP WITHOUT TIME ZONE
    );

    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      status order_status NOT NULL DEFAULT 'pending',
      total_amount NUMERIC(10, 2) NOT NULL,
      items JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `;

  const parsed = await parseSqlSchema(sql);

  assert.equal(parsed.enums.length, 2);
  assert.equal(parsed.enums[0]!.name, 'user_role');
  assert.deepEqual(parsed.enums[0]!.values, ['admin', 'moderator', 'member', 'guest']);
  assert.equal(parsed.enums[1]!.name, 'order_status');
  assert.deepEqual(parsed.enums[1]!.values, ['pending', 'processing', 'completed', 'cancelled']);

  assert.equal(parsed.tables.length, 3);
  assert.deepEqual(parsed.tables.map((t) => t.name), ['organizations', 'users', 'orders']);

  const generatedTs = await schemaToTypeScript(sql, {
    generateInsertUpdateTypes: true,
    interfacePrefix: 'Db',
  });

  // Verify Enum Generation
  assert.ok(generatedTs.includes("export type DbUserRole = 'admin' | 'moderator' | 'member' | 'guest';"));
  assert.ok(generatedTs.includes("export type DbOrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';"));

  // Verify Interface Generation
  assert.ok(generatedTs.includes('export interface DbOrganizations {'));
  assert.ok(generatedTs.includes('id: string;'));
  assert.ok(generatedTs.includes('metadata: any | null;'));
  assert.ok(generatedTs.includes('is_active: boolean;'));

  assert.ok(generatedTs.includes('export interface DbUsers {'));
  assert.ok(generatedTs.includes('role: DbUserRole;'));
  assert.ok(generatedTs.includes('scores: number[] | null;'));
  assert.ok(generatedTs.includes('last_login: Date | null;'));

  assert.ok(generatedTs.includes('export interface DbOrders {'));
  assert.ok(generatedTs.includes('id: number;'));
  assert.ok(generatedTs.includes('status: DbOrderStatus;'));
  assert.ok(generatedTs.includes('total_amount: number;'));
  assert.ok(generatedTs.includes('items: any;'));

  // Verify Insert/Update Helpers
  assert.ok(generatedTs.includes('export interface DbOrganizationsInsert {'));
  assert.ok(generatedTs.includes('id?: string;'));
  assert.ok(generatedTs.includes('is_active?: boolean;'));
  assert.ok(generatedTs.includes('export type DbOrganizationsUpdate = Partial<DbOrganizationsInsert>;'));
});

test('supports custom type maps in generator options', async () => {
  const sql = `
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      payload JSONB NOT NULL,
      ip_address INET
    );
  `;

  const parsed = await parseSqlSchema(sql);

  const customTs = generateTypeScript(parsed, {
    customTypeMap: {
      jsonb: 'Record<string, unknown>',
      inet: 'string',
    },
  });

  assert.ok(customTs.includes('payload: Record<string, unknown>;'));
  assert.ok(customTs.includes('ip_address: string | null;'));
});

test('supports composite types (CREATE TYPE ... AS (...))', async () => {
  const sql = `
    CREATE TYPE address AS (
      street TEXT,
      city TEXT,
      zip_code INT
    );

    CREATE TABLE contacts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      home_address address
    );
  `;

  const parsed = await parseSqlSchema(sql);
  assert.equal(parsed.compositeTypes.length, 1);
  assert.equal(parsed.compositeTypes[0]!.name, 'address');
  assert.equal(parsed.compositeTypes[0]!.attributes.length, 3);

  const ts = await schemaToTypeScript(sql);
  assert.ok(ts.includes('export interface Address {'));
  assert.ok(ts.includes('street: string | null;'));
  assert.ok(ts.includes('city: string | null;'));
  assert.ok(ts.includes('zip_code: number | null;'));
  assert.ok(ts.includes('home_address: Address | null;'));
});

test('handles table-level primary key constraints and header banner option', async () => {
  const sql = `
    CREATE TABLE product_tags (
      product_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT pk_product_tags PRIMARY KEY (product_id, tag_id)
    );
  `;

  const parsed = await parseSqlSchema(sql);
  assert.equal(parsed.tables.length, 1);
  const table = parsed.tables[0]!;
  const [productId, tagId] = table.columns;

  assert.equal(productId!.isPrimaryKey, true);
  assert.equal(productId!.isNullable, false);
  assert.equal(tagId!.isPrimaryKey, true);
  assert.equal(tagId!.isNullable, false);

  const ts = await schemaToTypeScript(sql, { generateHeaderBanner: true });
  assert.ok(ts.includes('/* Auto-generated by pgschema-to-ts. Do not edit directly. */'));
});
