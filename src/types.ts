export interface ColumnSchema {
  name: string;
  type: string;
  isNullable: boolean;
  hasDefault: boolean;
  isArray: boolean;
  isPrimaryKey: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

export interface EnumSchema {
  name: string;
  values: string[];
}

export interface CompositeTypeSchema {
  name: string;
  attributes: ColumnSchema[];
}

export interface ParsedSchema {
  tables: TableSchema[];
  enums: EnumSchema[];
  compositeTypes: CompositeTypeSchema[];
}

export interface GeneratorOptions {
  /**
   * Base directory to resolve relative \i or \include directives.
   */
  baseDir?: string;

  /**
   * Path to the root SQL file being processed (used to resolve relative \i directives).
   */
  filePath?: string;

  /**
   * Prefix or suffix for interface names if desired.
   */
  interfacePrefix?: string;
  interfaceSuffix?: string;

  /**
   * Custom mapping from Postgres type names to TypeScript type strings.
   */
  customTypeMap?: Record<string, string>;

  /**
   * Generate Insert / Update helper interfaces.
   */
  generateInsertUpdateTypes?: boolean;

  /**
   * Add auto-generated banner comment at the top of the output file.
   */
  generateHeaderBanner?: boolean;
}
