import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { existsSync, promises as fs } from 'fs';
import { getAwsConfig } from './awsConfig';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient, MessageAttributeValue } from '@aws-sdk/client-sqs';
import { ActionAuditEntry } from '../actions/audit';
import dateTime from './dateTime';
import { htmlTableReport } from './templater';
import zlib from 'node:zlib';

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
  sqs?: {
    url: string;
    compress: boolean;
    attributes?: { [key: string]: string };
  };
};

/**
 * Values used for expanding tokens in output filenames.
 */
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

  protected constructor(options: WriteOptions, context?: WriterContext) {
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

  private static compress(data: string): string {
    return zlib.deflateSync(Buffer.from(data)).toString('base64');
  }

  // here as reference, unused
  private static decompress(compressedB64: string): string {
    return zlib.inflateSync(Buffer.from(compressedB64, 'base64')).toString('utf-8');
  }

  protected async writeSQS() {
    const config = getAwsConfig();
    const sqs = new SQSClient(Object.assign(config, { useQueueUrlAsEndpoint: false }));

    const attributes: Record<string, MessageAttributeValue> = {};

    Object.entries(this.options.sqs?.attributes || {}).forEach((e) => {
      attributes[e[0]] = {
        DataType: 'String',
        StringValue: e[1],
      };
    });

    let output = this.getOutput();
    attributes['compression'] = {
      DataType: 'String',
      StringValue: 'none',
    };
    attributes['encoding'] = {
      DataType: 'String',
      StringValue: 'none',
    };

    if (this.options.sqs?.compress) {
      output = AbstractOutputWriter.compress(output);
      this.logger.debug(`compressed sqs message size: ${output.length}`);
      attributes['compression'] = {
        DataType: 'String',
        StringValue: 'zlib',
      };
      attributes['encoding'] = {
        DataType: 'String',
        StringValue: 'base64',
      };
    }

    this.logger.info(`Sending message to sqs ${this.options.sqs?.url}`);
    return sqs.send(
      new SendMessageCommand({
        QueueUrl: this.options.sqs?.url,
        MessageBody: output,
        MessageAttributes: attributes,
      }),
    );
  }

  protected async writeConsole() {
    this.logger.info(this.getOutput());
  }

  /**
   * Replace `%token` tokens in the given path with values from the Writer context, and date/time.
   * @param path - the string to be substituted
   * @returns a version of `path` with tokens replaced with their values; unmatched tokens will be retained as `%token`
   */
  public resolveFilename(path?: string): string {
    if (path === undefined) {
      return '';
    }
    // Replace all tokens from this.context
    if (this.context && Object.keys(this.context).length) {
      const re = new RegExp('%(' + Object.keys(this.context).join('|') + ')', 'g');
      path = path.replace(re, (match) => {
        const key = match.replace('%', '');
        return this.context![key as keyof WriterContext] || '??';
      });
    }
    // If filename contains any %xxx tokens (same character is repeated) attempt to use Luxon to resolve (date/time) tokens.
    path = path.replace(/%(\w)\1*(?!\w)/g, (match) => {
      return dateTime.getTime().toFormat(match.replace('%', ''));
    });

    // unmatched tokens will be retained as `%token`
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
    if (this.options.sqs) {
      promises.push(this.writeSQS());
    }
    return Promise.all(promises);
  }
}

/**
 * Generate a CSV table of data specified in a {@link DataTable}
 */
export class ObjectLogCsv extends AbstractOutputWriter {
  private readonly dataTable: DataTable;

  constructor(dataTable: DataTable, options: WriteOptions, context?: WriterContext) {
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
  constructor(dataTable: DataTable, options: WriteOptions, title: string, context?: WriterContext) {
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
  constructor(data: any, options: WriteOptions, context?: WriterContext) {
    super(options, context);
    this.data = data;
  }
  getOutput(): string {
    return JSON.stringify(this.data, null, 2);
  }
}

/**
 * Produce a HTML version of the provided data
 */
export class ObjectLogHtml extends AbstractOutputWriter {
  private readonly data: any;
  private readonly title: string;

  constructor(data: any, title: string, options: WriteOptions, context?: WriterContext) {
    super(options, context);
    this.data = data;
    this.title = title;
  }

  getOutput(): string {
    return htmlTableReport(`${this.title} ${dateTime.getTime().toLocal()}`, this.data);
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
