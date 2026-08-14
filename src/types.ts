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
  schema?: string;
  columns: ColumnSchema[];
}

export interface EnumSchema {
  name: string;
  schema?: string;
  values: string[];
}

export interface CompositeTypeSchema {
  name: string;
  schema?: string;
  attributes: ColumnSchema[];
}

export interface DomainSchema {
  name: string;
  schema?: string;
  baseType: string;
  isArray: boolean;
}

export interface ViewSchema {
  name: string;
  schema?: string;
  columns: ColumnSchema[];
}

export interface ParsedSchema {
  tables: TableSchema[];
  enums: EnumSchema[];
  compositeTypes: CompositeTypeSchema[];
  domains: DomainSchema[];
  views: ViewSchema[];
}

export interface GeneratorOptions {
  baseDir?: string;
  filePath?: string;
  interfacePrefix?: string;
  interfaceSuffix?: string;
  customTypeMap?: Record<string, string>;
  generateInsertUpdateTypes?: boolean;
  generateHeaderBanner?: boolean;
}
