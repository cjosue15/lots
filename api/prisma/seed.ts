import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DetailType, PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const { NONE, APPLICATION, IRRIGATION, PEST_CHECK, FERTILIZER_EVAL } =
  DetailType;

/** `code` links the action to its 3D animation (web farm-map/scene/workers). */
type ActionSeed = [code: string, name: string, detailType: DetailType];

const GREENHOUSES: [name: string, lots: number][] = [
  ['El Dorado', 3],
  ['Bungalows', 12],
  ['Carmen Alto', 9],
];

const PHASES: [name: string, actions: ActionSeed[]][] = [
  [
    'Limpieza del campo',
    [
      ['recoger-mulch', 'Recoger el plástico mulch', NONE],
      ['recoger-cintas', 'Recoger las cintas de riego por goteo', NONE],
    ],
  ],
  [
    'Preparación del suelo',
    [
      ['poner-guano', 'Poner guano en líneas y camellones', NONE],
      ['remover-tierra', 'Remover la tierra y mezclar el guano', NONE],
      ['hacer-huecos', 'Hacer huecos en la línea e incorporar la broza', NONE],
      ['tapar-huecos', 'Tapar los huecos con 15 cm de tierra', NONE],
    ],
  ],
  [
    'Instalación',
    [
      ['instalar-cinta', 'Instalar la cinta de riego con goteros', NONE],
      ['colocar-mulch', 'Colocar el plástico mulch', NONE],
      ['nematicida-instalacion', 'Aplicar nematicida por riego', APPLICATION],
    ],
  ],
  [
    'Descomposición',
    [['regar-interdiario', 'Regar con agua interdiario', IRRIGATION]],
  ],
  [
    'Plantines',
    [
      ['recibir-plantines', 'Recibir los plantines', NONE],
      ['trasplantar', 'Trasplantar', NONE],
      ['fungicida-enraizante', 'Aplicar fungicida y enraizante', APPLICATION],
      [
        'segunda-fertilizacion',
        'Aplicar la segunda fertilización',
        APPLICATION,
      ],
    ],
  ],
  [
    'Crecimiento',
    [
      ['iniciar-tutorado', 'Iniciar el tutorado', NONE],
      ['limpiar-planta', 'Limpiar la planta', NONE],
    ],
  ],
  [
    'Producción',
    [
      [
        'fertilizante-produccion',
        'Aplicar fertilizante de producción',
        APPLICATION,
      ],
      ['evaluar-fertilizantes', 'Evaluar fertilizantes', FERTILIZER_EVAL],
      ['cosecha', 'Iniciar la cosecha', NONE],
      ['controlar-desperfectos', 'Controlar desperfectos', NONE],
    ],
  ],
  [
    'Cierre del ciclo',
    [
      ['nematicida-cierre', 'Aplicar nematicida por riego', APPLICATION],
      ['arrancar-planta', 'Arrancar la planta de raíz', NONE],
      ['cortar-raiz', 'Cortar la raíz y botarla', NONE],
      ['secar-planta', 'Dejar secar la planta', NONE],
      [
        'bajar-planta',
        'Bajar la planta al suelo y retirar pepinillos amarillos',
        NONE,
      ],
    ],
  ],
];

const GENERAL_ACTIONS: ActionSeed[] = [
  ['revision-plagas', 'Revisión de plagas y enfermedades', PEST_CHECK],
  ['aplicar-quimico', 'Aplicar químico', APPLICATION],
  ['fungicida-general', 'Fungicida y enraizante', APPLICATION],
  ['foliares', 'Foliares', APPLICATION],
  ['riego-humedad', 'Riego y registro de humedad', IRRIGATION],
  ['control-calidad', 'Control de calidad', NONE],
];

/**
 * Creates the action if it does not exist yet (phaseId can be null, so no
 * upsert); an existing one only gets its code.
 */
async function ensureAction(
  phaseId: string | null,
  [code, name, detailType]: ActionSeed,
  order: number,
) {
  const existing = await prisma.action.findFirst({ where: { phaseId, name } });
  if (existing) {
    await prisma.action.update({ where: { id: existing.id }, data: { code } });
  } else {
    await prisma.action.create({
      data: { phaseId, name, code, order, detailType },
    });
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
