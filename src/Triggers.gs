var TRIGGER_FUNCTIONS = [
  "sendWeeklyReminderToUsers",
  "sendWeeklySummaryToAdmin",
  "checkAndSendBakingEveInfo",
  "processEmailQueue"
];

function checkAndSendBakingEveInfo() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  var weekStart = getWeekStart(tomorrow);
  var bakingDate = getBakingDate(weekStart);

  if (formatDateISO(bakingDate) === formatDateISO(tomorrow)) {
    sendBakingEveInfoToAdmin(weekStart);
  }
}

function processEmailQueue() {
  processQueue();
}

function setupTriggers() {
  _deleteNamedTriggers(TRIGGER_FUNCTIONS);

  ScriptApp.newTrigger("sendWeeklyReminderToUsers")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  ScriptApp.newTrigger("sendWeeklySummaryToAdmin")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(20)
    .create();

  ScriptApp.newTrigger("checkAndSendBakingEveInfo")
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();

  ScriptApp.newTrigger("processEmailQueue")
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
}

function deleteTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
}

function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log("Žádné aktivní triggery.");
    return;
  }
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    var eventType = t.getEventType();
    var handlerFunction = t.getHandlerFunction();
    var triggerSource = t.getTriggerSource();
    Logger.log(
      "Funkce: " + handlerFunction +
      " | Zdroj: " + triggerSource +
      " | Typ události: " + eventType +
      " | ID: " + t.getUniqueId()
    );
  }
}

function _deleteNamedTriggers(functionNames) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    for (var j = 0; j < functionNames.length; j++) {
      if (fn === functionNames[j]) {
        ScriptApp.deleteTrigger(triggers[i]);
        break;
      }
    }
  }
}
