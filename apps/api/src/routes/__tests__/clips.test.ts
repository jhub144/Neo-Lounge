import request from 'supertest';
import express from 'express';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    settings: { findUnique: jest.fn() },
    replayClip: { create: jest.fn() },
  },
}));

jest.mock('../../services/socketService', () => ({
  emitClipReady: jest.fn(),
}));

import prisma from '../../lib/prisma';
import { emitClipReady } from '../../services/socketService';
import clipsRouter from '../clips';

const app = express();
app.use(express.json());
app.use('/api/clips', clipsRouter);

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockEmitClipReady = emitClipReady as jest.Mock;

const VALID_BODY = {
  gameId: 5,
  sessionId: 10,
  filePath: '/replays/10/5/clip_123.mp4',
  triggerType: 'CROWD_ROAR',
  triggerTimestamp: '2024-01-01T12:00:00Z',
};

const MOCK_SETTINGS = { id: 1, replayTTLMinutes: 60 };

const MOCK_CLIP = {
  id: 42,
  gameId: 5,
  sessionId: 10,
  filePath: '/replays/10/5/clip_123.mp4',
  triggerType: 'CROWD_ROAR',
  triggerTimestamp: new Date('2024-01-01T12:00:00Z'),
  expiresAt: new Date(Date.now() + 3600 * 1000),
  createdAt: new Date(),
  stitchedReelPath: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(MOCK_SETTINGS);
  (mockPrisma.replayClip.create as jest.Mock).mockResolvedValue(MOCK_CLIP);
});

describe('POST /api/clips', () => {
  describe('success', () => {
    it('returns 201 with clip details', async () => {
      const res = await request(app).post('/api/clips').send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.clipId).toBe(42);
      expect(res.body.sessionId).toBe(10);
      expect(res.body.gameId).toBe(5);
    });

    it('creates the ReplayClip record in the database', async () => {
      await request(app).post('/api/clips').send(VALID_BODY);
      expect(mockPrisma.replayClip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gameId: 5,
            sessionId: 10,
            filePath: '/replays/10/5/clip_123.mp4',
            triggerType: 'CROWD_ROAR',
          }),
        })
      );
    });

    it('emits replay:ready socket event', async () => {
      await request(app).post('/api/clips').send(VALID_BODY);
      expect(mockEmitClipReady).toHaveBeenCalledWith(
        42, 10, 5, 'CROWD_ROAR', '/replays/10/5/clip_123.mp4'
      );
    });

    it('uses TTL from settings to calculate expiresAt', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        replayTTLMinutes: 120,
      });
      await request(app).post('/api/clips').send(VALID_BODY);
      const createCall = (mockPrisma.replayClip.create as jest.Mock).mock.calls[0][0];
      const expiresAt: Date = createCall.data.expiresAt;
      const diffMs = expiresAt.getTime() - Date.now();
      // Should be ~120 minutes from now (±5 s tolerance)
      expect(diffMs).toBeGreaterThan(119 * 60 * 1000);
      expect(diffMs).toBeLessThan(121 * 60 * 1000);
    });

    it('uses default 60-min TTL when settings not found', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null);
      await request(app).post('/api/clips').send(VALID_BODY);
      const createCall = (mockPrisma.replayClip.create as jest.Mock).mock.calls[0][0];
      const diffMs = createCall.data.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(59 * 60 * 1000);
    });
  });

  describe('validation', () => {
    it('returns 400 when gameId is missing', async () => {
      const res = await request(app)
        .post('/api/clips')
        .send({ ...VALID_BODY, gameId: undefined });
      expect(res.status).toBe(400);
    });

    it('returns 400 when filePath is missing', async () => {
      const res = await request(app)
        .post('/api/clips')
        .send({ ...VALID_BODY, filePath: undefined });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid triggerType', async () => {
      const res = await request(app)
        .post('/api/clips')
        .send({ ...VALID_BODY, triggerType: 'INVALID' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TRIGGER_TYPE');
    });
  });

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      (mockPrisma.replayClip.create as jest.Mock).mockRejectedValue(new Error('DB error'));
      const res = await request(app).post('/api/clips').send(VALID_BODY);
      expect(res.status).toBe(500);
    });
  });
});
