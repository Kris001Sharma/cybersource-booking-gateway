// Paste this into Extensions > Apps Script on your Google Sheet, then
// Deploy > New deployment > Web app (Execute as: Me, Access: Anyone with the
// link). Copy the resulting URL into the Worker as
// SHEET_WEBAPP_URL = https://script.google.com/macros/s/AKfycbwFqiwuF_xV0YreAehDBc1sDSNInrnTQgidYCvkwHinxoWEN7krFxkhCvtnY8g3qh5faw/exec
//
// Expects a "Bookings" sheet with header row:
// bookingId | items | totalUsd | paidUsd | remainingUsd | totalNpr | paidNpr | remainingNpr | firstName | lastName | email | phone | country | notes | status | paymentMethod | createdAt
//
// Set the separate admin-only archive file ID in Apps Script project properties:
// ARCHIVE_SPREADSHEET_ID = the ID of the "Bookings Archive" spreadsheet.


function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings");
  if (!sheet) return respond({ ok: false, error: "Bookings sheet not found" });
  const columnsResult = getColumns(sheet);
  if (!columnsResult.ok) return respond(columnsResult);
  const columns = columnsResult.columns;
  
  if (body.action === "create_booking") {
    const guest = body.guest || {};
    const row = Array(sheet.getLastColumn()).fill("");
    setColumn(row, columns, "bookingId", body.bookingId);
    setColumn(row, columns, "items", JSON.stringify(body.items));
    setColumn(row, columns, "totalUsd", body.totalUsd);
    setColumn(row, columns, "paidUsd", body.paidUsd || 0);
    setColumn(row, columns, "remainingUsd", body.remainingUsd || 0);
    setColumn(row, columns, "totalNpr", body.totalNpr || 0);
    setColumn(row, columns, "paidNpr", body.paidNpr || 0);
    setColumn(row, columns, "remainingNpr", body.remainingNpr || 0);
    setColumn(row, columns, "firstName", guest.firstName || "");
    setColumn(row, columns, "lastName", guest.lastName || "");
    setColumn(row, columns, "email", guest.email || "");
    setColumn(row, columns, "phone", guest.phone || "");
    setColumn(row, columns, "country", guest.country || "");
    setColumn(row, columns, "notes", guest.notes || "");
    setColumn(row, columns, "status", body.status);
    setColumn(row, columns, "paymentMethod", body.paymentMethod || "");
    setColumn(row, columns, "createdAt", body.createdAt);
    sheet.appendRow(row);
    return respond({ ok: true });
  }
  
  if (body.action === "update_booking_status") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][columns.bookingId - 1] === body.bookingId) {
        const rowNumber = i + 1;
        if (rowNumber <= 1) return respond({ ok: false, error: "Refusing to update header row" });
        const guest = body.guest || {};
        const legacy = false;
        if (legacy) {
          return respond({ ok: false, error: "Legacy row cannot be updated under the structured schema" });
        } else {
          setCell(sheet, rowNumber, columns, "status", body.status);
          if (body.status === "paid") {
            setCell(sheet, rowNumber, columns, "paidUsd", body.paidUsd || data[i][columns.paidUsd - 1] || 0);
            setCell(sheet, rowNumber, columns, "remainingUsd", Math.max(0, Number(data[i][columns.totalUsd - 1] || 0) - Number(body.paidUsd || 0)));
            setCell(sheet, rowNumber, columns, "paidNpr", body.paidNpr || data[i][columns.paidNpr - 1] || 0);
            setCell(sheet, rowNumber, columns, "remainingNpr", Math.max(0, Number(data[i][columns.totalNpr - 1] || 0) - Number(body.paidNpr || 0)));
          }
          if (body.guest) {
            const values = [guest.firstName, guest.lastName, guest.email, guest.phone, guest.country, guest.notes || body.errorMessage];
            ["firstName", "lastName", "email", "phone", "country", "notes"].forEach((field, offset) => { if (values[offset] !== undefined && values[offset] !== null && values[offset] !== "") setCell(sheet, rowNumber, columns, field, values[offset]); });
          }
          if (body.errorMessage) setCell(sheet, rowNumber, columns, "notes", String(body.errorMessage).slice(0, 500));
          if (body.paymentMethod) setCell(sheet, rowNumber, columns, "paymentMethod", body.paymentMethod);
          if (body.status === "paid") archiveRows([sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0]]);
        }
        break;
      }
    }
    return respond({ ok: true });
  }

  if (body.action === "update_booking_guest") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][columns.bookingId - 1] === body.bookingId && getStatus(data[i], columns) === "pending") {
        const guest = body.guest || {};
          ["firstName", "lastName", "email", "phone", "country", "notes"].forEach((field) => setCell(sheet, i + 1, columns, field, guest[field] || ""));
        return respond({ ok: true });
      }
    }
    return respond({ ok: false, error: "Pending booking not found" });
  }
  
  if (body.action === "list_pending") {
    const data = sheet.getDataRange().getValues();
    const pending = [];
    for (let i = 1; i < data.length; i++) {
      if (getStatus(data[i], columns) === "pending") pending.push({ bookingId: data[i][columns.bookingId - 1], createdAt: getCreatedAt(data[i], columns) });
    }
    return respond({ ok: true, pending });
  }
  
  if (body.action === "get_booking") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][columns.bookingId - 1] === body.bookingId) {
        const booking = {
          bookingId: data[i][0],
          items: JSON.parse(data[i][1] || '[]'),
          totalUsd: data[i][columns.totalUsd - 1],
          paidUsd: data[i][columns.paidUsd - 1],
          remainingUsd: data[i][columns.remainingUsd - 1],
          totalNpr: data[i][columns.totalNpr - 1],
          paidNpr: data[i][columns.paidNpr - 1],
          remainingNpr: data[i][columns.remainingNpr - 1],
          guest: readGuest(data[i], columns),
          status: data[i][columns.status - 1],
          paymentMethod: data[i][columns.paymentMethod - 1],
          createdAt: data[i][columns.createdAt - 1],
        };
        return respond({ ok: true, booking });
      }
    }
    return respond({ ok: false, error: "Booking not found" });
  }

  if (body.action === "archive_paid") {
    const rows = sheet.getDataRange().getValues().slice(1).filter((row) => getStatus(row, columns) === "paid");
    const result = archiveRows(rows);
    return respond({ ok: true, archived: result.archived, skipped: result.skipped });
  }

  if (body.action === "archive_stale_pending") {
    const thresholdMinutes = Number(body.thresholdMinutes) || 30;
    const failedThresholdMinutes = Number(body.failedThresholdMinutes) || 7 * 24 * 60;
    const now = Date.now();
    const data = sheet.getDataRange().getValues();
    const stale = [];
    for (let i = 1; i < data.length; i++) {
      const created = new Date(getCreatedAt(data[i], columns)).getTime();
      const status = getStatus(data[i], columns);
      const threshold = status === "failed" ? failedThresholdMinutes : thresholdMinutes;
      if ((status === "pending" || status === "failed") && Number.isFinite(created) && now - created > threshold * 60 * 1000) {
        stale.push({ rowNumber: i + 1, row: data[i] });
      }
    }
    stale.sort((a, b) => b.rowNumber - a.rowNumber).forEach((entry) => sheet.deleteRow(entry.rowNumber));
    return respond({ ok: true, archived: 0, deleted: stale.length, pendingThresholdMinutes: thresholdMinutes, failedThresholdMinutes });
  }

  if (body.action === "remove_non_paid_archive_rows") {
    const result = removeNonPaidArchiveRows();
    return respond(result);
  }
  
  return respond({ ok: false, error: "Unknown action" });
}

