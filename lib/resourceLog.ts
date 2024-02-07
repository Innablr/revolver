import { ToolingInterface } from "../drivers/instrumentedResource";
import { logger } from "./logger";
import { writeFileSync } from "jsonfile";
import { promises as fs } from "fs";


abstract class ResourceLog {
  protected readonly logger;
  protected readonly entries: ToolingInterface[];
  protected constructor(entries: ToolingInterface[]) {
    this.entries = entries;
    this.logger = logger;
  }

  abstract process(): void;
}

export class ResourceLogConsole extends ResourceLog {
  constructor(entries: ToolingInterface[]) {
    super(entries);
  }
  process(): void {
    const header =
      `${'ACCOUNT_ID'.padEnd(16)}` +
      `${'REGION'.padEnd(20)}` +
      `${'TYPE'.padEnd(20)} ` +
      `${'ID'.padEnd(40)} ` +
      `${'STATE'}`;
    const lines = this.entries.map((r) =>
        `${(r.accountId || '').padEnd(16)}` +
        `${(r.region || '').padEnd(20)}` +
        `${(r.resourceType || '').padEnd(20)} ` +
        `${r.resourceId.padEnd(40)} ` +
        `${r.resourceState}`
    )
    this.logger.info('Resources log follows');
    this.logger.info(`\n${[header].concat(lines).join('\n')}\n`);
  }
}

export class ResourceLogJson extends ResourceLog {
  private readonly outputFile;
  constructor(entries: ToolingInterface[], outputFile: string) {
    super(entries);
    this.outputFile = outputFile;
  }
  process(): void {
    this.logger.info(`Writing resources to ${this.outputFile}`);
    writeFileSync(this.outputFile, this.entries, { spaces: 2 });
  }
}

export class ResourceLogCsv extends ResourceLog {
  private readonly outputFile;
  constructor(entries: ToolingInterface[], outputFile: string) {
    super(entries);
    this.outputFile = outputFile;
  }
  process(): void {
    const header =
      'ACCOUNT_ID,' +
      'REGION,' +
      'TYPE,' +
      'ID,' +
      'STATE';
    const lines = this.entries.map((r) =>
        `${r.accountId || ''},` +
        `${r.region || ''},` +
        `${r.resourceType || ''},` +
        `${r.resourceId},` +
        `${r.resourceState}`
    );

    this.logger.info(`Writing resources to ${this.outputFile}`);
    fs.open(this.outputFile, 'w').then(async (f) => {
      await f.write(`${header}\n`);
      for(const l of lines) {
        await f.write(`${l}\n`);
      }
    });
  }
}
