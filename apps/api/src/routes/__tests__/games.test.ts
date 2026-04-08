import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    game: { findUnique: jest.fn(), update: jest.fn() },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;

const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };

const makeGame = (overrides = {}) => ({
  id: 1,
  sessionId: 1,
  startTime: new Date().toISOString(),
  endTime: null,
  endMethod: null,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/games/:id/end', () => {
  test('ends an active game and returns the updated game', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.game.findUnique as jest.Mock).mockResolvedValue({
      ...makeGame(),
      session: { stationId: 1 },
    });
    (mp.game.update as jest.Mock).mockResolvedValue(
      makeGame({ endTime: new Date().toISOString(), endMethod: 'MANUAL_BUTTON' })
    );

    const res = await request(app)
      .post('/api/games/1/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, endMethod: 'MANUAL_BUTTON' });
    expect(mp.game.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endMethod: 'MANUAL_BUTTON' }),
      })
    );
  });

  test('returns 404 for missing game', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.game.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/games/99/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GAME_NOT_FOUND');
  });

  test('returns 400 if game already ended', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.game.findUnique as jest.Mock).mockResolvedValue({
      ...makeGame({ endTime: new Date().toISOString(), endMethod: 'SESSION_END' }),
      session: { stationId: 1 },
    });

    const res = await request(app)
      .post('/api/games/1/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('GAME_ALREADY_ENDED');
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app).post('/api/games/1/end');
    expect(res.status).toBe(401);
  });

  test('returns 404 for non-numeric id', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/games/abc/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(404);
  });
});