const REQUIRED_COLUMNS = ["bookingId", "items", "totalUsd", "paidUsd", "remainingUsd", "totalNpr", "paidNpr", "remainingNpr", "firstName", "lastName", "email", "phone", "country", "notes", "status", "paymentMethod", "createdAt"];

function getColumns(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((value) => String(value).trim());
  const columns = {};
  const duplicates = [];
  headers.forEach((header, index) => {
    if (!header) return;
    if (columns[header]) duplicates.push(header);
    columns[header] = index + 1;
  });
  const missing = REQUIRED_COLUMNS.filter((name) => !columns[name]);
  if (duplicates.length || missing.length) return { ok: false, error: "Bookings header schema mismatch", missing, duplicates };
  return { ok: true, columns };
}

function setColumn(row, columns, name, value) {
  row[columns[name] - 1] = value;
}

function setCell(sheet, rowNumber, columns, name, value) {
  if (rowNumber <= 1) throw new Error("Refusing to update header row");
  sheet.getRange(rowNumber, columns[name]).setValue(value);
}

function readGuest(row, columns) {
  // Rows written before the structured schema retain the old JSON guest cell.
  return {
    firstName: row[columns.firstName - 1] || "",
    lastName: row[columns.lastName - 1] || "",
    email: row[columns.email - 1] || "",
    phone: row[columns.phone - 1] || "",
    country: row[columns.country - 1] || "",
    notes: row[columns.notes - 1] || "",
  };
}

