import ExcelJS from 'exceljs';
import { buildCoop, COOP_HEAD, monthLabel } from './ui/coopView.js';

const TITLE = 'FF243B53';
const HEADER_FILL = 'FFE7EDF3';
const HEADER_TEXT = 'FF263746';
const THIN = { style: 'thin', color: { argb: 'FFD5DCE3' } };
const amountFormat = '#,##0.00;[Red](#,##0.00);-';

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const n = value => Number(value) || 0;

function rowFor({ c, g }) {
  return [
    c.name || '', c.department || '', n(c.days), n(c.kmOut), n(c.kmIn), n(g.km),
    c.contract || '', c.start || '', c.end || '', n(g.charge), g.vehicle || '',
    n(g.fuel), n(g.driver), n(g.allowance), n(g.total), c.rentalId ? `Yes${g.reg ? ` · ${g.reg}` : ''}` : 'To complete'
  ];
}

export async function makeCoopSchedule(data, { month = 'all', line = 'all', vat = false, now = new Date() } = {}) {
  const report = buildCoop(data, localDate(now), { month, line, vat });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FleetPilot';
  workbook.created = now;
  const worksheet = workbook.addWorksheet('Coop');
  const columns = COOP_HEAD.map(([label]) => label);
  const monthText = monthLabel(month);
  const title = worksheet.addRow([`FLEET-WIDE — COOP SCHEDULE (${monthText.toUpperCase()})`]);
  worksheet.mergeCells(1, 1, 1, columns.length);
  title.height = 26;
  title.getCell(1).font = { bold: true, size: 14, color: { argb: TITLE } };
  title.getCell(1).alignment = { vertical: 'middle' };
  worksheet.addRow([]);
  const header = worksheet.addRow(columns);
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: THIN };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  const dataRows = report.lines.map(item => rowFor(item));
  dataRows.forEach(row => worksheet.addRow(row));
  const total = report.totals;
  const totalRow = worksheet.addRow([
    'TOTAL', '', total.days, '', '', total.km, '', '', '', total.charge, '',
    total.fuel, total.driver, total.allowance, total.total, ''
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell(cell => { cell.border = { top: THIN }; });
  const dataSheetRows = dataRows.length ? worksheet.getRows(4, dataRows.length) : [];
  for (const row of dataSheetRows) {
    for (const column of [3, 4, 5, 6]) row.getCell(column).numFmt = '#,##0.##';
    for (const column of [10, 12, 13, 14, 15]) row.getCell(column).numFmt = amountFormat;
  }
  for (const column of [10, 12, 13, 14, 15]) totalRow.getCell(column).numFmt = amountFormat;
  for (const column of [3, 4, 5, 6]) totalRow.getCell(column).numFmt = '#,##0.##';

  for (let column = 1; column <= columns.length; column++) {
    const widest = Math.max(columns[column - 1].length, ...dataRows.map(row => String(row[column - 1] == null ? '' : row[column - 1]).length));
    worksheet.getColumn(column).width = Math.min(32, Math.max(11, widest + 2));
  }
  worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + dataRows.length, column: columns.length } };
  worksheet.views = [{ state: 'frozen', ySplit: 3, topLeftCell: 'A4', showGridLines: false }];
  worksheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const bytes = await workbook.xlsx.writeBuffer();
  const suffix = month === 'all' ? 'all-months' : month;
  return { bytes, name: `FleetPilot-Coop-${suffix}.xlsx`, total: dataRows.length };
}
