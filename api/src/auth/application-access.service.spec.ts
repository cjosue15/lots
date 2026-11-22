import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ApplicationAccessService } from './application-access.service.js';

describe('ApplicationAccessService', () => {
  const authId = '3a61dad3-c4f9-4c23-ad3c-f87d6250b207';
  const claims = { id: authId, email: 'ana@example.com' };
  const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;
  const membership = (role = 'employee') =>
    new Response(JSON.stringify([{ user_id: authId, role }]));

  let service: ApplicationAccessService;
  let fetchMock: ReturnType<typeof vi.spyOn>;
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsert = vi.fn().mockResolvedValue({
      id: 'local-id',
      authId,
      email: 'ana@example.com',
      displayName: 'ana',
    });
    service = new ApplicationAccessService(
      new ConfigService({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      }),
      { user: { upsert } } as unknown as PrismaService,
    );
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns the role and local user, querying with the user JWT', async () => {
    fetchMock.mockResolvedValue(membership('admin'));

    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).resolves.toEqual({
      id: 'local-id',
      authId,
      email: 'ana@example.com',
      displayName: 'ana',
      role: 'admin',
    });

    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get('application_id')).toBe('eq.lotes');
    expect(url.searchParams.get('user_id')).toBe(`eq.${authId}`);
    expect(options.headers).toEqual({
      apikey: 'sb_publishable_test',
      Authorization: 'Bearer token-a',
    });
  });

  it('queries only once per token', async () => {
    fetchMock.mockResolvedValue(membership());
    await service.resolveUser('token-a', claims, inOneHour());
    await service.resolveUser('token-a', claims, inOneHour());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('shares one lookup between simultaneous requests', async () => {
    fetchMock.mockResolvedValue(membership());
    await Promise.all([
      service.resolveUser('token-a', claims, inOneHour()),
      service.resolveUser('token-a', claims, inOneHour()),
      service.resolveUser('token-a', claims, inOneHour()),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks again when the token changes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(membership()));
    await service.resolveUser('token-a', claims, inOneHour());
    await service.resolveUser('token-b', claims, inOneHour());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks again once the token has expired', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(membership()));
    const expired = Math.floor(Date.now() / 1000) - 1;
    await service.resolveUser('token-a', claims, expired);
    await service.resolveUser('token-a', claims, expired);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a user without a lotes membership and does not cache it', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(membership());
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).resolves.toMatchObject({ role: 'employee' });
  });

  it('rejects a row that belongs to another user', async () => {
    fetchMock.mockResolvedValue(
      new Response('[{"user_id":"other","role":"admin"}]'),
    );
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['an error status', () => new Response('error', { status: 500 })],
    ['an unexpected shape', () => new Response('{}')],
    ['an unknown role', () => membership('owner')],
  ])('returns 503 on %s and does not cache it', async (_, response) => {
    fetchMock
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(membership());
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).resolves.toMatchObject({ role: 'employee' });
  });

  it('returns 503 when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));
    await expect(
      service.resolveUser('token-a', claims, inOneHour()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
