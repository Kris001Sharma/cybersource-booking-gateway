// Paste this into Extensions > Apps Script on your Google Sheet, then
// Deploy > New deployment > Web app (Execute as: Me, Access: Anyone with the
// link). Copy the resulting URL into the Worker as
// SHEET_WEBAPP_URL = https://script.google.com/macros/s/AKfycbwFqiwuF_xV0YreAehDBc1sDSNInrnTQgidYCvkwHinxoWEN7krFxkhCvtnY8g3qh5faw/exec
//
// Expects a "Bookings" sheet with header row:
// bookingId | items | total | amountDue | guest | status | paymentMethod | createdAt


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
      body.paymentMethod || "",
      body.createdAt,
    ]);
    return respond({ ok: true });
  }
  
  if (body.action === "update_booking_status") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.bookingId) {
        sheet.getRange(i + 1, 6).setValue(body.status); // column 6 = status
        if (body.guest) sheet.getRange(i + 1, 5).setValue(JSON.stringify(body.guest)); // column 5 = guest
        if (body.paymentMethod) sheet.getRange(i + 1, 7).setValue(body.paymentMethod); // column 7 = paymentMethod
        break;
      }
    }
    return respond({ ok: true });
  }
  
  if (body.action === "list_pending") {
    const data = sheet.getDataRange().getValues();
    const pending = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][5] === "pending") pending.push({ bookingId: data[i][0], createdAt: data[i][7] });
    }
    return respond({ ok: true, pending });
  }
  
  if (body.action === "get_booking") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.bookingId) {
        const booking = {
          bookingId: data[i][0],
          items: JSON.parse(data[i][1] || '[]'),
          total: data[i][2],
          amountDue: data[i][3],
          guest: JSON.parse(data[i][4] || '{}'),
          status: data[i][5],
          paymentMethod: data[i][6],
          createdAt: data[i][7],
        };
        return respond({ ok: true, booking });
      }
    }
    return respond({ ok: false, error: "Booking not found" });
  }
  
  return respond({ ok: false, error: "Unknown action" });
}
 
function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
