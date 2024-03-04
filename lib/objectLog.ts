import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { existsSync, promises as fs } from 'fs';
import { getAwsConfig } from './awsConfig';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ActionAuditEntry } from '../actions/audit';
import dateTime from './dateTime';

/**
 * Used by the writers to structure table style data
 */
export interface DataTable {
  header(): string[];
  data(): string[][];
}

/**
 * Configures AbstractOutputWriter options
 * console has no deeper value so needs to be checked for null rather than undefined
 * append is only used within file operations and doesn't support s3 appending
 */
type WriteOptions = {
  append?: boolean;
  console?: null;
  file?: string;
  s3?: {
    bucket: string;
    region: string;
    path: string;
  };
};

// values used for expanding tokens in output filenames
type WriterContext = {
  region?: string;
  timezone?: string;
  accountId?: string;
  name?: string;
};

/**
 * A base class that can write arbitrary data to a file, S3 bucket or console.
 */
abstract class AbstractOutputWriter {
  protected readonly options: WriteOptions;
  protected readonly logger;
  protected readonly context;

  protected constructor(options: WriteOptions, context: WriterContext = {}) {
    this.logger = logger;
    this.options = options;
    this.context = context;
  }

  abstract getOutput(): string;

  protected async writeFile() {
    const filename = this.resolveFilename(this.options.file);
    this.logger.info(`Writing data to ${filename}`);
    return fs.writeFile(filename, this.getOutput(), { flag: this.options.append ? 'a' : 'w' });
  }

  protected writeS3() {
    const config = getAwsConfig(this.options.s3?.region);
    const s3 = new S3Client(config);
    const path = this.resolveFilename(this.options.s3?.path);
    this.logger.info(`Writing data to s3://${this.options.s3?.bucket}/${path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: path, Body: this.getOutput() }));
  }

  protected async writeConsole() {
    this.logger.info(this.getOutput());
  }

  public resolveFilename(path?: string): string {
    if (path === undefined) {
      return '';
    }
    // Replace all tokens from this.context
    if (this.context && Object.keys(this.context).length) {
      const re = new RegExp('%(' + Object.keys(this.context).join('|') + ')', 'g');
      path = path.replace(re, (match) => {
        const key = match.replace('%', '');
        return this.context[key as keyof WriterContext] || match;
      });
    }
    // If filename contains any %xx tokens then escape the rest and use Luxon to resolve the (date/time) tokens
    if (path.includes('%')) {
      const fmt = "'" + path.replace(/%(\w+)/g, "'$1'") + "'";
      path = dateTime.getTime().toFormat(fmt);
    }
    return path;
  }

  process(): any {
    const promises = [];
    if (this.options.console === null) {
      promises.push(this.writeConsole());
    }
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
 * Generate a CSV table of data specified in a {@link DataTable}
 */
export class ObjectLogCsv extends AbstractOutputWriter {
  private readonly dataTable: DataTable;

  constructor(dataTable: DataTable, options: WriteOptions, context: WriterContext) {
    super(options, context);
    this.dataTable = dataTable;
  }

  private sanitizeRow(row: string[]): string[] {
    return row.map((v) => (v || '').replaceAll('"', '""')).map((v) => (v.includes(',') ? `"${v}"` : v));
  }

  getOutput(): string {
    // somewhat hacky to support CSV append needing to know if the header is needed
    const outputExists = existsSync(this.resolveFilename(this.options.file));
    let rows: string[][] = [this.dataTable.header()];

    // Don't write header if appending to an existing file
    if (this.options.append && outputExists) {
      rows = [];
    }
    return (
      rows
        .concat(this.dataTable.data())
        .map((row) => this.sanitizeRow(row).join(','))
        .join('\n') + '\n'
    );
  }
}

/**
 * Generates a space aligned text table of data from a {@link DataTable}
 */
export class ObjectLogTable extends AbstractOutputWriter {
  private readonly padding: number = 4;
  private readonly dataTable: DataTable;
  private readonly title: string;
  constructor(dataTable: DataTable, options: WriteOptions, title: string, context: WriterContext) {
    super(options, context);
    this.dataTable = dataTable;
    this.title = title;
  }

  getOutput(): string {
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
    return `${this.title}:\n${lines.join('\n')}\n`;
  }
}

/**
 * Generates a JSON representation of the provided data.
 */
export class ObjectLogJson extends AbstractOutputWriter {
  private readonly data: any;
  constructor(data: any, options: WriteOptions, context: WriterContext) {
    super(options, context);
    this.data = data;
  }
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
