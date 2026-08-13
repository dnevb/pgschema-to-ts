import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface ResolveOptions {
  baseDir?: string;
  filePath?: string;
  visitedFiles?: Set<string>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves psql \i and \include directives recursively in SQL string inputs.
 */
export async function resolveSqlIncludes(sql: string, options: ResolveOptions = {}): Promise<string> {
  const currentBaseDir = options.filePath
    ? dirname(resolve(options.filePath))
    : options.baseDir
    ? resolve(options.baseDir)
    : process.cwd();

  const visited = options.visitedFiles || new Set<string>();

  if (options.filePath) {
    visited.add(resolve(options.filePath));
  }

  const lines = sql.split('\n');
  const resolvedLines: string[] = [];

  // Match \i relative/path.sql or \include relative/path.sql or quotes \i 'path.sql' / "path.sql"
  const includeRegex = /^\s*\\(?:i|include)\s+['"]?([^'"\s;]+)['"]?\s*;?\s*$/i;

  for (const line of lines) {
    const match = line.match(includeRegex);
    if (match && match[1]) {
      const relativePath = match[1];
      const targetFilePath = resolve(currentBaseDir, relativePath);

      if (visited.has(targetFilePath)) {
        // Skip circular includes silently or add warning comment
        resolvedLines.push(`-- Skipped circular include: ${relativePath}`);
        continue;
      }

      if (!(await fileExists(targetFilePath))) {
        throw new Error(`Included SQL file not found: "${targetFilePath}" (referenced as "\\i ${relativePath}")`);
      }

      visited.add(targetFilePath);
      const childSql = await readFile(targetFilePath, 'utf-8');
      const expandedChild = await resolveSqlIncludes(childSql, {
        baseDir: dirname(targetFilePath),
        filePath: targetFilePath,
        visitedFiles: visited,
      });

      resolvedLines.push(`-- Included from: ${relativePath}`);
      resolvedLines.push(expandedChild);
    } else {
      resolvedLines.push(line);
    }
  }

  return resolvedLines.join('\n');
}
