/**
 * Production seed: the initial inventory counted at go-live (PLAN §14,
 * "Puesta en marcha"). Run it once:
 *
 *   pnpm db:seed:inventory <archivo.csv> <fecha YYYY-MM-DD> <email del admin>
 *
 * It checks the whole table first and writes nothing if any row is wrong.
 * Then, in one transaction, it creates the missing categories and products,
 * each product's minimum in each greenhouse and one INITIAL movement per row.
 * It refuses to run when INITIAL movements already exist.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  StockMovementType,
} from '../src/generated/prisma/client.js';
import { todayInPeru, toDbDate } from '../src/common/peru-date.js';
import {
  byLine,
  checkInventory,
  parseInventory,
} from '../src/products/inventory-import.js';
import { STOCK_UNITS, type StockUnit } from '../src/products/units.js';

const USAGE =
  'Uso: pnpm db:seed:inventory <archivo.csv> <fecha YYYY-MM-DD> <email del admin>';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

/** Stops with the messages, writing nothing. */
class Abort extends Error {
  constructor(readonly messages: string[]) {
    super(messages.join('\n'));
  }
}

async function main(): Promise<void> {
  const [file, date, email] = process.argv.slice(2);
  if (!file || !date || !email) throw new Abort([USAGE]);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(toDbDate(date).getTime())
  ) {
    throw new Abort([`La fecha "${date}" no es válida; usa YYYY-MM-DD`, USAGE]);
  }
  if (date > todayInPeru())
    throw new Abort(['La fecha del conteo no puede ser posterior a hoy']);

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Abort([`No se pudo leer el archivo ${file}`]);
  }
  const parsed = parseInventory(text);
  // Without readable rows (bad header, empty table) there is nothing to check further.
  if (!parsed.ok && !parsed.rows.length) throw new Abort(parsed.errors);
  const { rows } = parsed;

  const [initials, admin, greenhouses, categories, products] =
    await Promise.all([
      prisma.stockMovement.count({
        where: { type: StockMovementType.INITIAL },
      }),
      prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      }),
      prisma.greenhouse.findMany({ select: { id: true, name: true } }),
      prisma.productCategory.findMany({ select: { id: true, name: true } }),
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          unit: true,
          category: { select: { name: true } },
        },
      }),
    ]);
  if (initials) {
    throw new Abort([
      `Ya hay ${initials} movimientos de inventario inicial: el seed solo se ejecuta una vez`,
    ]);
  }
  if (!admin) {
    throw new Abort([
      `No existe el usuario ${email}: debe entrar una vez a la web antes de ejecutar el seed`,
    ]);
  }

  const dbErrors = checkInventory(rows, {
    greenhouses: greenhouses.map((g) => g.name),
    categories: categories.map((c) => c.name),
    products: products
      .filter((p): p is typeof p & { unit: StockUnit } =>
        (STOCK_UNITS as readonly string[]).includes(p.unit),
      )
      .map((p) => ({ name: p.name, category: p.category.name, unit: p.unit })),
  });
  const errors = byLine([...(parsed.ok ? [] : parsed.errors), ...dbErrors]);
  if (errors.length) throw new Abort(errors);

  const greenhouseIds = new Map(greenhouses.map((g) => [g.name, g.id]));
  const categoryIds = new Map(categories.map((c) => [c.name, c.id]));
  const productIds = new Map(products.map((p) => [p.name, p.id]));
  const created = { categories: 0, products: 0 };

  await prisma.$transaction(
    async (tx) => {
      // Checked again inside the transaction, so two runs at once can't both write.
      if (
        await tx.stockMovement.count({
          where: { type: StockMovementType.INITIAL },
        })
      ) {
        throw new Abort(['Otro proceso ya cargó el inventario inicial']);
      }
      for (const row of rows) {
        let categoryId = categoryIds.get(row.category);
        if (!categoryId) {
          categoryId = (
            await tx.productCategory.create({ data: { name: row.category } })
          ).id;
          categoryIds.set(row.category, categoryId);
          created.categories++;
        }
        let productId = productIds.get(row.product);
        if (!productId) {
          productId = (
            await tx.product.create({
              data: { name: row.product, categoryId, unit: row.unit },
            })
          ).id;
          productIds.set(row.product, productId);
          created.products++;
        }
        const greenhouseId = greenhouseIds.get(row.greenhouse)!;
        await tx.productGreenhouse.upsert({
          where: { productId_greenhouseId: { productId, greenhouseId } },
          update: { minStock: row.minStock },
          create: { productId, greenhouseId, minStock: row.minStock },
        });
        await tx.stockMovement.create({
          data: {
            productId,
            greenhouseId,
            type: StockMovementType.INITIAL,
            date: toDbDate(date),
            quantity: row.quantity,
            unitCost: row.unitCost,
            userId: admin.id,
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  console.log(
    `Inventario inicial cargado al ${date}: ${rows.length} filas, ` +
      `nuevos: ${created.products} ${created.products === 1 ? 'producto' : 'productos'} y ` +
      `${created.categories} ${created.categories === 1 ? 'categoría' : 'categorías'}.`,
  );
}

main()
  .catch((error) => {
    if (error instanceof Abort) {
      console.error(
        'No se guardó nada.\n' + error.messages.map((m) => `- ${m}`).join('\n'),
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
