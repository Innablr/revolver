import { ToolingInterface } from '../drivers/instrumentedResource';
import { logger } from './logger';
import { existsSync, promises as fs } from 'fs';
import { getAwsConfig } from './awsConfig';
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient, MessageAttributeValue } from '@aws-sdk/client-sqs';
import { ActionAuditEntry } from '../actions/audit';
import dateTime from './dateTime';
import { htmlTableReport } from './templater';
import zlib from 'node:zlib';
import { stringify } from 'csv-stringify/sync';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

/**
 * Used by the writers to structure table style data
 */
export interface DataTable {
  header(): string[];
  data(): string[][];
}

/**
 * Configuration for SNS or SQS writers.
 */
type MessageWriteOptons = {
  url: string; // a SQS QueueUrl or a SNS TopicArn
  compress: boolean;
  attributes?: { [key: string]: string };
};

/**
 * Configures AbstractOutputWriter options
 * console has no deeper value so needs to be checked for null rather than undefined
 */
type WriteOptions = {
  append?: boolean; // file and S3
  console?: null;
  file?: string;
  s3?: {
    bucket: string;
    region: string;
    path: string;
  };
  sqs?: MessageWriteOptons;
  sns?: MessageWriteOptons;
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

  static filesWritten: string[] = [];

  protected constructor(options: WriteOptions, context?: WriterContext) {
    this.logger = logger;
    this.options = options;
    this.context = context;
  }

  abstract getOutput(): string;

  // Emit a log message about a new output file being created, and warn if it has been used already.
  public logFileOutput(filename: string) {
    if (AbstractOutputWriter.filesWritten.includes(filename)) {
      this.logger.warn(`Writing data to ${filename}. This output filename has already been used this cycle!`);
    } else {
      this.logger.info(`Writing data to ${filename}`);
      AbstractOutputWriter.filesWritten.push(filename);
    }
  }

  protected async writeFile() {
    const filename = this.resolveFilename(this.options.file);
    this.logFileOutput(filename);
    return fs.writeFile(filename, this.getOutput(), { flag: this.options.append ? 'a' : 'w' });
  }

  protected async writeS3() {
    const config = getAwsConfig(this.options.s3?.region);
    const s3 = new S3Client(config);
    const path = this.resolveFilename(this.options.s3?.path);
    this.logFileOutput(`s3://${this.options.s3?.bucket}/${path}`);
    return s3.send(new PutObjectCommand({ Bucket: this.options.s3?.bucket, Key: path, Body: this.getOutput() }));
  }

  private static compress(data: string): string {
    return zlib.deflateSync(Buffer.from(data)).toString('base64');
  }

  // here as reference, unused
  private static decompress(compressedB64: string): string {
    return zlib.inflateSync(Buffer.from(compressedB64, 'base64')).toString('utf-8');
  }

  /**
   * Generate attributes and payload for sending a SNS/SQS message.
   * @param settings - settings and attibute key-value for the output message
   * @returns [attributes, output]
   */
  private generateMessageOutput(settings?: MessageWriteOptons): [Record<string, MessageAttributeValue>, string] {
    const attributes: Record<string, MessageAttributeValue> = {};

    Object.entries(settings?.attributes || {}).forEach((e) => {
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

    if (settings?.compress) {
      output = AbstractOutputWriter.compress(output);
      this.logger.debug(`compressed message size: ${output.length}`);
      attributes['compression'] = {
        DataType: 'String',
        StringValue: 'zlib',
      };
      attributes['encoding'] = {
        DataType: 'String',
        StringValue: 'base64',
      };
    }
    return [attributes, output];
  }

  protected async writeSQS() {
    const config = getAwsConfig();
    const sqs = new SQSClient(Object.assign(config, { useQueueUrlAsEndpoint: false }));
    const [attributes, output] = this.generateMessageOutput(this.options.sqs);
    this.logger.info(`Sending message to sqs ${this.options.sqs?.url}`);
    return sqs.send(
      new SendMessageCommand({
        QueueUrl: this.options.sqs?.url,
        MessageBody: output,
        MessageAttributes: attributes,
      }),
    );
  }

  protected async writeSNS() {
    const config = getAwsConfig();
    // const sqs = new SQSClient(Object.assign(config, { useQueueUrlAsEndpoint: false }));
    const sns = new SNSClient(config);
    const [attributes, output] = this.generateMessageOutput(this.options.sqs);
    this.logger.info(`Sending message to SNS ${this.options.sqs?.url}`);
    return sns.send(
      new PublishCommand({
        TopicArn: this.options.sns?.url,
        Message: output,
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
    if (this.options.sns) {
      promises.push(this.writeSNS());
    }
    return Promise.all(promises);
  }
}

/**
 * Generate a CSV table of data specified in a {@link DataTable}
 */
export class ObjectLogCsv extends AbstractOutputWriter {
  private readonly dataTable: DataTable;
  private skipHeaders = false;
  private prependOutput = '';

  constructor(dataTable: DataTable, options: WriteOptions, context?: WriterContext) {
    super(options, context);
    this.dataTable = dataTable;
  }

  getOutput(): string {
    // Return the dataTable as a CSV with headers unless this.skipHeaders
    return (
      this.prependOutput +
      stringify(this.dataTable.data(), {
        header: !this.skipHeaders,
        columns: this.dataTable.header(),
      })
    );
  }

  protected async writeFile() {
    // Write the DataTable to the configured file as CSV, omitting headers and appending if the file already exists.
    const outputExists = existsSync(this.resolveFilename(this.options.file));
    try {
      this.skipHeaders = this.options.append === true && outputExists;
      return super.writeFile();
    } finally {
      this.skipHeaders = false;
    }
  }

  private async getS3ObjectBody(): Promise<string> {
    // Return the contents of the configured output file, or '' if it doesn't exist
    const config = getAwsConfig(this.options.s3?.region);
    const s3 = new S3Client(config);
    const path = this.resolveFilename(this.options.s3?.path);
    try {
      const configObject = await s3.send(new GetObjectCommand({ Bucket: this.options.s3?.bucket, Key: path }));
      return await configObject.Body!.transformToString();
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return '';
      }
      throw error; // rethrow any other exceptions
    }
  }

  protected async writeS3() {
    // Write the DataTable to the configured S3 Object as CSV, omitting headers and appending if the file already exists.
    try {
      if (this.options.append) {
        this.prependOutput = await this.getS3ObjectBody();
        this.skipHeaders = this.prependOutput !== '';
      }
      return super.writeS3();
    } finally {
      this.skipHeaders = false;
      this.prependOutput = '';
    }
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
      'METADATA',
    ]);
  }
  data(): string[][] {
    const removed = { matches: undefined, actionNames: undefined }; // Remove some values from e.metadata
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
        JSON.stringify(Object.assign({}, e?.metadata, removed)),
      ]),
    );
  }
}

// Reset the list of files that have been written in this cycle
export function resetFileLogger() {
  AbstractOutputWriter.filesWritten = [];
}
