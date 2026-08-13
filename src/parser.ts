import { parse } from 'libpg-query';
import type { ColumnSchema, CompositeTypeSchema, EnumSchema, ParsedSchema, TableSchema } from './types.js';

function parseColumnDef(colDef: any): ColumnSchema {
  const colName = colDef.colname;
  let typeName = 'text';
  let isArray = false;

  if (colDef.typeName?.names) {
    const names: string[] = colDef.typeName.names.map(
      (n: any) => n.String?.sval || n.str || ''
    ).filter(Boolean);

    if (names.length > 0 && names[names.length - 1]) {
      typeName = names[names.length - 1]!;
    }
  }

  if (colDef.typeName?.arrayBounds && colDef.typeName.arrayBounds.length > 0) {
    isArray = true;
  }

  let isNullable = true;
  let hasDefault = false;
  let isPrimaryKey = false;

  const lowerType = typeName.toLowerCase();
  if (
    lowerType === 'serial' ||
    lowerType === 'serial4' ||
    lowerType === 'bigserial' ||
    lowerType === 'serial8' ||
    lowerType === 'smallserial' ||
    lowerType === 'serial2'
  ) {
    hasDefault = true;
    isNullable = false;
  }

  if (colDef.constraints) {
    for (const c of colDef.constraints) {
      const constraint = c.Constraint;
      if (!constraint) continue;

      if (constraint.contype === 'CONSTR_NOTNULL') {
        isNullable = false;
      } else if (constraint.contype === 'CONSTR_PRIMARY') {
        isPrimaryKey = true;
        isNullable = false;
      } else if (constraint.contype === 'CONSTR_DEFAULT') {
        hasDefault = true;
      }
    }
  }

  return {
    name: colName,
    type: typeName,
    isNullable,
    hasDefault,
    isArray,
    isPrimaryKey,
  };
}

function handleCreateTable(createStmt: any): TableSchema | null {
  const tableName = createStmt.relation?.relname;
  if (!tableName) return null;

  const columns: ColumnSchema[] = [];
  const tableLevelPrimaryKeys = new Set<string>();

  if (createStmt.tableElts) {
    // First pass: collect table-level primary key constraints
    for (const elt of createStmt.tableElts) {
      if (elt.Constraint && elt.Constraint.contype === 'CONSTR_PRIMARY') {
        if (Array.isArray(elt.Constraint.keys)) {
          for (const key of elt.Constraint.keys) {
            if (key.String?.sval) {
              tableLevelPrimaryKeys.add(key.String.sval);
            }
          }
        }
      }
    }

    // Second pass: process column definitions
    for (const elt of createStmt.tableElts) {
      if (elt.ColumnDef && typeof elt.ColumnDef.colname === 'string') {
        const column = parseColumnDef(elt.ColumnDef);
        if (tableLevelPrimaryKeys.has(column.name)) {
          column.isPrimaryKey = true;
          column.isNullable = false;
        }
        columns.push(column);
      }
    }
  }

  return { name: tableName, columns };
}

function handleCreateEnum(enumStmt: any): EnumSchema | null {
  const enumNameParts = enumStmt.typeName;
  let enumName = '';
  if (Array.isArray(enumNameParts)) {
    enumName = enumNameParts.map((p: any) => p.String?.sval || '').filter(Boolean).pop() || '';
  }
  if (!enumName) return null;

  const values: string[] = [];
  if (enumStmt.vals) {
    for (const val of enumStmt.vals) {
      if (val.String?.sval) {
        values.push(val.String.sval);
      }
    }
  }

  return { name: enumName, values };
}

function handleCreateComposite(compStmt: any): CompositeTypeSchema | null {
  const typeName = compStmt.typevar?.relname;
  if (!typeName) return null;

  const attributes: ColumnSchema[] = [];
  if (compStmt.coldeflist) {
    for (const elt of compStmt.coldeflist) {
      if (elt.ColumnDef && typeof elt.ColumnDef.colname === 'string') {
        attributes.push(parseColumnDef(elt.ColumnDef));
      }
    }
  }

  return { name: typeName, attributes };
}

export async function parseSqlSchema(sql: string): Promise<ParsedSchema> {
  const result = await parse(sql);
  const tables: TableSchema[] = [];
  const enums: EnumSchema[] = [];
  const compositeTypes: CompositeTypeSchema[] = [];

  if (!result || !result.stmts) {
    return { tables, enums, compositeTypes };
  }

  for (const rawStmt of result.stmts) {
    const stmt = rawStmt.stmt;
    if (!stmt) continue;

    if (stmt.CreateStmt) {
      const table = handleCreateTable(stmt.CreateStmt);
      if (table) tables.push(table);
    } else if (stmt.CreateEnumStmt) {
      const enumDef = handleCreateEnum(stmt.CreateEnumStmt);
      if (enumDef) enums.push(enumDef);
    } else if (stmt.CompositeTypeStmt) {
      const compDef = handleCreateComposite(stmt.CompositeTypeStmt);
      if (compDef) compositeTypes.push(compDef);
    }
  }

  return { tables, enums, compositeTypes };
}
