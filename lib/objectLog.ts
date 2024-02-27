import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { promises as fs } from 'fs';
import { getAwsConfig } from './awsConfig';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ActionAuditEntry } from '../actions/audit';
import dateTime from './dateTime';

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

/**
 * A class that can write a {@link DataTable} to the console as a table.
 */
export class ObjectLogConsole extends ObjectLog {
  private readonly padding: number = 4;
  private readonly dataTable: DataTable;
  private readonly title: string;
  constructor(dataTable: DataTable, title: string) {
    super();
    this.dataTable = dataTable;
    this.title = title;
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
    // this.logger.info(`${this.constructor.name} log follows`);
    this.logger.info(`${this.title}:\n${lines.join('\n')}\n`);
  }
}

type ObjectLogWriteOptions = {
  file?: string;
  s3?: {
    bucket: string;
    region: string;
    path: string;
  };
};

/**
 * A class that can write a {@link DataTable} to a file or S3 bucket as a CSV.
 */
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
    const mode = this.append ? 'a' : 'w';
    const filename = dateTime.resolveFilename(this.options.file);
    this.logger.info(`Writing ${this.dataTable.constructor.name} log to ${filename}`);
    const rows = this.dataTable.data().map((e) => this.sanitizeRow(e).join(',') + '\n');
    const output = [this.dataTable.header().join(',') + '\n'].concat(rows);
    return fs.writeFile(filename, output, { flag: mode });
  }

  private writeS3() {
    const config = getAwsConfig(this.options.s3?.region);
    const s3 = new S3Client(config);
    const fullData = [this.dataTable.header()]
      .concat(this.dataTable.data())
      .map((row) => this.sanitizeRow(row))
      .join('\n');

    const path = dateTime.resolveFilename(this.options.s3?.path);
    this.logger.info(`Writing ${this.dataTable.constructor.name} log to s3://${this.options.s3?.bucket}/${path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: path, Body: fullData }));
  }

  process(): any {
    const promises = [];
    if (this.options.file) {
      promises.push(this.writeCsv());
    }
    if (this.options.s3) {
      promises.push(this.writeS3());
    }
    return Promise.all(promises);
  }
}

/**
 * A base class that can write arbitrary data to a file or S3 bucket.
 */
abstract class AbstractObjectLog extends ObjectLog {
  protected readonly data: any;
  protected readonly options: ObjectLogWriteOptions;
  constructor(data: any, options: ObjectLogWriteOptions) {
    super();
    this.data = data;
    this.options = options;
  }

  abstract getOutput(): string;

  private async writeFile() {
    const filename = dateTime.resolveFilename(this.options.file);
    return fs.writeFile(filename || '', this.getOutput());
  }

  private writeS3() {
    const config = getAwsConfig(this.options.s3?.region);
    const s3 = new S3Client(config);
    const fullData = this.getOutput();
    const path = dateTime.resolveFilename(this.options.s3?.path);

    this.logger.info(`Writing data to s3://${this.options.s3?.bucket}/${path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: path, Body: fullData }));
  }

  process(): any {
    const promises = [];
    if (this.options.file) {
      promises.push(this.writeFile());
    }
    if (this.options.s3) {
      promises.push(this.writeS3());
    }
    return Promise.all(promises);
  }
}

/**
 * A class that can write arbitrary data to a file or S3 bucket as a JSON object.
 */
export class ObjectLogJson extends AbstractObjectLog {
  getOutput(): string {
    return JSON.stringify(this.data, null, 2);
  }
}

/**
 * A {@link DataTable} corresponding to a list of resources {@link ToolingInterface} discovered by Revolver.
 */
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
    return ['ACCOUNT_ID', 'ACCOUNT_NAME', 'REGION', 'TYPE', 'ID', 'STATE', 'ACTIONS'].concat(
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
        (e?.metadata?.actionNames || []).join('|'),
      ].concat(this.reportTags.map((t) => e.tag(t) || ''));
    });
  }
}

/**
 * A {@link DataTable} corresponding to a list of actions performed by Revolver.
 */
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
    return (this.includeTime ? ['TIME'] : []).concat([
      'ACCOUNT_ID',
      'ACCOUNT_NAME',
      'PLUGIN',
      'DRIVER',
      'TYPE',
      'ID',
      'ACTION',
      'STATUS',
      'REASON',
    ]);
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
      ]),
    );
  }
}
