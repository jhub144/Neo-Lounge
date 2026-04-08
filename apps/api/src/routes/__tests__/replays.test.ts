import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    session: { findFirst: jest.fn() },
    settings: { findUnique: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;

const settings = { id: 1, replayTTLMinutes: 60 };

const makeSession = (overrides = {}) => ({
  id: 1,
  authCode: 'ABC123',
  staffPin: '0000',
  startTime: new Date(),
  endTime: null,
  durationMinutes: 60,
  status: 'ACTIVE',
  station: { id: 1, name: 'Station 1' },
  games: [
    {
      id: 1,
      startTime: new Date(),
      endTime: null,
      endMethod: null,
      replayClips: [],
    },
  ],
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('GET /api/replays/:authCode', () => {
  test('returns session data and empty clips for active session', async () => {
    (mp.session.findFirst as jest.Mock).mockResolvedValue(makeSession());
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);

    const res = await request(app).get('/api/replays/ABC123');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      authCode: 'ABC123',
      stationName: 'Station 1',
      replaysExpired: false,
      games: expect.arrayContaining([
        expect.objectContaining({ id: 1, clips: [] }),
      ]),
    });
  });

  test('returns 404 for unknown auth code', async () => {
    (mp.session.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/replays/XXXXXX');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  test('returns 400 for invalid auth code length', async () => {
    const res = await request(app).get('/api/replays/AB');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_AUTH_CODE');
  });

  test('marks replaysExpired true when TTL has passed', async () => {
    const pastEnd = new Date(Date.now() - 90 * 60 * 1000); // 90 min ago
    (mp.session.findFirst as jest.Mock).mockResolvedValue(
      makeSession({ endTime: pastEnd, status: 'COMPLETED' })
    );
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);

    const res = await request(app).get('/api/replays/ABC123');

    expect(res.status).toBe(200);
    expect(res.body.replaysExpired).toBe(true);
  });

  test('marks replaysExpired false when TTL has not passed', async () => {
    const recentEnd = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    (mp.session.findFirst as jest.Mock).mockResolvedValue(
      makeSession({ endTime: recentEnd, status: 'COMPLETED' })
    );
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);

    const res = await request(app).get('/api/replays/ABC123');

    expect(res.status).toBe(200);
    expect(res.body.replaysExpired).toBe(false);
  });
});
