function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};

    if (params.token !== undefined) {
      var userId = _lookupUserByToken(params.token);
      if (userId) {
        return renderCustomerPage(userId);
      }
      return renderNotFound();
    }

    if (params.admin !== undefined) {
      if (params.admin === CONFIG.ADMIN_TOKEN) {
        return renderAdminPage();
      }
      return renderNotFound();
    }

    return renderNotFound();
  } catch (err) {
    return renderNotFound();
  }
}

function _lookupUserByToken(token) {
  if (!token) return null;
  try {
    var sheet = getSheet("users");
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var rowToken = String(data[i][3]);
      if (rowToken === token) {
        var active = data[i][4];
        if (active === true || active === "TRUE" || active === 1) {
          return String(data[i][0]);
        }
        return null;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function renderNotFound() {
  var html = '<!DOCTYPE html><html><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="referrer" content="no-referrer">' +
    '<title>404 – Stránka nenalezena</title>' +
    '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}' +
    '.box{text-align:center;padding:2rem;}h1{font-size:4rem;margin:0;color:#ccc;}p{color:#555;}</style>' +
    '</head><body><div class="box"><h1>404</h1><p>Stránka nebyla nalezena.</p></div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle("Stránka nenalezena");
}
