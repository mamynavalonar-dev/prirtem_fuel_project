const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
  detectExcelType,
  MAX_WORKBOOK_SHEETS
} = require('../src/utils/excel/detectType');

function workbookBuffer(sheetCount) {
  const workbook = XLSX.utils.book_new();
  for (let index = 0; index < sheetCount; index += 1) {
    const sheet = XLSX.utils.aoa_to_sheet([['Suivi carburant']]);
    XLSX.utils.book_append_sheet(workbook, sheet, `F${index + 1}`);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('an annual workbook with more than 20 sheets is accepted', () => {
  const result = detectExcelType(workbookBuffer(24), 'Suivi carburant 39111WWT 2024.xlsx');
  assert.equal(result.type, 'VEHICLE');
  assert.equal(result.workbook.SheetNames.length, 24);
});

test('a workbook above the controlled sheet limit is rejected', () => {
  assert.throws(
    () => detectExcelType(
      workbookBuffer(MAX_WORKBOOK_SHEETS + 1),
      'Suivi carburant 39111WWT 2024.xlsx'
    ),
    /WORKBOOK_SHEET_LIMIT_EXCEEDED/
  );
});
