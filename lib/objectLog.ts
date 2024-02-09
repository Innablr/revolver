import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { promises as fs } from 'fs';
import { getAwsConfig } from './awsConfig';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ActionAuditEntry } from '../actions/audit';

abstract class ObjectLog {
  protected readonly logger;
  protected constructor() {
    this.logger = logger;
  }

  abstract process(): void;
}

export interface DataTable {
  header(): string[];
  data(): string[][];
}

export class ObjectLogConsole extends ObjectLog {
  private readonly padding: number = 4;
  private readonly dataTable: DataTable;
  constructor(dataTable: DataTable) {
    super();
    this.dataTable = dataTable;
  }

  process(): void {
    const data = this.dataTable.data();
    const header = this.dataTable.header();
    const columnSizes = data
      .concat([header])
      .map((row: string[]) => row.map((d) => (d || '').length))
      .reduce((a, row) => row.map((d, i) => (d > a[i] || 0 ? d : a[i])))
      .map((s) => s + this.padding);

    const lines = [header]
      .concat(data)
      .reduce((a, row) => a.concat(row.map((d, i) => (d || '').padEnd(columnSizes[i])).join('')), []);
    this.logger.info(`${this.constructor.name} log follows`);
    this.logger.info(`\n${lines.join('\n')}\n`);
  }
}

type ObjectLogWriteOptions = {
  file?: string;
  s3?: {
    bucket: string;
    path: string;
  };
};

export class ObjectLogCsv extends ObjectLog {
  private readonly options: ObjectLogWriteOptions;
  private readonly dataTable: DataTable;
  private readonly append: boolean;

  constructor(dataTable: DataTable, options: ObjectLogWriteOptions, append: boolean) {
    super();
    this.dataTable = dataTable;
    this.options = options;
    this.append = append;
  }

  private sanitizeRow(row: string[]): string[] {
    return row.map((v) => (v || '').replaceAll('"', '""')).map((v) => (v.includes(',') ? `"${v}"` : v));
  }

  private async writeCsv() {
    let mode = 'w';
    if (this.append) mode = 'a';

    const f = await fs.open(this.options.file as string, mode);
    this.logger.info(`Writing ${this.dataTable.constructor.name} log to ${this.options.file}`);
    if (!this.append) {
      await f.write(this.dataTable.header().join(',') + '\n');
    }
    for (const e of this.dataTable.data()) {
      await f.write(this.sanitizeRow(e).join(',') + '\n');
    }
  }

  private writeS3() {
    const config = getAwsConfig();
    const s3 = new S3Client(config);
    const fullData = [this.dataTable.header()].concat(this.dataTable.data()).map((row) => this.sanitizeRow(row)).join('\n')

    this.logger.info(`Writing ${this.dataTable.constructor.name} log to s3://${this.options.s3?.bucket}/${this.options.s3?.path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: this.options.s3?.path, Body: fullData }));
  }

  process(): any {
    if (this.options.file) {
      return this.writeCsv();
    }
    if (this.options.s3) {
      return this.writeS3();
    }
  }
}

export class ObjectLogJson extends ObjectLog {
  private readonly data: any;
  private readonly options: ObjectLogWriteOptions;
  constructor(data: any, options: ObjectLogWriteOptions) {
    super();
    this.data = data;
    this.options = options;
  }

  private async writeFile() {
    const f = await fs.open(this.options.file || '', 'w')
    return f.write(JSON.stringify(this.data, null, 2));
  }

  private writeS3() {
    const config = getAwsConfig();
    const s3 = new S3Client(config);
    const fullData = JSON.stringify(this.data, null, 2)

    this.logger.info(`Writing data to s3://${this.options.s3?.bucket}/${this.options.s3?.path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: this.options.s3?.path, Body: fullData }));
  }

  process(): any {
    if (this.options.file) {
      return this.writeFile();
    }
    if (this.options.s3) {
      return this.writeS3();
    }
  }
}

export class ResourceTable implements DataTable {
  private readonly reportTags: string[];
  private readonly entries: ToolingInterface[];
  private readonly accountConfig: any;
  constructor(accountConfig: any, entries: ToolingInterface[], reportTags: string[]) {
    this.accountConfig = accountConfig;
    this.reportTags = reportTags || [];
    this.entries = entries;
  }

  header(): string[] {
    return ['ACCOUNT_ID', 'ACCOUNT_NAME', 'REGION', 'TYPE', 'ID', 'STATE'].concat(
      this.reportTags.map((t) => `TAG:${t}`),
    );
  }
  data(): string[][] {
    return this.entries.map((e) => {
      return [
        e.accountId,
        this.accountConfig.settings.name,
        e.region,
        e.resourceType,
        e.resourceId,
        e.resourceState,
      ].concat(this.reportTags.map((t) => e.tag(t) || ''));
    });
  }
}

export class ActionAuditTable implements DataTable {
  private readonly entries: ActionAuditEntry[];
  private readonly accountConfig: any;
  private readonly includeTime: boolean;

  constructor(accountConfig: any, entries: ActionAuditEntry[], includeTime: boolean) {
    this.accountConfig = accountConfig;
    this.entries = entries;
    this.includeTime = includeTime;
  }

  header(): string[] {
    return (this.includeTime ? ['TIME'] : []).concat(['ACCOUNT_ID', 'ACCOUNT_NAME', 'PLUGIN', 'DRIVER', 'TYPE', 'ID', 'ACTION', 'STATUS', 'REASON']);
  }
  data(): string[][] {
    return this.entries.map((e) =>
      (this.includeTime ? [e.time.toString()] : []).concat([
        e.accountId,
        this.accountConfig.settings.name,
        e.plugin,
        e.driver,
        e.resourceType,
        e.resourceId,
        e.action,
        e.status,
        e.reason,
    ]));
  }
}
