import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { writeFileSync } from 'jsonfile';
import { promises as fs } from 'fs';

abstract class ResourceLog {
  protected readonly logger;
  protected readonly entries: ToolingInterface[];
  protected readonly accountConfig: any;
  protected constructor(entries: ToolingInterface[], accountConfig: any) {
    this.entries = entries;
    this.accountConfig = accountConfig;
    this.logger = logger;
  }

  abstract process(): void;
}

export class ResourceLogConsole extends ResourceLog {
  private readonly reportTags: string[];
  constructor(entries: ToolingInterface[], accountConfig: any, reportTags: string[]) {
    super(entries, accountConfig);
    this.reportTags = reportTags || [];
  }
  process(): void {
    const header =
      `${'ACCOUNT_ID'.padEnd(16)} ` +
      `${'ACCOUNT_NAME'.padEnd(16)} ` +
      `${'REGION'.padEnd(20)} ` +
      `${'TYPE'.padEnd(20)} ` +
      `${'ID'.padEnd(40)} ` +
      `${'STATE'.padEnd(10)} ` +
      this.reportTags.map((tagName) => ` TAG:${tagName}`.padEnd(20)).reduce((a, i) => a + i, '');
    const lines = this.entries.map(
      (r) =>
        `${(r.accountId || '').padEnd(16)} ` +
        `${(this.accountConfig.settings.name || '').padEnd(16)} ` +
        `${(r.region || '').padEnd(20)} ` +
        `${(r.resourceType || '').padEnd(20)} ` +
        `${r.resourceId.padEnd(40)} ` +
        `${r.resourceState.padEnd(10)} ` +
        this.reportTags.map((tagName) => ` ${r.tag(tagName) || ''}`.padEnd(20)).reduce((a, i) => a + i, ''),
    );
    this.logger.info('Resources log follows');
    this.logger.info(`\n${[header].concat(lines).join('\n')}\n`);
  }
}

export class ResourceLogJson extends ResourceLog {
  private readonly outputFile;
  constructor(entries: ToolingInterface[], accountConfig: any, outputFile: string) {
    super(entries, accountConfig);
    this.outputFile = outputFile;
  }
  process(): void {
    this.logger.info(`Writing resources to ${this.outputFile}`);
    writeFileSync(this.outputFile, this.entries, { spaces: 2 });
  }
}

export class ResourceLogCsv extends ResourceLog {
  private readonly outputFile;
  private readonly reportTags: string[];
  constructor(entries: ToolingInterface[], accountConfig: any, outputFile: string, reportTags: string[]) {
    super(entries, accountConfig);
    this.outputFile = outputFile;
    this.reportTags = reportTags || [];
  }
  process(): void {
    const header =
      'ACCOUNT_ID,' +
      'ACCOUNT_NAME,' +
      'REGION,' +
      'TYPE,' +
      'ID,' +
      'STATE' +
      this.reportTags.map((tagName) => `,TAG:${tagName}`).reduce((a, i) => a + i, '');
    const lines = this.entries.map(
      (r) =>
        `${r.accountId || ''},` +
        `${this.accountConfig.settings.name || ''},` +
        `${r.region || ''},` +
        `${r.resourceType || ''},` +
        `${r.resourceId},` +
        `${r.resourceState}` +
        this.reportTags.map((tagName) => `,${r.tag(tagName) || ''}`).reduce((a, i) => a + i, ''),
    );

    this.logger.info(`Writing resources to ${this.outputFile}`);
    fs.open(this.outputFile, 'w').then(async (f) => {
      await f.write(`${header}\n`);
      for (const l of lines) {
        await f.write(`${l}\n`);
      }
    });
  }
}
