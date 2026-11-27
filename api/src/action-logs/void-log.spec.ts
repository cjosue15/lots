import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProductsService } from '../products/products.service.js';
import { ActionLogsService } from './action-logs.service.js';

const engineer = { id: 'u1', role: 'employee' } as AuthUser;
const admin = { id: 'a1', role: 'admin' } as AuthUser;

const voidedRow = (voidedBy: { id: string; displayName: string }) => ({
  id: 'log1',
  cycleId: 'c1',
  actionId: 'x',
  name: 'Iniciar la cosecha',
  date: new Date('2026-11-20T00:00:00Z'),
  details: null,
  notes: null,
  products: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  phase: { id: 'p8', order: 8, name: 'Producción' },
  action: { detailType: 'NONE' },
  user: { id: 'u1', displayName: 'Ana' },
  voidedAt: new Date('2026-11-27T15:00:00Z'),
  voidReason: 'Lote equivocado',
  voidedBy,
  _count: { changes: 0 },
});

function setup(log: { userId: string; voidedAt: Date | null } | null) {
  const prisma = {
    actionLog: {
      findUnique: vi.fn().mockResolvedValue(log),
      update: vi.fn((args: unknown) => args),
    },
    stockMovement: { deleteMany: vi.fn((args: unknown) => args) },
    $transaction: vi.fn(),
  };
  const service = new ActionLogsService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
  );
  return { prisma, service };
}

describe('ActionLogsService.void', () => {
  it('voids the log and gives its products back to stock in one transaction', async () => {
    const { prisma, service } = setup({ userId: 'u1', voidedAt: null });
    prisma.$transaction.mockResolvedValue([{}, voidedRow({ id: 'u1', displayName: 'Ana' })]);

    const result = await service.void('log1', 'Lote equivocado', engineer);

    expect(prisma.stockMovement.deleteMany).toHaveBeenCalledWith({
      where: { actionLogProduct: { actionLogId: 'log1' } },
    });
    expect(prisma.actionLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log1', voidedAt: null },
        data: expect.objectContaining({ voidedById: 'u1', voidReason: 'Lote equivocado' }),
      }),
    );
    expect(result.voided).toMatchObject({ reason: 'Lote equivocado', user: { id: 'u1' } });
    expect(result.canEdit).toBe(false);
  });

  it("lets an admin void someone else's log, but not an engineer", async () => {
    const other = { userId: 'u2', voidedAt: null };
    await expect(setup(other).service.void('log1', 'x', engineer)).rejects.toThrow(
      ForbiddenException,
    );

    const { prisma, service } = setup(other);
    prisma.$transaction.mockResolvedValue([{}, voidedRow({ id: 'a1', displayName: 'Admin' })]);
    await expect(service.void('log1', 'x', admin)).resolves.toBeDefined();
  });

  it('refuses to void a log twice', async () => {
    const { service } = setup({ userId: 'u1', voidedAt: new Date() });
    await expect(service.void('log1', 'x', engineer)).rejects.toThrow(ConflictException);
  });
});
