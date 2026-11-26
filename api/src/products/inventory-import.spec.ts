import { describe, expect, it } from 'vitest';
import {
  checkInventory,
  parseCsv,
  parseInventory,
} from './inventory-import.js';

const HEADER =
  'Invernadero,Producto,Categoría,Unidad,Cantidad,Costo unitario,Stock mínimo';

const context = {
  greenhouses: ['El Dorado', 'Bungalows', 'Carmen Alto'],
  categories: ['Químico', 'Fertilizante'],
  products: [
    { name: 'Filter', category: 'Químico', unit: 'L' as const },
    { name: 'Sulfato', category: 'Químico', unit: 'KG' as const },
  ],
};

function rowsOf(text: string) {
  const result = parseInventory(text);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.rows;
}

function errorsOf(text: string) {
  const result = parseInventory(text);
  return result.ok ? [] : result.errors;
}

describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes and skips blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2\n')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['x, y', 'say "hi"'] },
      { line: 4, fields: ['1', '2'] },
    ]);
  });

  it('uses semicolons when the header does', () => {
    expect(parseCsv('a;b\n1,5;2')[1].fields).toEqual(['1,5', '2']);
  });
});

describe('parseInventory', () => {
  it('reads each row, with units and decimals written either way', () => {
    const rows = rowsOf(
      `﻿${HEADER}\nCarmen Alto,Bayfolan,Fertilizante,lt,10,25.50,2\nBungalows,Bayfolan,Fertilizante,L,"0,5",24,\n`,
    );
    expect(rows).toEqual([
      {
        line: 2,
        greenhouse: 'Carmen Alto',
        product: 'Bayfolan',
        category: 'Fertilizante',
        unit: 'L',
        quantity: 10,
        unitCost: 25.5,
        minStock: 2,
      },
      expect.objectContaining({
        line: 3,
        quantity: 0.5,
        unitCost: 24,
        minStock: 0,
      }),
    ]);
  });

  it('accepts headers in any order, case or accents', () => {
    const rows = rowsOf(
      'stock minimo;costo unitario;cantidad;unidad;categoria;producto;INVERNADERO\n1;30;4;KG;Químico;Sulfato;El Dorado',
    );
    expect(rows[0]).toMatchObject({
      greenhouse: 'El Dorado',
      unit: 'KG',
      minStock: 1,
    });
  });

  it('names the missing columns', () => {
    expect(errorsOf('Invernadero,Producto\nEl Dorado,Filter')[0]).toMatch(
      /Faltan columnas: categoria, unidad, cantidad, costo unitario, stock minimo/,
    );
  });

  it('reports every bad row with its line', () => {
    expect(
      errorsOf(
        `${HEADER}\n,Filter,Químico,ML,-1,0,x\nEl Dorado,Filter,Químico,L,1,30,0`,
      ),
    ).toEqual([
      'Fila 2: falta el invernadero; unidad "ML" no válida (usa L, KG o G); la cantidad debe ser un número de 0 o más; el costo unitario debe ser un número mayor que 0; el stock mínimo debe ser un número de 0 o más (o vacío)',
    ]);
  });

  it('rejects a product twice in a greenhouse', () => {
    expect(
      errorsOf(
        `${HEADER}\nEl Dorado,Filter,Químico,L,1,30,0\nEl Dorado,Filter,Químico,L,2,30,0`,
      ),
    ).toContain('Fila 3: Filter en El Dorado ya está en la fila 2');
  });

  it('keeps one unit, category and spelling per product across greenhouses', () => {
    const errors = errorsOf(
      `${HEADER}\nEl Dorado,Filter,Químico,L,1,30,0\nBungalows,Filter,Fertilizante,KG,1,30,0\nCarmen Alto,FILTER,Químico,L,1,30,0`,
    );
    expect(errors).toEqual([
      'Fila 3: Filter está en KG y en la fila 2 en L; un producto tiene una sola unidad',
      'Fila 3: Filter es "Fertilizante" y en la fila 2 "Químico"; un producto tiene una sola categoría',
      'Fila 4: "FILTER" está escrito distinto en la fila 2 ("Filter"); escríbelo igual en todas las filas',
    ]);
  });

  it('keeps the readable rows and sorts the errors by row', () => {
    const result = parseInventory(
      `${HEADER}\nEl Dorado,Filter,Químico,L,1,30,0\nEl Dorado,Filter,Químico,L,2,30,0\nBungalows,Urea,Químico,ML,1,5,0`,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        'Fila 3: Filter en El Dorado ya está en la fila 2',
        'Fila 4: unidad "ML" no válida (usa L, KG o G)',
      ],
      rows: [
        expect.objectContaining({ line: 2 }),
        expect.objectContaining({ line: 3 }),
      ],
    });
  });

  it('fails on an empty file or a table without rows', () => {
    expect(errorsOf('')).toEqual(['El archivo está vacío']);
    expect(errorsOf(HEADER)).toEqual(['La tabla no tiene filas']);
  });
});

describe('checkInventory', () => {
  it('accepts new products and categories', () => {
    const rows = rowsOf(`${HEADER}\nBungalows,Bayfolan,Foliares,L,1,30,0`);
    expect(checkInventory(rows, context)).toEqual([]);
  });

  it('needs the exact greenhouse name, suggesting the close one', () => {
    const rows = rowsOf(
      `${HEADER}\nCarmen alto,Filter,Químico,L,1,30,0\nLa Joya,Filter,Químico,L,1,30,0`,
    );
    expect(checkInventory(rows, context)).toEqual([
      'Fila 2: el invernadero "Carmen alto" no existe; ¿quisiste decir "Carmen Alto"?',
      'Fila 3: el invernadero "La Joya" no existe (usa "El Dorado", "Bungalows", "Carmen Alto")',
    ]);
  });

  it('keeps existing products as they are and avoids near-duplicates', () => {
    const rows = rowsOf(
      `${HEADER}\nEl Dorado,Sulfato,Fertilizante,L,1,30,0\nBungalows,filter,Químico,L,1,30,0\nBungalows,Urea,quimico,KG,1,30,0`,
    );
    expect(checkInventory(rows, context)).toEqual([
      'Fila 2: Sulfato ya existe en KG, no en L',
      'Fila 2: Sulfato ya existe en la categoría "Químico", no en "Fertilizante"',
      'Fila 3: ya existe el producto "Filter"; escríbelo igual (aquí dice "filter")',
      'Fila 4: ya existe la categoría "Químico"; escríbela igual (aquí dice "quimico")',
    ]);
  });
});
