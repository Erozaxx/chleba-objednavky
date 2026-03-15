var ORDERS_COLS = { orderId: 0, userId: 1, productId: 2, weekStart: 3, quantity: 4, updatedAt: 5 };
var ARCHIVE_COLS = { archiveId: 0, orderId: 1, userId: 2, productId: 3, weekStart: 4, quantity: 5, archivedAt: 6, reason: 7 };

function _rowToOrder(row) {
  var ws = row[ORDERS_COLS.weekStart];
  return {
    orderId:   String(row[ORDERS_COLS.orderId]),
    userId:    String(row[ORDERS_COLS.userId]),
    productId: String(row[ORDERS_COLS.productId]),
    weekStart: (ws instanceof Date) ? formatDateISO(ws) : String(ws),
    quantity:  Number(row[ORDERS_COLS.quantity]),
    updatedAt: row[ORDERS_COLS.updatedAt]
  };
}

function getOrdersForUser(userId) {
  var sheet = getSheet("orders");
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ORDERS_COLS.userId]) === String(userId)) {
      result.push(_rowToOrder(data[i]));
    }
  }
  return result;
}

function getOrdersForWeek(weekStart) {
  var sheet = getSheet("orders");
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var ws = data[i][ORDERS_COLS.weekStart];
    var wsISO = (ws instanceof Date) ? formatDateISO(ws) : String(ws);
    if (wsISO === weekStart) {
      result.push(_rowToOrder(data[i]));
    }
  }
  return result;
}

function upsertOrders(userId, ordersArray) {
  if (!ordersArray || ordersArray.length === 0) return 0;

  var sheet = getSheet("orders");
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var processed = 0;

  // Fáze 1 – rozhodni co smazat, updatovat, insertovat
  var toDelete  = []; // pole sheet row indexů (1-based), sestupně smazáno ve fázi 2
  var toUpdate  = []; // [{sheetRow, quantity}]
  var toInsert  = []; // pole nových řádků

  for (var o = 0; o < ordersArray.length; o++) {
    var item = ordersArray[o];
    var productId = String(item.productId);
    var weekStart = String(item.weekStart);
    var quantity = Number(item.quantity);

    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      var rowUserId    = String(data[i][ORDERS_COLS.userId]);
      var rowProductId = String(data[i][ORDERS_COLS.productId]);
      var rowWS        = data[i][ORDERS_COLS.weekStart];
      var rowWSISO     = (rowWS instanceof Date) ? formatDateISO(rowWS) : String(rowWS);

      if (rowUserId === String(userId) && rowProductId === productId && rowWSISO === weekStart) {
        foundRow = i;
        break;
      }
    }

    if (quantity > 0) {
      if (foundRow >= 0) {
        toUpdate.push({ sheetRow: foundRow + 1, quantity: quantity });
      } else {
        toInsert.push([generateUUID(), String(userId), productId, weekStart, quantity, now]);
      }
      processed++;
    } else {
      if (foundRow >= 0) {
        toDelete.push(foundRow + 1);
        processed++;
      }
    }
  }

  // Fáze 2 – proveď operace v bezpečném pořadí

  // 1. Nejdříve updaty – žádné mazání ještě neproběhlo, indexy jsou stabilní
  for (var u = 0; u < toUpdate.length; u++) {
    var upd = toUpdate[u];
    sheet.getRange(upd.sheetRow, ORDERS_COLS.quantity + 1).setValue(upd.quantity);
    sheet.getRange(upd.sheetRow, ORDERS_COLS.updatedAt + 1).setValue(now);
  }

  // 2. Mazání od nejvyššího řádku dolů – nižší indexy (updatované) nejsou posunuty
  toDelete.sort(function(a, b) { return b - a; });
  for (var d = 0; d < toDelete.length; d++) {
    sheet.deleteRow(toDelete[d]);
  }

  // 3. Vložení nových řádků
  for (var n = 0; n < toInsert.length; n++) {
    sheet.appendRow(toInsert[n]);
  }

  return processed;
}

function archiveOrdersForWeek(weekStart, reason) {
  try {
    var ordersSheet  = getSheet("orders");
    var archiveSheet = getSheet("orders_archive");
    var data = ordersSheet.getDataRange().getValues();
    var now = new Date();
    var archived = 0;

    for (var i = 1; i < data.length; i++) {
      var ws = data[i][ORDERS_COLS.weekStart];
      var wsISO = (ws instanceof Date) ? formatDateISO(ws) : String(ws);
      if (wsISO === weekStart) {
        archiveSheet.appendRow([
          generateUUID(),
          String(data[i][ORDERS_COLS.orderId]),
          String(data[i][ORDERS_COLS.userId]),
          String(data[i][ORDERS_COLS.productId]),
          weekStart,
          Number(data[i][ORDERS_COLS.quantity]),
          now,
          String(reason)
        ]);
        archived++;
      }
    }

    return archived;
  } catch (e) {
    throw new Error("Archivace objednávek selhala: " + e.message);
  }
}

function deleteOrdersForWeek(weekStart) {
  var sheet = getSheet("orders");
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var ws = data[i][ORDERS_COLS.weekStart];
    var wsISO = (ws instanceof Date) ? formatDateISO(ws) : String(ws);
    if (wsISO === weekStart) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  return rowsToDelete.length;
}

function getUsersWithOrdersForWeek(weekStart) {
  var sheet = getSheet("orders");
  var data = sheet.getDataRange().getValues();
  var seen = {};
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var ws = data[i][ORDERS_COLS.weekStart];
    var wsISO = (ws instanceof Date) ? formatDateISO(ws) : String(ws);
    if (wsISO === weekStart && Number(data[i][ORDERS_COLS.quantity]) > 0) {
      var uid = String(data[i][ORDERS_COLS.userId]);
      if (!seen[uid]) {
        seen[uid] = true;
        result.push(uid);
      }
    }
  }

  return result;
}
