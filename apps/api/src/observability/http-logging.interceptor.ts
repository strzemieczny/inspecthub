import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  Observable,
  catchError,
  defer,
  from,
  mergeMap,
  tap,
  throwError,
} from 'rxjs';
import { correlationContext } from './correlation-context';
import { EventsService } from './events.service';
import { EventOutcome, EventSeverity } from '@inspect-hub/database';

type AuditedRequest = Request & {
  user?: { userId: string; role: string };
};

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly events: EventsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const supplied = request.header('x-correlation-id');
    const correlationId =
      supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
        ? supplied
        : randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const startedAt = process.hrtime.bigint();
    const log = (outcome: 'SUCCESS' | 'FAILURE', error?: unknown) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const statusCode = error
        ? ((error as { status?: number }).status ?? 500)
        : response.statusCode;
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          schemaVersion: 1,
          type: 'HTTP_REQUEST_COMPLETED',
          severity: statusCode >= 500 ? 'ERROR' : 'INFO',
          outcome,
          correlationId,
          method: request.method,
          route: request.path,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        })}\n`,
      );
    };

    const controllerName = context.getClass().name.replace(/Controller$/, '');
    const operationName = context.getHandler().name;
    const shouldAudit =
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) &&
      controllerName !== 'Events';

    return defer(() =>
      correlationContext.run({ correlationId }, () =>
        next.handle().pipe(
          tap(() => log('SUCCESS')),
          mergeMap(async (result: unknown) => {
            if (shouldAudit) {
              await this.persistAudit(
                request,
                controllerName,
                operationName,
                correlationId,
                EventOutcome.SUCCESS,
                response.statusCode,
                result,
              );
            }
            return result;
          }),
          catchError((error: unknown) => {
            log('FAILURE', error);
            if (!shouldAudit) return throwError(() => error);
            const statusCode = (error as { status?: number }).status ?? 500;
            return from(
              this.persistAudit(
                request,
                controllerName,
                operationName,
                correlationId,
                EventOutcome.FAILURE,
                statusCode,
                undefined,
                error,
              ),
            ).pipe(mergeMap(() => throwError(() => error)));
          }),
        ),
      ),
    );
  }

  private async persistAudit(
    request: AuditedRequest,
    controllerName: string,
    operationName: string,
    correlationId: string,
    outcome: EventOutcome,
    statusCode: number,
    result?: unknown,
    error?: unknown,
  ): Promise<void> {
    try {
      await this.events.record({
        type: `${this.eventPart(controllerName)}_${this.eventPart(operationName)}`,
        category: 'AUDIT',
        severity:
          outcome === EventOutcome.SUCCESS
            ? EventSeverity.INFO
            : statusCode >= 500
              ? EventSeverity.ERROR
              : EventSeverity.WARNING,
        outcome,
        actorId: request.user?.userId,
        actorType: request.user ? `USER:${request.user.role}` : 'ANONYMOUS',
        stationCode: this.stringValue(
          (request.body as Record<string, unknown> | undefined)?.stationCode ??
            (request.body as Record<string, unknown> | undefined)?.code,
        ),
        entityType: controllerName,
        entityId: this.stringValue(request.params.id) ?? this.resultId(result),
        correlationId,
        payload: {
          method: request.method,
          path: request.path,
          parameters: request.params,
          changes: request.body,
          statusCode,
          result: this.resultSummary(result),
          error: error instanceof Error ? error.message : undefined,
          clientIp: request.ip,
        },
      });
    } catch (auditError) {
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'AUDIT_WRITE_FAILED',
          severity: 'CRITICAL',
          correlationId,
          error:
            auditError instanceof Error ? auditError.message : 'Unknown error',
        })}\n`,
      );
    }
  }

  private eventPart(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .toUpperCase();
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
  }

  private resultId(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') return undefined;
    return this.stringValue((result as Record<string, unknown>).id);
  }

  private resultSummary(result: unknown): Record<string, unknown> | undefined {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return undefined;
    }
    const source = result as Record<string, unknown>;
    return Object.fromEntries(
      ['id', 'code', 'version', 'email', 'role', 'active', 'enabled'].flatMap(
        (key) => (source[key] === undefined ? [] : [[key, source[key]]]),
      ),
    );
  }
}
