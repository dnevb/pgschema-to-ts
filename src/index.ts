import { readFile } from 'node:fs/promises';
import { parseSqlSchema } from './parser.js';
import { generateTypeScript } from './generator.js';
import { resolveSqlIncludes } from './resolver.js';
import type { GeneratorOptions } from './types.js';

export type { ColumnSchema, CompositeTypeSchema, EnumSchema, GeneratorOptions, ParsedSchema, TableSchema } from './types.js';
export { parseSqlSchema } from './parser.js';
export { generateTypeScript } from './generator.js';
export { resolveSqlIncludes } from './resolver.js';

export async function schemaToTypeScript(
  sql: string,
  options?: GeneratorOptions
): Promise<string> {
  const resolvedSql = await resolveSqlIncludes(sql, {
    baseDir: options?.baseDir,
    filePath: options?.filePath,
  });
  const schema = await parseSqlSchema(resolvedSql);
  return generateTypeScript(schema, options);
}

export async function schemaFileToTypeScript(
  filePath: string,
  options?: GeneratorOptions
): Promise<string> {
  const sql = await readFile(filePath, 'utf-8');
  return schemaToTypeScript(sql, {
    ...options,
    filePath,
  });
}
