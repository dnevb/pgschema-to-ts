# pgschema-to-ts

Generate TypeScript interfaces directly from PostgreSQL DDL SQL files without database connections using [`libpg-query`](https://www.npmjs.com/package/libpg-query).

Designed to pair with [pgschema.com](https://www.pgschema.com/) — declare your schema in SQL, generate types automatically.

## Features

- **Offline DDL Parsing** — no live Postgres database required
- **Modular Schema Files** — supports `psql` inclusion directives (`\i file.sql`, `\include file.sql`)
- **Full Declarative Object Support** — `CREATE TABLE`, `CREATE TYPE … AS ENUM`, composite types, `CREATE DOMAIN`, `CREATE VIEW`
- **Schema Qualification** — `public.users` → `Users`, `auth.users` → `AuthUsers`
- **Rich Type Mapping** — native Postgres types, arrays, nullability, defaults
- **Insert/Update Helper Types** — optional `UsersInsert` / `UsersUpdate` per table
- **Runtime Table Consts** — optional `const users = { tableName, columns, requiredForInsert } as const`
- **camelCase Output** — optionally rename `snake_case` column properties to `camelCase`
- **Dates as Strings** — optionally map `date`/`timestamp` columns to `string` instead of `Date`

## Installation

```bash
npm install -g pgschema-to-ts
# or as a dev dependency
npm install -D pgschema-to-ts
```

## CLI

```bash
pgschema-to-ts schema.sql -o schema.ts
pgschema-to-ts schema.sql -o schema.ts --helpers --consts --camel-case
```

### Options

| Flag | Description |
|---|---|
| `-f, --file <path>` | Input SQL file path |
| `-o, --output <path>` | Output `.ts` file (defaults to stdout) |
| `-p, --prefix <string>` | Prefix for generated type/interface names |
| `-s, --suffix <string>` | Suffix for generated type/interface names |
| `--helpers` | Generate `Insert` and `Update` helper types per table |
| `--consts` | Generate runtime `const` per table (`tableName`, `columns`, `requiredForInsert`) |
| `--camel-case` | Rename `snake_case` column properties to `camelCase` |
| `--dates-as-strings` | Map `date`/`timestamp` columns to `string` instead of `Date` |
| `-h, --help` | Show help |

## Programmatic API

```ts
import { schemaToTypeScript, schemaFileToTypeScript, parseSqlSchema, generateTypeScript } from 'pgschema-to-ts';

// From a SQL string
const ts = await schemaToTypeScript(sql, {
  generateInsertUpdateTypes: true,
  generateTableConsts: true,
  camelCase: true,
  datesAsStrings: false,
});

// From a file (resolves \i includes relative to the file)
const ts = await schemaFileToTypeScript('./schema/main.sql', { generateInsertUpdateTypes: true });

// Two-step: parse then generate
const schema = await parseSqlSchema(sql);
const ts = generateTypeScript(schema, { interfacePrefix: 'Db' });
```

## Output Example

Given this SQL:

```sql
CREATE TYPE user_role AS ENUM ('admin', 'member');

CREATE TABLE users (
  id        SERIAL PRIMARY KEY,
  email     TEXT NOT NULL,
  role      user_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW()
);
```

Running `pgschema-to-ts schema.sql --helpers --consts` outputs:

```ts
export type UserRole = 'admin' | 'member';

export interface Users {
  id: number;
  email: string;
  role: UserRole | null;
  joined_at: Date | null;
}

export interface UsersInsert {
  id?: number;
  email: string;
  role?: UserRole | null;
  joined_at?: Date | null;
}

export type UsersUpdate = Partial<UsersInsert>;

export const users = {
  tableName: 'users',
  columns: ['id', 'email', 'role', 'joined_at'] as const,
  requiredForInsert: ['email'] as const,
} as const;
```

## Schema Qualification

Objects in the `public` schema (or unqualified) get no prefix. All other schemas are prefixed in PascalCase:

```sql
CREATE TABLE public.products ( … );  -- → interface Products
CREATE TABLE auth.users      ( … );  -- → interface AuthUsers
CREATE TYPE  auth.token_kind AS ENUM (…); -- → type AuthTokenKind
```

## Modular Schema Files

```sql
-- main.sql
\i tables/users.sql
\i tables/orders.sql
\include enums/status.sql
```

Pass the entry file — all includes are resolved recursively relative to the file's directory.
