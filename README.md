# pgschema-to-ts

Generate TypeScript interfaces directly from PostgreSQL DDL SQL files without database connections using [`libpg-query`](https://www.npmjs.com/package/libpg-query).

## Features

- **Offline SQL DDL Parsing**: No live Postgres database required.
- **Modular Schema Files**: Supports `psql` inclusion directives (`\i relative/path.sql` or `\include file.sql`) to resolve modular multi-file schemas.
- **Supports**: `CREATE TABLE`, `CREATE TYPE ... AS ENUM`, and composite types (`CREATE TYPE ... AS (...)`).
- **Rich Type Mapping**: Native Postgres types, arrays, defaults, nullability, and optional Insert/Update helper types.
- **CLI & Programmatic API**.

## Quick Start

### Installation

```bash
npm install -g pgschema-to-ts
# or locally
npm install -D pgschema-to-ts
```

### CLI Usage

```bash
# Convert a SQL schema file to TypeScript
pgschema-to-ts schema.sql -o schema.ts --helpers
# or with -f flag
pgschema-to-ts -f schema.sql -o schema.ts
```

#### CLI Options
- `-f, --file <path>`: Input SQL schema file path
- `-o, --output <path>`: Output TypeScript file path (defaults to stdout)
- `-p, --prefix <string>`: Interface name prefix
- `-s, --suffix <string>`: Interface name suffix
- `--helpers`: Generate `Insert` and `Update` helper types

### Programmatic Usage

```ts
import { schemaToTypeScript } from 'pgschema-to-ts';

const sql = `
  CREATE TYPE user_role AS ENUM ('admin', 'member');
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    role user_role DEFAULT 'member'
  );
`;

const ts = await schemaToTypeScript(sql, { generateInsertUpdateTypes: true });
console.log(ts);
```

### Output Example

```ts
export type UserRole = 'admin' | 'member';

export interface Users {
  id: number;
  email: string;
  role: UserRole | null;
}

export interface UsersInsert {
  id?: number;
  email: string;
  role?: UserRole | null;
}

export type UsersUpdate = Partial<UsersInsert>;
```
