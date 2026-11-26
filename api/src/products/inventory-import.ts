/**
 * Initial inventory for go-live (PLAN §14, "Puesta en marcha"): parses and
 * checks the counted table before the production seed writes anything. Pure
 * functions; `prisma/seed-inventory.ts` does the reading and the writing.
 */
import { type StockUnit } from './units.js';

/** One counted product in one greenhouse. */
export interface InventoryRow {
  /** Line in the file (the header is line 1), for error messages. */
  line: number;
  greenhouse: string;
  product: string;
  category: string;
  unit: StockUnit;
  quantity: number;
  unitCost: number;
  minStock: number;
}

/** What the database already has, by name. */
export interface InventoryContext {
  greenhouses: string[];
  categories: string[];
  /** Existing products: their category and unit must match the table's. */
  products: { name: string; category: string; unit: StockUnit }[];
}

/**
 * On failure, `rows` still has the rows that could be read, so the database
 * checks can run on them and every problem is reported in one go.
 */
export type ParseResult =
  | { ok: true; rows: InventoryRow[] }
  | { ok: false; errors: string[]; rows: InventoryRow[] };

const COLUMNS = {
  greenhouse: 'invernadero',
  product: 'producto',
  category: 'categoria',
  unit: 'unidad',
  quantity: 'cantidad',
  unitCost: 'costo unitario',
  minStock: 'stock minimo',
} as const;

const UNITS: Record<string, StockUnit> = {
  L: 'L',
  LT: 'L',
  KG: 'KG',
  G: 'G',
  GR: 'G',
};

/**
 * Splits CSV text into records. Commas or semicolons (whichever the header
 * uses, as Excel exports either), double-quoted fields with `""` escapes, and
 * blank lines skipped. Each record keeps its line number.
 */
export function parseCsv(text: string): { line: number; fields: string[] }[] {
  const content = text.replace(/^﻿/, '');
  const header = content.slice(0, content.search(/\r?\n|$/));
  const delimiter =
    (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';

  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;

  const endRecord = () => {
    fields.push(field);
    if (fields.some((f) => f.trim() !== ''))
      records.push({ line: start, fields });
    fields = [];
    field = '';
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++;
      endRecord();
      line++;
      start = line;
    } else {
      field += char;
    }
  }
  endRecord();
  return records;
}

/**
 * Turns the CSV into rows and checks everything that does not need the
 * database: columns, units, numbers, repeated rows and products whose category
 * or unit differ between rows. Every problem is reported at once.
 */
export function parseInventory(text: string): ParseResult {
  const [header, ...records] = parseCsv(text);
  if (!header)
    return { ok: false, errors: ['El archivo está vacío'], rows: [] };

  const names = header.fields.map(normalize);
  const index = {} as Record<keyof typeof COLUMNS, number>;
  const missing: string[] = [];
  for (const [key, column] of Object.entries(COLUMNS) as [
    keyof typeof COLUMNS,
    string,
  ][]) {
    index[key] = names.indexOf(column);
    if (index[key] === -1) missing.push(column);
  }
  if (missing.length) {
    return {
      ok: false,
      errors: [
        `Faltan columnas: ${missing.join(', ')}. Se esperan: Invernadero, Producto, Categoría, Unidad, Cantidad, Costo unitario, Stock mínimo`,
      ],
      rows: [],
    };
  }
  if (!records.length)
    return { ok: false, errors: ['La tabla no tiene filas'], rows: [] };

  const errors: string[] = [];
  const rows: InventoryRow[] = [];
  for (const { line, fields } of records) {
    const cell = (key: keyof typeof COLUMNS) =>
      (fields[index[key]] ?? '').trim();
    const rowErrors: string[] = [];
    const required = (key: keyof typeof COLUMNS, label: string) => {
      const value = cell(key);
      if (!value) rowErrors.push(`falta ${label}`);
      return value;
    };

    const greenhouse = required('greenhouse', 'el invernadero');
    const product = required('product', 'el producto');
    const category = required('category', 'la categoría');
    const unitText = required('unit', 'la unidad');
    const unit = UNITS[unitText.toUpperCase()];
    if (unitText && !unit)
      rowErrors.push(`unidad "${unitText}" no válida (usa L, KG o G)`);

    const quantity = parseNumber(cell('quantity'));
    if (quantity === null || quantity < 0) {
      rowErrors.push('la cantidad debe ser un número de 0 o más');
    }
    const unitCost = parseNumber(cell('unitCost'));
    if (unitCost === null || unitCost <= 0) {
      rowErrors.push('el costo unitario debe ser un número mayor que 0');
    }
    const minText = cell('minStock');
    const minStock = minText ? parseNumber(minText) : 0;
    if (minStock === null || minStock < 0) {
      rowErrors.push('el stock mínimo debe ser un número de 0 o más (o vacío)');
    }

    if (rowErrors.length) {
      errors.push(`Fila ${line}: ${rowErrors.join('; ')}`);
      continue;
    }
    rows.push({
      line,
      greenhouse,
      product,
      category,
      unit,
      quantity: quantity!,
      unitCost: unitCost!,
      minStock: minStock!,
    });
  }

  const seen = new Map<string, number>();
  const firstOf = new Map<string, InventoryRow>();
  for (const row of rows) {
    const key = `${normalize(row.greenhouse)}|${normalize(row.product)}`;
    const repeated = seen.get(key);
    if (repeated) {
      errors.push(
        `Fila ${row.line}: ${row.product} en ${row.greenhouse} ya está en la fila ${repeated}`,
      );
    } else {
      seen.set(key, row.line);
    }

    // Product names are unique: the same name is the same product everywhere.
    const first = firstOf.get(normalize(row.product));
    if (!first) {
      firstOf.set(normalize(row.product), row);
    } else if (first.product !== row.product) {
      errors.push(
        `Fila ${row.line}: "${row.product}" está escrito distinto en la fila ${first.line} ("${first.product}"); escríbelo igual en todas las filas`,
      );
    } else {
      if (first.unit !== row.unit) {
        errors.push(
          `Fila ${row.line}: ${row.product} está en ${row.unit} y en la fila ${first.line} en ${first.unit}; un producto tiene una sola unidad`,
        );
      }
      if (first.category !== row.category) {
        errors.push(
          `Fila ${row.line}: ${row.product} es "${row.category}" y en la fila ${first.line} "${first.category}"; un producto tiene una sola categoría`,
        );
      }
    }
  }

  return errors.length
    ? { ok: false, errors: byLine(errors), rows }
    : { ok: true, rows };
}

