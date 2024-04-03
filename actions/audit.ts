import { DateTime } from 'luxon';

export interface ActionAuditEntry {
  time: DateTime;
  accountId: string;
  plugin: string;
  driver: string;
  resourceType: string;
  resourceId: string;
  status: string;
  action: string;
  reason: string;
  metadata: any;
}
