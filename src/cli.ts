#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { schemaFileToTypeScript } from './index.js';

async function main() {
  
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      file: { type: 'string', short: 'f' },
      output: { type: 'string', short: 'o' },
      prefix: { type: 'string', short: 'p' },
      suffix: { type: 'string', short: 's' },
      helpers: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help || !positionals.length) {
    console.log(`
pgschema-to-ts CLI - Generate TypeScript interfaces from PostgreSQL SQL files without DB connection

Usage:
  pgschema-to-ts schema.sql -o schema.ts [options]
  pgschema-to-ts -f schema.sql --helpers

Options:
  -f, --file <path>     Input SQL file path
  -o, --output <path>   Output TypeScript file path (defaults to stdout)
  -p, --prefix <string> Prefix for generated TypeScript interface names
  -s, --suffix <string> Suffix for generated TypeScript interface names
  --helpers             Generate Insert and Update helper types
  -h, --help            Show help
`);
    process.exit(0);
  }

  let filePath = '';

  if (values.file) {
    filePath = values.file;
  } else if (positionals.length > 0 && positionals[0]) {
    filePath = positionals[0];
  } else {
    console.error('Error: Please specify a SQL input file path (e.g. pgschema-to-ts schema.sql or -f schema.sql).');
    process.exit(1);
  }

  const result = await schemaFileToTypeScript(filePath, {
    filePath,
    interfacePrefix: values.prefix,
    interfaceSuffix: values.suffix,
    generateInsertUpdateTypes: values.helpers,
  });

  if (values.output) {
    await writeFile(values.output, result, 'utf-8');
  } else {
    process.stdout.write(result);
  }
}

main().catch((err) => {
  console.error('Error processing schema:', err);
  process.exit(1);
});