/** Sorts "Fila N: …" messages by row, keeping the order within a row. */
export function byLine(errors: string[]): string[] {
  const line = (error: string) => Number(/^Fila (\d+):/.exec(error)?.[1] ?? 0);
  return [...errors].sort((a, b) => line(a) - line(b));
}

/**
 * Checks the rows against the database: greenhouses must exist with that
 * exact name, and products that already exist must keep their unit and
 * category. New categories and products are fine (the seed creates them),
 * unless they only differ from an existing one in accents or capitals.
 */
export function checkInventory(
  rows: InventoryRow[],
  context: InventoryContext,
): string[] {
  const errors: string[] = [];
  const greenhouses = new Set(context.greenhouses);
  const products = new Map(context.products.map((p) => [p.name, p]));
  const productsByNormalized = new Map(
    context.products.map((p) => [normalize(p.name), p]),
  );
  const categories = new Set(context.categories);

  for (const row of rows) {
    if (!greenhouses.has(row.greenhouse)) {
      const close = context.greenhouses.find(
        (g) => normalize(g) === normalize(row.greenhouse),
      );
      errors.push(
        `Fila ${row.line}: el invernadero "${row.greenhouse}" no existe${
          close
            ? `; ¿quisiste decir "${close}"?`
            : ` (usa ${context.greenhouses.map((g) => `"${g}"`).join(', ')})`
        }`,
      );
    }
    if (!categories.has(row.category)) {
      const close = context.categories.find(
        (c) => normalize(c) === normalize(row.category),
      );
      if (close) {
        errors.push(
          `Fila ${row.line}: ya existe la categoría "${close}"; escríbela igual (aquí dice "${row.category}")`,
        );
      }
    }
    const existing = products.get(row.product);
    if (!existing) {
      const close = productsByNormalized.get(normalize(row.product));
      if (close) {
        errors.push(
          `Fila ${row.line}: ya existe el producto "${close.name}"; escríbelo igual (aquí dice "${row.product}")`,
        );
      }
      continue;
    }
    if (existing.unit !== row.unit) {
      errors.push(
        `Fila ${row.line}: ${row.product} ya existe en ${existing.unit}, no en ${row.unit}`,
      );
    }
    if (existing.category !== row.category) {
      errors.push(
        `Fila ${row.line}: ${row.product} ya existe en la categoría "${existing.category}", no en "${row.category}"`,
      );
    }
  }
  return errors;
}

/** "25.50", "25,50" or "1 234,5" → number; null when it is not one. */
function parseNumber(text: string): number | null {
  let value = text.replace(/\s/g, '');
  if (!value) return null;
  if (value.includes(',') && !value.includes('.'))
    value = value.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

/** Lowercase without accents or extra spaces, to compare names and headers. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
