var USERS_SHEET = "users";
var USERS_COLS = { userId: 0, name: 1, email: 2, token: 3, active: 4, created: 5 };

function _rowToUser(row) {
  return {
    userId:  row[USERS_COLS.userId],
    name:    row[USERS_COLS.name],
    email:   row[USERS_COLS.email],
    token:   row[USERS_COLS.token],
    active:  row[USERS_COLS.active] === true,
    created: row[USERS_COLS.created]
  };
}

function getAllUsers() {
  var sheet = getSheet(USERS_SHEET);
  var data = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][USERS_COLS.userId] !== "") {
      users.push(_rowToUser(data[i]));
    }
  }
  users.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "cs");
  });
  return users;
}

function getUserByToken(token) {
  if (!token) return null;
  var sheet = getSheet(USERS_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][USERS_COLS.token] === token) {
      return _rowToUser(data[i]);
    }
  }
  return null;
}

function getUserById(userId) {
  if (!userId) return null;
  var sheet = getSheet(USERS_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][USERS_COLS.userId] === userId) {
      return _rowToUser(data[i]);
    }
  }
  return null;
}

function createUser(name, email) {
  var sheet = getSheet(USERS_SHEET);
  var userId = generateUUID();
  var token = generateUUID();
  var created = new Date();
  sheet.appendRow([userId, name, email, token, true, created]);
  return { userId: userId, name: name, email: email, token: token, active: true, created: created };
}

function setUserActive(userId, active) {
  if (!userId) return false;
  var sheet = getSheet(USERS_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][USERS_COLS.userId] === userId) {
      sheet.getRange(i + 1, USERS_COLS.active + 1).setValue(active === true);
      return true;
    }
  }
  return false;
}

function resetUserToken(userId) {
  if (!userId) return null;
  var sheet = getSheet(USERS_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][USERS_COLS.userId] === userId) {
      var newToken = generateUUID();
      sheet.getRange(i + 1, USERS_COLS.token + 1).setValue(newToken);
      return newToken;
    }
  }
  return null;
}

function getUserPersonalizedUrl(token) {
  return CONFIG.DEPLOYMENT_URL + "?token=" + token;
}
