import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@inspect-hub/types';
import { FormsController } from '../forms/forms.controller';
import { StationsController } from '../stations/stations.controller';
import { UsersController } from '../users/users.controller';
import { EventsController } from '../observability/events.controller';
import { ScadaConnectorController } from '../scada-connector/scada-connector.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const configurationRoutes = [
  ...[
    'create',
    'duplicate',
    'findRevisions',
    'update',
    'archive',
    'remove',
  ].map((method) => [FormsController, method] as const),
  ...['findAll', 'create', 'update', 'remove'].map(
    (method) => [StationsController, method] as const,
  ),
  [UsersController, 'findAll'],
  [EventsController, 'find'],
] as const;
const scadaRoutes = ['settings', 'updateSettings'].map(
  (method) => [ScadaConnectorController, method] as const,
);
const guard = new RolesGuard(new Reflector());

function context(
  controller: { prototype: object },
  method: string,
  role: UserRole,
) {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('configuration access policy', () => {
  it.each([...configurationRoutes, ...scadaRoutes])(
    '%p.%s requires authentication and role checks',
    (controller, method) => {
      const guards: unknown[] = [
        ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
        ...(Reflect.getMetadata(
          GUARDS_METADATA,
          controller.prototype[method],
        ) ?? []),
      ];
      expect(guards).toEqual(
        expect.arrayContaining([JwtAuthGuard, RolesGuard]),
      );
    },
  );

  it.each(configurationRoutes)(
    '%p.%s allows managers and admins',
    (controller, method) => {
      expect(guard.canActivate(context(controller, method, 'MANAGER'))).toBe(
        true,
      );
      expect(guard.canActivate(context(controller, method, 'ADMIN'))).toBe(
        true,
      );
      expect(guard.canActivate(context(controller, method, 'OPERATOR'))).toBe(
        controller === StationsController && method === 'findAll',
      );
    },
  );

  it.each(scadaRoutes)(
    '%p.%s keeps SCADA restricted to admins',
    (controller, method) => {
      expect(guard.canActivate(context(controller, method, 'ADMIN'))).toBe(
        true,
      );
      expect(guard.canActivate(context(controller, method, 'MANAGER'))).toBe(
        false,
      );
      expect(guard.canActivate(context(controller, method, 'OPERATOR'))).toBe(
        false,
      );
    },
  );
});
