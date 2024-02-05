import { DateTime } from 'luxon';
import { promises as fs } from 'node:fs';

export interface ActionAuditEntry {
  time: DateTime;
  plugin: string;
  driver: string;
  resourceType: string;
  resourceId: string;
  status: string;
  action: string;
  reason: string;
}

abstract class ActionAuditLog {
  protected readonly entries: ActionAuditEntry[];
  protected constructor(entries: ActionAuditEntry[]) {
    this.entries = entries;
  }

  abstract process(): void;
}

export class ActionAuditLogCSV extends ActionAuditLog {
  private readonly outputFile: string;
  private readonly append: boolean;
  constructor(entries: ActionAuditEntry[], outputFile: string, append: boolean) {
    super(entries);
    this.outputFile = outputFile;
    this.append = append;
  }

  process() {
    let mode = 'w';
    if (this.append) mode = 'a';
    fs.open(this.outputFile, mode).then(async (f) => {
      if (!this.append) {
        await f.write(`time,plugin,driver,resourceType,resourceId,action,status,reason\n`);
      }
      for (const e of this.entries) {
        const reason = `"${e.reason.replaceAll('"', '""')}"`;
        const line = `${e.time},${e.plugin},${e.driver},${e.resourceType},${e.resourceId},${e.action},${e.status},${reason}\n`;
        await f.write(line);
      }
    });
  }
}

export class ActionAuditLogConsole extends ActionAuditLog {
  constructor(entries: ActionAuditEntry[]) {
    super(entries);
  }

  process() {
    console.log(`${'PLUGIN'.padEnd(20)}${'DRIVER'.padEnd(25)}${'TYPE'.padEnd(5)}${'ID'.padEnd(40)}${'ACTION'.padEnd(10)}${'STATUS'.padEnd(10)}${'REASON'}`)
    for (const e of this.entries) {
      const reason = `"${e.reason.replaceAll('"', '""')}"`;
      const line = `${e.plugin.padEnd(20)}${e.driver.padEnd(25)}${e.resourceType.padEnd(5)}${e.resourceId.padEnd(40)}${e.action.padEnd(10)}${e.status.padEnd(10)}${reason}`;
      console.log(line);
    }
  }
}