function getStatus(row, columns) { return row[columns.status - 1] || ""; }
function getCreatedAt(row, columns) { return row[columns.createdAt - 1] || ""; }

function archiveRows(rows) {
  const id = PropertiesService.getScriptProperties().getProperty("ARCHIVE_SPREADSHEET_ID");
  if (!id) return { archived: 0, skipped: rows.length, failed: true, error: "ARCHIVE_SPREADSHEET_ID is not configured" };
  try {
    const archive = SpreadsheetApp.openById(id).getSheetByName("Bookings Archive") || SpreadsheetApp.openById(id).getSheets()[0];
    if (archive.getLastRow() === 0) archive.appendRow(["bookingId", "items", "totalUsd", "paidUsd", "remainingUsd", "totalNpr", "paidNpr", "remainingNpr", "firstName", "lastName", "email", "phone", "country", "notes", "status", "paymentMethod", "createdAt"]);
    const existing = archive.getLastRow() > 1 ? archive.getRange(2, 1, archive.getLastRow() - 1, 1).getValues().flat() : [];
    const known = new Set(existing);
    const fresh = rows
      .map(normalizeArchiveRow)
      .filter((row) => row[0] && row[14] === "paid" && !known.has(row[0]));
    if (fresh.length) archive.getRange(archive.getLastRow() + 1, 1, fresh.length, 17).setValues(fresh);
    return { archived: fresh.length, skipped: rows.length - fresh.length };
  } catch (err) {
    return { archived: 0, skipped: 0, failed: true, error: String(err) };
  }
}

function removeNonPaidArchiveRows() {
  const id = PropertiesService.getScriptProperties().getProperty("ARCHIVE_SPREADSHEET_ID");
  if (!id) return { ok: false, error: "ARCHIVE_SPREADSHEET_ID is not configured", deleted: 0 };
  try {
    const spreadsheet = SpreadsheetApp.openById(id);
    const archive = spreadsheet.getSheetByName("Bookings Archive") || spreadsheet.getSheets()[0];
    const lastRow = archive.getLastRow();
    if (lastRow <= 1) return { ok: true, deleted: 0 };
    const rows = archive.getRange(2, 1, lastRow - 1, 17).getValues();
    const nonPaidRows = [];
    rows.forEach((row, index) => {
      if (row[14] !== "paid") nonPaidRows.push(index + 2);
    });
    nonPaidRows.sort((a, b) => b - a).forEach((rowNumber) => archive.deleteRow(rowNumber));
    return { ok: true, deleted: nonPaidRows.length };
  } catch (err) {
    return { ok: false, error: String(err), deleted: 0 };
  }
}

function normalizeArchiveRow(row) {
  if (row.length >= 17) return row.slice(0, 17);
  let guest = {};
  try { guest = JSON.parse(row[4] || "{}"); } catch (err) {}
  return [
    row[0], row[1], row[2], row[3] || 0, 0, row[3] || 0, 0, 0,
    guest.firstName || "", guest.lastName || "", guest.email || "", guest.phone || "",
    guest.country || "", guest.notes || "", row[5] || "", row[6] || "", row[7] || "",
  ];
}
 
function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
