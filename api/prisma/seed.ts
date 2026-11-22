import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DetailType, PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const { NONE, APPLICATION, IRRIGATION, PEST_CHECK, FERTILIZER_EVAL } =
  DetailType;

type ActionSeed = [name: string, detailType: DetailType];

const GREENHOUSES: [name: string, lots: number][] = [
  ['El Dorado', 3],
  ['Bungalows', 12],
  ['Carmen Alto', 9],
];

const PHASES: [name: string, actions: ActionSeed[]][] = [
  [
    'Limpieza del campo',
    [
      ['Recoger el plástico mulch', NONE],
      ['Recoger las cintas de riego por goteo', NONE],
    ],
  ],
  [
    'Preparación del suelo',
    [
      ['Poner guano en líneas y camellones', NONE],
      ['Remover la tierra y mezclar el guano', NONE],
      ['Hacer huecos en la línea e incorporar la broza', NONE],
      ['Tapar los huecos con 15 cm de tierra', NONE],
    ],
  ],
  [
    'Instalación',
    [
      ['Instalar la cinta de riego con goteros', NONE],
      ['Colocar el plástico mulch', NONE],
      ['Aplicar nematicida por riego', APPLICATION],
    ],
  ],
  ['Descomposición', [['Regar con agua interdiario', IRRIGATION]]],
  [
    'Plantines',
    [
      ['Recibir los plantines', NONE],
      ['Trasplantar', NONE],
      ['Aplicar fungicida y enraizante', APPLICATION],
      ['Aplicar la segunda fertilización', APPLICATION],
    ],
  ],
  [
    'Crecimiento',
    [
      ['Iniciar el tutorado', NONE],
      ['Limpiar la planta', NONE],
    ],
  ],
  [
    'Producción',
    [
      ['Aplicar fertilizante de producción', APPLICATION],
      ['Evaluar fertilizantes', FERTILIZER_EVAL],
      ['Iniciar la cosecha', NONE],
      ['Controlar desperfectos', NONE],
    ],
  ],
  [
    'Cierre del ciclo',
    [
      ['Aplicar nematicida por riego', APPLICATION],
      ['Arrancar la planta de raíz', NONE],
      ['Cortar la raíz y botarla', NONE],
      ['Dejar secar la planta', NONE],
      ['Bajar la planta al suelo y retirar pepinillos amarillos', NONE],
    ],
  ],
];

const GENERAL_ACTIONS: ActionSeed[] = [
  ['Revisión de plagas y enfermedades', PEST_CHECK],
  ['Aplicar químico', APPLICATION],
  ['Fungicida y enraizante', APPLICATION],
  ['Foliares', APPLICATION],
  ['Riego y registro de humedad', IRRIGATION],
  ['Control de calidad', NONE],
];

/** Creates the action only if it does not exist yet (phaseId can be null, so no upsert). */
async function ensureAction(
  phaseId: string | null,
  [name, detailType]: ActionSeed,
  order: number,
) {
  const existing = await prisma.action.findFirst({ where: { phaseId, name } });
  if (!existing) {
    await prisma.action.create({ data: { phaseId, name, order, detailType } });
  }
}

async function main() {
  for (const [name, lotCount] of GREENHOUSES) {
    const greenhouse = await prisma.greenhouse.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    for (let number = 1; number <= lotCount; number++) {
      await prisma.lot.upsert({
        where: { greenhouseId_number: { greenhouseId: greenhouse.id, number } },
        update: {},
        create: { greenhouseId: greenhouse.id, number },
      });
    }
  }

  for (const [index, [name, actions]] of PHASES.entries()) {
    const phase = await prisma.phase.upsert({
      where: { order: index + 1 },
      update: { name },
      create: { order: index + 1, name },
    });
    for (const [i, action] of actions.entries()) {
      await ensureAction(phase.id, action, i + 1);
    }
  }

  for (const [i, action] of GENERAL_ACTIONS.entries()) {
    await ensureAction(null, action, i + 1);
  }

  console.log('Seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
