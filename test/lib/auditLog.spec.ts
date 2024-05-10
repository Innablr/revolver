import { expect } from 'chai';
import { ActionAuditTable, ObjectLogCsv } from '../../lib/objectLog';
import { ActionAuditEntry } from '../../actions/audit';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

// A dummy AWS resource for testing
class FakeActionAuditEntry implements ActionAuditEntry {
  time: DateTime<boolean>;
  accountId: string;
  plugin: string;
  driver: string;
  resourceType: string;
  resourceId: string;
  status: string;
  action: string;
  reason: string;
  metadata: any;
  constructor(status: string, action: string, reason: string) {
    this.time = DateTime.fromISO('2024-02-27T09:12:33.018+11:00');
    this.accountId = randomBytes(20).toString('hex');
    this.plugin = 'fakeplugin';
    this.driver = 'fakedriver';
    this.resourceType = 'type_' + randomBytes(20).toString('hex');
    this.resourceId = 'id_' + randomBytes(20).toString('hex');
    this.status = status;
    this.action = action;
    this.reason = reason;
    this.metadata = { something: 'happened', colour: 'red' };
  }
}

const AUDIT_LOG_CONFIG = {
  // cost mostly already tested by RESOURCE_LOG_CONFIG
  csv: {
    file: 'auditlog-out.csv',
    reportTags: ['F1', 'F2'],
    append: true,
  },
};

const ACCOUNT_CONFIG = {
  settings: {
    name: 'dummyaccount',
  },
};

describe('Validate auditLog', function () {
  it('Check ObjectLogCsv audit', async function () {
    fs.rmSync(AUDIT_LOG_CONFIG.csv.file, { force: true });

    const entries = [
      new FakeActionAuditEntry('red', 'dosomething', 'just because'),
      new FakeActionAuditEntry('green', 'dosomething', 'another reason'),
      new FakeActionAuditEntry('blue', 'dosomething else', 'random'),
    ];
    await new ObjectLogCsv(
      new ActionAuditTable(ACCOUNT_CONFIG, entries, true),
      AUDIT_LOG_CONFIG.csv,
      ACCOUNT_CONFIG.settings,
    ).process();

    expect(fs.existsSync(AUDIT_LOG_CONFIG.csv.file)).to.be.true;

    const auditCsvText = fs.readFileSync(AUDIT_LOG_CONFIG.csv.file, 'utf-8');
    expect((auditCsvText.match(/\n/g) || []).length).to.equal(4); // number of rows
    expect(auditCsvText).to.include('dosomething,red,just because');
    expect(auditCsvText).to.include('dosomething,green,another reason');
    expect(auditCsvText).to.include('dosomething else,blue,random');

    // Parse the audit CSV back into records
    const records = parse(auditCsvText, { bom: true, columns: true });
    expect(records.length).to.equal(3);
    expect(records[0].STATUS).to.equal('red');
    expect(records[0].REASON).to.equal('just because');

    const r0_metadata = JSON.parse(records[0].METADATA);
    expect(r0_metadata.something).to.equal('happened');

    // Add some records and write (append)
    const entries2 = [
      new FakeActionAuditEntry('orange', 'dosomething', 'test1'),
      new FakeActionAuditEntry('pink', 'dosomething', 'test2'),
    ];
    await new ObjectLogCsv(
      new ActionAuditTable(ACCOUNT_CONFIG, entries2, true),
      AUDIT_LOG_CONFIG.csv,
      ACCOUNT_CONFIG.settings,
    ).process();

    // Check append
    expect(fs.existsSync(AUDIT_LOG_CONFIG.csv.file)).to.be.true;
    const auditCsvText2 = fs.readFileSync(AUDIT_LOG_CONFIG.csv.file, 'utf-8');
    const records2 = parse(auditCsvText2, { bom: true, columns: true });
    expect(records2.length).to.equal(5);
    expect(records2[3].STATUS).to.equal('orange');
    expect(records2[4].STATUS).to.equal('pink');
  });
});
