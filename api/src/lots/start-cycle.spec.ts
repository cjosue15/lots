import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LotsService } from './lots.service.js';

const engineer = { id: 'u1', role: 'employee' } as AuthUser;
const active = {
  id: 'c1',
  number: 1,
  status: 'ACTIVE',
  startDate: new Date('2026-11-01T00:00:00Z'),
};

function setup(laterLog: { id: string } | null) {
  const tx = {
    lot: { findUnique: vi.fn().mockResolvedValue({ id: 'l1', active: true }) },
    cycle: {
      findFirst: vi.fn().mockResolvedValue(active),
      update: vi.fn(),
      create: vi.fn(),
    },
    actionLog: { findFirst: vi.fn().mockResolvedValue(laterLog) },
  };
  const prisma = {
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new LotsService(prisma as unknown as PrismaService);
  vi.spyOn(service, 'findOne').mockResolvedValue({} as never);
  return { tx, service };
}

describe('LotsService.startCycle with a start date', () => {
  it('closes the active cycle on the chosen day and opens the next one', async () => {
    const { tx, service } = setup(null);
    await service.startCycle('l1', '2026-11-10', engineer);

    expect(tx.cycle.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'CLOSED', endDate: new Date('2026-11-10T00:00:00Z') },
    });
    expect(tx.cycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 2,
        startDate: new Date('2026-11-10T00:00:00Z'),
      }),
    });
  });

  it('rejects a day before a log of the closing cycle', async () => {
    const { tx, service } = setup({ id: 'log1' });
    await expect(
      service.startCycle('l1', '2026-11-10', engineer),
    ).rejects.toThrow(
      new BadRequestException(
        'El ciclo 1 tiene registros después de esa fecha',
      ),
    );
    expect(tx.cycle.update).not.toHaveBeenCalled();
  });

  it('rejects a future day', async () => {
    const { service } = setup(null);
    await expect(
      service.startCycle('l1', '2999-01-01', engineer),
    ).rejects.toThrow('La fecha de inicio no puede ser posterior a hoy');
  });
});
