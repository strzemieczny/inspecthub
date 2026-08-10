import { Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
type QualitySocket = {
  readonly readyState: number;
  send(data: string): void;
};

@Injectable()
@WebSocketGateway({ path: '/api/quality-live' })
export class QualityLiveGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly clients = new Set<QualitySocket>();

  handleConnection(client: QualitySocket) {
    this.clients.add(client);
    client.send(JSON.stringify({ type: 'quality.connected' }));
  }

  handleDisconnect(client: QualitySocket) {
    this.clients.delete(client);
  }

  inspectionCompleted(inspectionId: string) {
    const message = JSON.stringify({
      type: 'quality.inspection-completed',
      inspectionId,
      occurredAt: new Date().toISOString(),
    });
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(message);
    }
  }
}
