import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info?: { message?: string },
  ): TUser | null {
    if (user) return user;
    if (!err && info?.message === 'No auth token') return null;
    if (err instanceof Error) throw err;
    throw new UnauthorizedException();
  }
}
