var WEEK_SETTINGS_COLS = {
  WEEK_START:  0,
  BAKING_DAY:  1,
  CLOSED:      2,
  REASON:      3,
  NOTIFIED_AT: 4
};

var WEEK_SETTINGS_HEADERS = ["weekStart", "bakingDay", "closed", "reason", "notifiedAt"];

function _getWeekSettingsSheet() {
  return getSheet("week_settings");
}

function _ensureWeekSettingsHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(WEEK_SETTINGS_HEADERS);
  }
}

function _findWeekRow(data, weekISO) {
  for (var i = 1; i < data.length; i++) {
    var cell = data[i][WEEK_SETTINGS_COLS.WEEK_START];
    var rowISO = (cell instanceof Date) ? formatDateISO(cell) : String(cell);
    if (rowISO === weekISO) return i;
  }
  return -1;
}

function _defaultSettings(weekStart) {
  return {
    weekStart:   weekStart,
    bakingDay:   CONFIG.DEFAULT_BAKING_DAY,
    closed:      false,
    reason:      "",
    notifiedAt:  null
  };
}

function _rowToSettings(row, weekISO) {
  var bakingDay = row[WEEK_SETTINGS_COLS.BAKING_DAY];
  var notifiedAt = row[WEEK_SETTINGS_COLS.NOTIFIED_AT];
  return {
    weekStart:  weekISO,
    bakingDay:  (bakingDay !== "" && bakingDay !== null && bakingDay !== undefined)
                  ? Number(bakingDay)
                  : CONFIG.DEFAULT_BAKING_DAY,
    closed:     row[WEEK_SETTINGS_COLS.CLOSED] === true,
    reason:     row[WEEK_SETTINGS_COLS.REASON] || "",
    notifiedAt: (notifiedAt instanceof Date) ? notifiedAt : null
  };
}

function getWeekSettings(weekStart) {
  if (!weekStart) return null;
  var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
  var sheet = _getWeekSettingsSheet();
  var data = sheet.getDataRange().getValues();
  var rowIdx = _findWeekRow(data, weekISO);
  if (rowIdx === -1) return _defaultSettings(weekISO);
  return _rowToSettings(data[rowIdx], weekISO);
}

function getUpcomingWeeksSettings(n) {
  var result = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidate = getWeekStart(today);
  for (var i = 0; i < n; i++) {
    var iso = formatDateISO(candidate);
    result.push(getWeekSettings(iso));
    candidate = new Date(candidate.getTime());
    candidate.setDate(candidate.getDate() + 7);
  }
  return result;
}

function setWeekClosed(weekStart, reason, notifiedAt) {
  if (!weekStart) return false;
  try {
    var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
    var notifiedVal = (notifiedAt instanceof Date) ? notifiedAt : "";
    var sheet = _getWeekSettingsSheet();
    _ensureWeekSettingsHeaders(sheet);
    var data = sheet.getDataRange().getValues();
    var rowIdx = _findWeekRow(data, weekISO);
    if (rowIdx === -1) {
      sheet.appendRow([weekISO, "", true, reason || "", notifiedVal]);
    } else {
      var sheetRow = rowIdx + 1;
      sheet.getRange(sheetRow, WEEK_SETTINGS_COLS.CLOSED + 1).setValue(true);
      sheet.getRange(sheetRow, WEEK_SETTINGS_COLS.REASON + 1).setValue(reason || "");
      sheet.getRange(sheetRow, WEEK_SETTINGS_COLS.NOTIFIED_AT + 1).setValue(notifiedVal);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function setWeekOpen(weekStart) {
  if (!weekStart) return false;
  try {
    var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
    var sheet = _getWeekSettingsSheet();
    var data = sheet.getDataRange().getValues();
    var rowIdx = _findWeekRow(data, weekISO);
    if (rowIdx === -1) return true;
    var bakingDay = data[rowIdx][WEEK_SETTINGS_COLS.BAKING_DAY];
    var hasBakingOverride = (bakingDay !== "" && bakingDay !== null && bakingDay !== undefined);
    if (!hasBakingOverride) {
      sheet.deleteRow(rowIdx + 1);
    } else {
      var sheetRow = rowIdx + 1;
      sheet.getRange(sheetRow, WEEK_SETTINGS_COLS.CLOSED + 1).setValue(false);
      sheet.getRange(sheetRow, WEEK_SETTINGS_COLS.REASON + 1).setValue("");
    }
    return true;
  } catch (e) {
    return false;
  }
}

function setBakingDayOverride(weekStart, bakingDay) {
  if (!weekStart || !bakingDay) return false;
  var day = Number(bakingDay);
  if (day < 1 || day > 7) return false;
  try {
    var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
    var sheet = _getWeekSettingsSheet();
    _ensureWeekSettingsHeaders(sheet);
    var data = sheet.getDataRange().getValues();
    var rowIdx = _findWeekRow(data, weekISO);
    if (rowIdx === -1) {
      sheet.appendRow([weekISO, day, false, "", ""]);
    } else {
      sheet.getRange(rowIdx + 1, WEEK_SETTINGS_COLS.BAKING_DAY + 1).setValue(day);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function clearBakingDayOverride(weekStart) {
  if (!weekStart) return false;
  try {
    var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
    var sheet = _getWeekSettingsSheet();
    var data = sheet.getDataRange().getValues();
    var rowIdx = _findWeekRow(data, weekISO);
    if (rowIdx === -1) return true;
    var isClosed = data[rowIdx][WEEK_SETTINGS_COLS.CLOSED] === true;
    if (!isClosed) {
      sheet.deleteRow(rowIdx + 1);
    } else {
      sheet.getRange(rowIdx + 1, WEEK_SETTINGS_COLS.BAKING_DAY + 1).setValue("");
    }
    return true;
  } catch (e) {
    return false;
  }
}

function setNotified(weekStart) {
  if (!weekStart) return false;
  try {
    var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
    var sheet = _getWeekSettingsSheet();
    var data = sheet.getDataRange().getValues();
    var rowIdx = _findWeekRow(data, weekISO);
    if (rowIdx === -1) return false;
    sheet.getRange(rowIdx + 1, WEEK_SETTINGS_COLS.NOTIFIED_AT + 1).setValue(new Date());
    return true;
  } catch (e) {
    return false;
  }
}

function isWeekClosed(weekStart) {
  if (!weekStart) return false;
  var settings = getWeekSettings(weekStart);
  return settings ? settings.closed : false;
}
