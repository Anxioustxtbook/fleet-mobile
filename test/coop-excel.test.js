import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createExcelFiles } from '../src/excelFiles.js';

const data = {
  coops: [{ id: 1, name: 'JANE', department: 'HR', start: '2026-11-02', end: '2026-11-04', days: 3, amount: 9000, kmOut: 100, kmIn: 250, contract: 'JC1', rentalId: 5 }],
  rentals: [{ id: 5, vehicleId: 1, clientId: 1, type: 'coop', pickup: '2026-11-02', return: '2026-11-04', days: 3, amount: 9000, fuel: 500, allowance: 300, status: 'Completed', contract: 'JC1' }],
  clients: [{ id: 1, name: 'ACME' }],
  vehicles: [{ id: 1, reg: 'KDA 111A', model: 'Axio' }],
  expenses: []
};

test('Coop export uses the desktop schedule columns, selected period, and summary totals', async () => {
  const saved = [];
  const service = createExcelFiles({
    records: { async all(list) { return data[list] || []; } },
    backup: {},
    platform: { fs: { async shareExcel(name, bytes) { saved.push({ name, bytes }); } } },
    now: () => new Date(2026, 10, 16)
  });

  const result = await service.exportCoop({ month: '2026-11', line: 'all', vat: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(saved[0].bytes);
  const sheet = workbook.getWorksheet('Coop');

  assert.equal(result.total, 1);
  assert.equal(saved[0].name, 'FleetPilot-Coop-2026-11.xlsx');
  assert.equal(sheet.getRow(3).getCell(1).value, 'Name of staff served');
  assert.equal(sheet.getRow(4).getCell(1).value, 'JANE');
  assert.equal(sheet.getRow(4).getCell(6).value, 150);
  assert.equal(sheet.getRow(4).getCell(15).value, 9800);
  assert.equal(sheet.getRow(5).getCell(1).value, 'TOTAL');
  assert.equal(sheet.getRow(5).getCell(15).value, 9800);
  assert.equal(sheet.getRow(3).getCell(1).fill.fgColor.argb, 'FFE7EDF3');
  assert.equal(sheet.views[0].state, 'frozen');
});
