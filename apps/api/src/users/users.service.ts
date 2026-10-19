import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  findAll() {
    return this.database.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        externalProvider: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
