import { parse } from 'libpg-query';
import type { ColumnSchema, CompositeTypeSchema, DomainSchema, EnumSchema, ParsedSchema, TableSchema, ViewSchema } from './types.js';

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

  return { name: colName, type: typeName, isNullable, hasDefault, isArray, isPrimaryKey };
}

// Extracts the local object name from a RangeVar (relation) or names array.
function getObjectName(namesOrRel: any): string {
  if (!namesOrRel) return '';
  if (namesOrRel.relname) return namesOrRel.relname;
  if (Array.isArray(namesOrRel)) {
    const parts = namesOrRel.map((p: any) => p.String?.sval || '').filter(Boolean);
    return parts.pop() || '';
  }
  return '';
}

// Extracts the schema name from a RangeVar or qualified names array.
// Returns undefined for unqualified or public-schema objects.
function getSchemaName(namesOrRel: any): string | undefined {
  if (!namesOrRel) return undefined;

  if (namesOrRel.schemaname) {
    const s = namesOrRel.schemaname;
    return s === 'public' ? undefined : s;
  }

  if (Array.isArray(namesOrRel) && namesOrRel.length >= 2) {
    const parts = namesOrRel.map((p: any) => p.String?.sval || '').filter(Boolean);
    if (parts.length >= 2) {
      const schema = parts[parts.length - 2]!;
      return schema === 'public' || schema === 'pg_catalog' ? undefined : schema;
    }
  }

  return undefined;
}

function handleCreateTable(createStmt: any): TableSchema | null {
  const tableName = getObjectName(createStmt.relation);
  if (!tableName) return null;
  const schema = getSchemaName(createStmt.relation);

  const columns: ColumnSchema[] = [];
  const tableLevelPrimaryKeys = new Set<string>();

  if (createStmt.tableElts) {
    for (const elt of createStmt.tableElts) {
      if (elt.Constraint && elt.Constraint.contype === 'CONSTR_PRIMARY') {
        if (Array.isArray(elt.Constraint.keys)) {
          for (const key of elt.Constraint.keys) {
            if (key.String?.sval) tableLevelPrimaryKeys.add(key.String.sval);
          }
        }
      }
    }

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

  return { name: tableName, schema, columns };
}

function handleCreateEnum(enumStmt: any): EnumSchema | null {
  const enumName = getObjectName(enumStmt.typeName);
  if (!enumName) return null;
  const schema = getSchemaName(enumStmt.typeName);

  const values: string[] = [];
  if (enumStmt.vals) {
    for (const val of enumStmt.vals) {
      if (val.String?.sval) values.push(val.String.sval);
    }
  }

  return { name: enumName, schema, values };
}

function handleCreateComposite(compStmt: any): CompositeTypeSchema | null {
  const typeName = getObjectName(compStmt.typevar);
  if (!typeName) return null;
  const schema = getSchemaName(compStmt.typevar);

  const attributes: ColumnSchema[] = [];
  if (compStmt.coldeflist) {
    for (const elt of compStmt.coldeflist) {
      if (elt.ColumnDef && typeof elt.ColumnDef.colname === 'string') {
        attributes.push(parseColumnDef(elt.ColumnDef));
      }
    }
  }

  return { name: typeName, schema, attributes };
}

function handleCreateDomain(domainStmt: any): DomainSchema | null {
  const domainName = getObjectName(domainStmt.domainname);
  if (!domainName) return null;
  const schema = getSchemaName(domainStmt.domainname);

  let baseType = 'text';
  let isArray = false;

  if (domainStmt.typeName?.names) {
    const names: string[] = domainStmt.typeName.names.map(
      (n: any) => n.String?.sval || ''
    ).filter(Boolean);
    if (names.length > 0 && names[names.length - 1]) {
      baseType = names[names.length - 1]!;
    }
  }

  if (domainStmt.typeName?.arrayBounds && domainStmt.typeName.arrayBounds.length > 0) {
    isArray = true;
  }

  return { name: domainName, schema, baseType, isArray };
}

function handleCreateView(viewStmt: any, tables: TableSchema[] = []): ViewSchema | null {
  const viewName = getObjectName(viewStmt.view);
  if (!viewName) return null;
  const schema = getSchemaName(viewStmt.view);

  const columns: ColumnSchema[] = [];
  const targetList = viewStmt.query?.SelectStmt?.targetList;

  const knownColumnTypes = new Map<string, { type: string; isArray: boolean }>();
  for (const table of tables) {
    for (const col of table.columns) {
      if (!knownColumnTypes.has(col.name)) {
        knownColumnTypes.set(col.name, { type: col.type, isArray: col.isArray });
      }
    }
  }

  if (Array.isArray(targetList)) {
    for (const target of targetList) {
      const res = target.ResTarget;
      if (!res) continue;

      let colName = res.name;
      if (!colName && res.val?.ColumnRef?.fields) {
        const fields = res.val.ColumnRef.fields;
        const lastField = fields[fields.length - 1];
        colName = lastField?.String?.sval || '';
      }

      if (colName) {
        const known = knownColumnTypes.get(colName);
        columns.push({
          name: colName,
          type: known ? known.type : 'text',
          isNullable: true,
          hasDefault: false,
          isArray: known ? known.isArray : false,
          isPrimaryKey: false,
        });
      }
    }
  }

  return { name: viewName, schema, columns };
}

export async function parseSqlSchema(sql: string): Promise<ParsedSchema> {
  const result = await parse(sql);
  const tables: TableSchema[] = [];
  const enums: EnumSchema[] = [];
  const compositeTypes: CompositeTypeSchema[] = [];
  const domains: DomainSchema[] = [];
  const views: ViewSchema[] = [];

  if (!result || !result.stmts) {
    return { tables, enums, compositeTypes, domains, views };
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
    } else if (stmt.CreateDomainStmt) {
      const domainDef = handleCreateDomain(stmt.CreateDomainStmt);
      if (domainDef) domains.push(domainDef);
    } else if (stmt.ViewStmt) {
      const viewDef = handleCreateView(stmt.ViewStmt, tables);
      if (viewDef) views.push(viewDef);
    }
  }

  return { tables, enums, compositeTypes, domains, views };
}
