import type { UserRole } from '@inspect-hub/types';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
