import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    staff: {
      findFirst: jest.fn(),
    },
    securityEvent: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const regularStaff = { id: 2, name: 'Staff', pin: '1234', role: 'STAFF', isActive: true };

describe('POST /api/staff/login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('valid pin returns 200 with staff data', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/staff/login').send({ pin: '0000' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, name: 'Owner', role: 'OWNER' });
  });

  test('invalid pin returns 401', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app).post('/api/staff/login').send({ pin: '9999' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('missing pin returns 400', async () => {
    const res = await request(app).post('/api/staff/login').send({});

    expect(res.status).toBe(400);
  });
});

describe('requireStaff middleware', () => {
  // Mount a test route that uses requireStaff
  const express = require('express');
  const { requireStaff, requireOwner } = require('../../middleware/auth');
  const testApp = express();
  testApp.use(express.json());
  testApp.get('/protected', requireStaff, (_req: any, res: any) => res.json({ ok: true }));
  testApp.get('/owner-only', requireOwner, (_req: any, res: any) => res.json({ ok: true }));

  beforeEach(() => jest.clearAllMocks());

  test('missing header returns 401', async () => {
    const res = await request(testApp).get('/protected');
    expect(res.status).toBe(401);
  });

  test('invalid pin returns 401', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(testApp).get('/protected').set('x-staff-pin', 'bad');
    expect(res.status).toBe(401);
  });

  test('valid staff pin returns 200', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(regularStaff);
    const res = await request(testApp).get('/protected').set('x-staff-pin', '1234');
    expect(res.status).toBe(200);
  });

  test('non-owner pin on owner route returns 403', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(regularStaff);
    const res = await request(testApp).get('/owner-only').set('x-staff-pin', '1234');
    expect(res.status).toBe(403);
  });

  test('owner pin on owner route returns 200', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    const res = await request(testApp).get('/owner-only').set('x-staff-pin', '0000');
    expect(res.status).toBe(200);
  });
});
