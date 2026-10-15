// Writes the badge list as an .xlsx in the vendor's layout: row 1 is the
// event title, row 2 the column headers, data from row 3. Mobile numbers are
// written as text so Excel cannot turn them into 9.85E+09.
//
// exceljs is loaded on demand — it is only needed the moment someone exports.

import { BADGE_COLUMNS, badgeSheetRow, type BadgeFields } from './badgeList';

export async function downloadBadgeWorkbook(fields: BadgeFields[], fileName: string, title = 'GANSID Congress 2026'): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow([title]);
  ws.getRow(1).font = { bold: true, size: 14 };
  const header = ws.addRow([...BADGE_COLUMNS]);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  const mobileCol = BADGE_COLUMNS.indexOf('*Mobile') + 1;
  fields.forEach((f, i) => {
    const row = ws.addRow(badgeSheetRow(i + 1, f));
    row.getCell(mobileCol).numFmt = '@';
    row.getCell(mobileCol).value = f.mobile;
  });
  const widths = [7, 14, 8, 8, 8, 8, 8, 9, 10, 30, 24, 16, 32, 14, 30, 30, 30, 14, 14, 18, 12, 20];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
