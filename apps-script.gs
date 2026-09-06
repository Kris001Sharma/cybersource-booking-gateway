// Paste this into Extensions > Apps Script on your Google Sheet, then
// Deploy > New deployment > Web app (Execute as: Me, Access: Anyone with the
// link). Copy the resulting URL into the Worker as
// SHEET_WEBAPP_URL = https://script.google.com/macros/s/AKfycbwyiw49qxEFEiyILPqLSFlmKlgdVOAbGF1UoW49UslDWcfVQ6XtiQH7IZzlT-UZWaBPqA/exec
//
// Expects a "Bookings" sheet with header row:
// bookingId | items | total | amountDue | guest | status | createdAt


function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings");
 
  if (body.action === "create_booking") {
    sheet.appendRow([
      body.bookingId,
      JSON.stringify(body.items),
      body.total,
      body.amountDue,
      JSON.stringify(body.guest || {}),
      body.status,
      body.createdAt,
    ]);
    return respond({ ok: true });
  }
 
  if (body.action === "update_booking_status") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.bookingId) {
        sheet.getRange(i + 1, 6).setValue(body.status); // column 6 = status
        break;
      }
    }
    return respond({ ok: true });
  }
 
  if (body.action === "list_pending") {
    const data = sheet.getDataRange().getValues();
    const pending = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][5] === "pending") pending.push({ bookingId: data[i][0], createdAt: data[i][6] });
    }
    return respond({ ok: true, pending });
  }
 
  return respond({ ok: false, error: "Unknown action" });
}
 
function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
 