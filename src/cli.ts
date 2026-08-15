#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { schemaFileToTypeScript } from './index.js';

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      file:         { type: 'string',  short: 'f' },
      output:       { type: 'string',  short: 'o' },
      prefix:       { type: 'string',  short: 'p' },
      suffix:       { type: 'string',  short: 's' },
      helpers:      { type: 'boolean', default: false },
      consts:       { type: 'boolean', default: false },
      'camel-case': { type: 'boolean', default: false },
      'dates-as-strings': { type: 'boolean', default: false },
      help:         { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help || !positionals.length) {
    console.log(`
pgschema-to-ts - Generate TypeScript interfaces from PostgreSQL DDL files (no DB connection)

Usage:
  pgschema-to-ts schema.sql [options]
  pgschema-to-ts -f schema.sql -o schema.ts

Options:
  -f, --file <path>       Input SQL file path
  -o, --output <path>     Output TypeScript file path (defaults to stdout)
  -p, --prefix <string>   Prefix for generated interface/type names
  -s, --suffix <string>   Suffix for generated interface/type names
  --helpers               Generate Insert and Update helper types per table
  --consts                Generate runtime const per table (tableName, columns, requiredForInsert)
  --camel-case            Rename snake_case column properties to camelCase in output
  --dates-as-strings      Map date/timestamp columns to string instead of Date
  -h, --help              Show help
`);
    process.exit(0);
  }

  let filePath = '';

  if (values.file) {
    filePath = values.file;
  } else if (positionals.length > 0 && positionals[0]) {
    filePath = positionals[0];
  } else {
    console.error('Error: Please specify a SQL input file path.');
    process.exit(1);
  }

  const result = await schemaFileToTypeScript(filePath, {
    filePath,
    interfacePrefix: values.prefix,
    interfaceSuffix: values.suffix,
    generateInsertUpdateTypes: values.helpers,
    generateTableConsts: values.consts,
    camelCase: values['camel-case'],
    datesAsStrings: values['dates-as-strings'],
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
