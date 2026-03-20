import { Staff } from '../generated/prisma/models';

declare global {
  namespace Express {
    interface Request {
      staff?: Staff;
    }
  }
}
