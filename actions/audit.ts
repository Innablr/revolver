import { DateTime } from 'luxon';
import { promises as fs } from 'node:fs';
import { logger } from "../lib/logger";

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
}

abstract class ActionAuditLog {
  protected readonly entries: ActionAuditEntry[];
  protected readonly accountConfig: any;

  protected constructor(entries: ActionAuditEntry[], accountConfig: any) {
    this.entries = entries;
    this.accountConfig = accountConfig;
  }

  abstract process(): void;
}

export class ActionAuditLogCSV extends ActionAuditLog {
  private readonly outputFile: string;
  private readonly append: boolean;
  protected logger;
  constructor(entries: ActionAuditEntry[], accountConfig: any, outputFile: string, append: boolean) {
    super(entries, accountConfig);
    this.outputFile = outputFile;
    this.append = append;
    this.logger = logger;
  }

  process() {
    let mode = 'w';
    if (this.append) mode = 'a';
    fs.open(this.outputFile, mode).then(async (f) => {
      this.logger.info(`Writing audit log to ${this.outputFile}`);

      if (!this.append) {
        await f.write(
            `time,` +
            `accountId,` +
            `accountName,` +
            `plugin,` +
            `driver,` +
            `resourceType,` +
            `resourceId,` +
            `action,` +
            `status,` +
            `reason\n`
        );
      }
      for (const e of this.entries) {
        const reason = `"${e.reason.replaceAll('"', '""')}"`;
        const line =
          `${e.time},` +
          `${e.accountId},` +
          `${this.accountConfig.settings.name || ''},` +
          `${e.plugin},` +
          `${e.driver},` +
          `${e.resourceType},` +
          `${e.resourceId},` +
          `${e.action},` +
          `${e.status},` +
          `${reason}\n`;
        await f.write(line);
      }
    });
  }
}

export class ActionAuditLogConsole extends ActionAuditLog {
  constructor(entries: ActionAuditEntry[], accountConfig: any) {
    super(entries, accountConfig);
  }

  process() {
    const header =
      `${'ACCOUNT_ID'.padEnd(16)} ` +
      `${'ACCOUNT_NAME'.padEnd(16)} ` +
      `${'PLUGIN'.padEnd(20)} ` +
      `${'DRIVER'.padEnd(25)} ` +
      `${'TYPE'.padEnd(5)} ` +
      `${'ID'.padEnd(40)} ` +
      `${'ACTION'.padEnd(10)} ` +
      `${'STATUS'.padEnd(10)} ` +
      `${'REASON'}`;
    const lines = this.entries.map((e) =>
        `${e.accountId.padEnd(16)} ` +
        `${(this.accountConfig.settings.name || '').padEnd(16)} ` +
        `${e.plugin.padEnd(20)} ` +
        `${e.driver.padEnd(25)} ` +
        `${e.resourceType.padEnd(5)} ` +
        `${e.resourceId.padEnd(40)} ` +
        `${e.action.padEnd(10)} ` +
        `${e.status.padEnd(10)} ` +
        `${e.reason}`
    );

    logger.info('Audit log follows');
    logger.info(`\n${[header].concat(lines).join('\n')}\n`);
  }
}
