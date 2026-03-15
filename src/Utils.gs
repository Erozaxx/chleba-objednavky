var CZ_DAYS = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];
var CZ_MONTHS = ["ledna", "února", "března", "dubna", "května", "června",
                 "července", "srpna", "září", "října", "listopadu", "prosince"];

/**
 * Vrátí datum pondělí daného týdne s časem nastaveným na půlnoc.
 */
function getWeekStart(date) {
  if (!date) return null;
  var d = new Date(date.getTime());
  var day = d.getDay(); // 0=Ne, 1=Po, ..., 6=So
  var diff = (day === 0) ? -6 : 1 - day; // posun na pondělí
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Vrátí den pečení (1-7) pro daný týden.
 * Čte override z week_settings; pokud neexistuje → CONFIG.DEFAULT_BAKING_DAY.
 */
function getBakingDay(weekStart) {
  if (!weekStart) return CONFIG.DEFAULT_BAKING_DAY;
  var sheet = getSheet("week_settings");
  var data = sheet.getDataRange().getValues();
  var weekISO = formatDateISO(weekStart);
  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][0];
    var rowISO = (rowDate instanceof Date) ? formatDateISO(rowDate) : String(rowDate);
    if (rowISO === weekISO) {
      var bakingDay = data[i][1];
      return (bakingDay !== "" && bakingDay !== null) ? Number(bakingDay) : CONFIG.DEFAULT_BAKING_DAY;
    }
  }
  return CONFIG.DEFAULT_BAKING_DAY;
}

/**
 * Vrátí Date object skutečného dne pečení pro daný týden.
 * weekStart = pondělí, bakingDay 1=Po .. 7=Ne → offset = bakingDay - 1 dní.
 */
function getBakingDate(weekStart) {
  if (!weekStart) return null;
  var bDay = getBakingDay(weekStart);
  var d = new Date(weekStart.getTime());
  d.setDate(d.getDate() + (bDay - 1));
  return d;
}

/**
 * Vrátí pole ISO datumů (YYYY-MM-DD) weekStart pro příštích n otevřených týdnů s pečením.
 * Přeskočí closed týdny. Začíná od prvního budoucího dne pečení (s ohledem na cutoff).
 */
function getUpcomingBakingWeeks(n) {
  var result = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidate = getWeekStart(today);
  var checked = 0;
  var maxIterations = n + 52; // ochrana před nekonečnou smyčkou

  while (result.length < n && checked < maxIterations) {
    var bakingDate = getBakingDate(candidate);
    var cutoffTime = new Date(bakingDate.getTime());
    cutoffTime.setDate(cutoffTime.getDate() - 1);
    cutoffTime.setHours(CONFIG.ORDER_CUTOFF_HOUR, 0, 0, 0);

    var now = new Date();
    var isPastCutoff = now >= cutoffTime;

    if (!isPastCutoff && !_isClosedWeek(candidate)) {
      result.push(formatDateISO(candidate));
    }

    candidate = new Date(candidate.getTime());
    candidate.setDate(candidate.getDate() + 7);
    checked++;
  }

  return result;
}

/**
 * Vrátí TRUE pokud je aktuální čas před cutoffem pro daný týden.
 * Cutoff = den před dnem pečení v hodinu CONFIG.ORDER_CUTOFF_HOUR.
 */
function isBeforeCutoff(weekStart) {
  if (!weekStart) return false;
  var bakingDate = getBakingDate(weekStart);
  var cutoff = new Date(bakingDate.getTime());
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(CONFIG.ORDER_CUTOFF_HOUR, 0, 0, 0);
  return new Date() < cutoff;
}

/**
 * Vrátí datum ve formátu "pátek 21. 3. 2026" v češtině.
 */
function formatDateCZ(date) {
  if (!date) return "";
  var dow = date.getDay(); // 0=Ne
  var dayIndex = (dow === 0) ? 6 : dow - 1; // převod na 0=Po..6=Ne
  var dayName = CZ_DAYS[dayIndex];
  var day = date.getDate();
  var month = date.getMonth(); // 0-based
  var year = date.getFullYear();
  return dayName + " " + day + ". " + (month + 1) + ". " + year;
}

/**
 * Vrátí datum ve formátu "YYYY-MM-DD".
 */
function formatDateISO(date) {
  if (!date) return "";
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1);
  var d = String(date.getDate());
  if (m.length < 2) m = "0" + m;
  if (d.length < 2) d = "0" + d;
  return y + "-" + m + "-" + d;
}

/**
 * Parsuje "YYYY-MM-DD" → Date object (půlnoc lokálního času).
 */
function parseISO(dateStr) {
  if (!dateStr) return null;
  var parts = String(dateStr).split("-");
  if (parts.length !== 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
}

/**
 * Generuje UUID pomocí GAS utility.
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Vrátí sheet podle názvu; vyhodí Error pokud neexistuje.
 */
function getSheet(name) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet '" + name + "' neexistuje.");
  return sheet;
}

/**
 * Převede integer 1-7 na český název dne (pondělí..neděle).
 */
function dayOfWeekToName(dow) {
  if (dow < 1 || dow > 7) return "";
  return CZ_DAYS[dow - 1];
}

/**
 * Interní helper: vrátí TRUE pokud je týden uzavřen v week_settings.
 */
function _isClosedWeek(weekStart) {
  if (!weekStart) return false;
  try {
    var sheet = getSheet("week_settings");
    var data = sheet.getDataRange().getValues();
    var weekISO = formatDateISO(weekStart);
    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][0];
      var rowISO = (rowDate instanceof Date) ? formatDateISO(rowDate) : String(rowDate);
      if (rowISO === weekISO) {
        return data[i][2] === true;
      }
    }
  } catch (e) {
    // week_settings sheet neexistuje – vrátíme false (nic není uzavřeno)
  }
  return false;
}
