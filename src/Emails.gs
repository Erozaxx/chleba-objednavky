function _getActiveProducts() {
  var sheet = getSheet("products");
  var data = sheet.getDataRange().getValues();
  var products = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== "" && data[i][3] === true) {
      products.push({
        productId: String(data[i][0]),
        name:      String(data[i][1]),
        sortOrder: Number(data[i][4])
      });
    }
  }
  products.sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  return products;
}

function _emailHeader(title) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:16px">' +
         '<h2 style="color:#5c4033;border-bottom:2px solid #c8a97e;padding-bottom:8px">' + title + '</h2>';
}

function _emailFooter() {
  return '<p style="margin-top:24px;color:#888;font-size:12px">Odesláno automaticky – neodpovídej na tento email.</p>' +
         '</div>';
}

function sendWeeklyReminderToUsers() {
  var users = getAllUsers();
  var products = _getActiveProducts();
  var weeksISO = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidate = getWeekStart(today);
  var checked = 0;
  while (weeksISO.length < 4 && checked < 56) {
    if (!_isClosedWeek(candidate)) {
      weeksISO.push(formatDateISO(candidate));
    }
    candidate = new Date(candidate.getTime());
    candidate.setDate(candidate.getDate() + 7);
    checked++;
  }

  var upcomingSettings = [];
  var horizonCandidate = getWeekStart(today);
  for (var w = 0; w < 8; w++) {
    var settings = getWeekSettings(formatDateISO(horizonCandidate));
    if (settings && settings.closed) {
      upcomingSettings.push(settings);
    }
    horizonCandidate = new Date(horizonCandidate.getTime());
    horizonCandidate.setDate(horizonCandidate.getDate() + 7);
  }

  for (var u = 0; u < users.length; u++) {
    var user = users[u];
    if (!user.active || !user.email) continue;

    var orders = getOrdersForUser(user.userId);
    var orderMap = {};
    for (var o = 0; o < orders.length; o++) {
      var key = orders[o].weekStart + "__" + orders[o].productId;
      orderMap[key] = orders[o].quantity;
    }

    var url = getUserPersonalizedUrl(user.token);
    var firstName = user.name.split(" ")[0];

    var body = _emailHeader("Týdenní přehled objednávek");
    body += '<p>Ahoj ' + firstName + ',</p>';
    body += '<p>tady je tvůj přehled objednávek na nejbližší 4 týdny:</p>';

    var hasAnyOrder = false;
    for (var i = 0; i < weeksISO.length; i++) {
      var weekISO = weeksISO[i];
      var weekDate = parseISO(weekISO);
      var bakingDate = getBakingDate(weekDate);
      var bakingLabel = formatDateCZ(bakingDate);

      var weekItems = [];
      for (var p = 0; p < products.length; p++) {
        var qty = orderMap[weekISO + "__" + products[p].productId];
        if (qty && qty > 0) {
          weekItems.push(products[p].name + ": " + qty + " ks");
          hasAnyOrder = true;
        }
      }

      body += '<div style="background:#fdf6ee;border-left:4px solid #c8a97e;padding:10px 14px;margin:12px 0">';
      body += '<strong>Pečení: ' + bakingLabel + '</strong><br>';
      if (weekItems.length > 0) {
        body += weekItems.join(", ");
      } else {
        body += '<em style="color:#999">žádná objednávka</em>';
      }
      body += '</div>';
    }

    if (!hasAnyOrder) {
      body += '<p>Zatím nemáš žádné objednávky. Chceš si něco dát? 🍞</p>';
    }

    if (upcomingSettings.length > 0) {
      body += '<p style="color:#c0392b"><strong>Upozornění:</strong> v nejbližším horizontu jsou zavřené týdny:</p><ul>';
      for (var c = 0; c < upcomingSettings.length; c++) {
        var cs = upcomingSettings[c];
        var closedDate = parseISO(cs.weekStart);
        var closedBaking = getBakingDate(closedDate);
        body += '<li>' + formatDateCZ(closedBaking) + (cs.reason ? " – " + cs.reason : "") + '</li>';
      }
      body += '</ul>';
    }

    body += '<p><a href="' + url + '" style="background:#5c4033;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Upravit objednávky</a></p>';
    body += _emailFooter();

    sendOrQueue(user.email, "Přehled objednávek chleba", body);
  }
}

function sendWeeklySummaryToAdmin() {
  var users = getAllUsers();
  var products = _getActiveProducts();

  var weeksISO = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var candidate = getWeekStart(today);
  for (var w = 0; w < 8; w++) {
    weeksISO.push(formatDateISO(candidate));
    candidate = new Date(candidate.getTime());
    candidate.setDate(candidate.getDate() + 7);
  }

  var allOrders = [];
  for (var i = 0; i < weeksISO.length; i++) {
    var weekOrders = getOrdersForWeek(weeksISO[i]);
    for (var j = 0; j < weekOrders.length; j++) {
      allOrders.push(weekOrders[j]);
    }
  }

  var orderMap = {};
  for (var o = 0; o < allOrders.length; o++) {
    var ord = allOrders[o];
    var key = ord.userId + "__" + ord.weekStart;
    if (!orderMap[key]) orderMap[key] = {};
    orderMap[key][ord.productId] = (orderMap[key][ord.productId] || 0) + ord.quantity;
  }

  var weekHeaders = "";
  for (var wh = 0; wh < weeksISO.length; wh++) {
    var weekDate = parseISO(weeksISO[wh]);
    var bakingDate = getBakingDate(weekDate);
    var settings = getWeekSettings(weeksISO[wh]);
    var label = formatDateCZ(bakingDate);
    if (settings && settings.closed) {
      label += '<br><span style="color:#c0392b;font-size:11px">ZAVŘENO</span>';
    }
    weekHeaders += '<th style="background:#5c4033;color:#fff;padding:6px 10px;font-size:12px">' + label + '</th>';
  }

  var rows = "";
  for (var u = 0; u < users.length; u++) {
    var user = users[u];
    if (!user.active) continue;

    var hasData = false;
    for (var wi = 0; wi < weeksISO.length; wi++) {
      var cellKey = user.userId + "__" + weeksISO[wi];
      if (orderMap[cellKey]) { hasData = true; break; }
    }

    var rowStyle = hasData ? '' : 'color:#bbb';
    rows += '<tr style="' + rowStyle + '">';
    rows += '<td style="padding:5px 10px;border-bottom:1px solid #eee;font-weight:bold">' + user.name + '</td>';

    for (var wj = 0; wj < weeksISO.length; wj++) {
      var cKey = user.userId + "__" + weeksISO[wj];
      var cell = "";
      if (orderMap[cKey]) {
        var parts = [];
        for (var p = 0; p < products.length; p++) {
          var qty = orderMap[cKey][products[p].productId];
          if (qty && qty > 0) {
            parts.push(products[p].name + ": " + qty);
          }
        }
        cell = parts.join(", ");
      } else {
        cell = '<span style="color:#ddd">–</span>';
      }
      rows += '<td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12px">' + cell + '</td>';
    }
    rows += '</tr>';
  }

  var body = _emailHeader("Týdenní soupiska objednávek");
  body += '<p>Přehled objednávek na příštích 8 týdnů:</p>';
  body += '<div style="overflow-x:auto">';
  body += '<table style="border-collapse:collapse;width:100%">';
  body += '<thead><tr>';
  body += '<th style="background:#5c4033;color:#fff;padding:6px 10px;text-align:left">Zákazník</th>';
  body += weekHeaders;
  body += '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  body += _emailFooter();

  sendOrQueue(CONFIG.ADMIN_EMAIL, "Soupiska objednávek chleba – " + formatDateCZ(new Date()), body);
}

function sendBakingEveInfoToAdmin(weekStart) {
  var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
  var weekDate = parseISO(weekISO);
  var bakingDate = getBakingDate(weekDate);
  var orders = getOrdersForWeek(weekISO);
  var products = _getActiveProducts();

  var productTotals = {};
  for (var p = 0; p < products.length; p++) {
    productTotals[products[p].productId] = 0;
  }

  var userOrderMap = {};
  for (var o = 0; o < orders.length; o++) {
    var ord = orders[o];
    if (!userOrderMap[ord.userId]) userOrderMap[ord.userId] = {};
    userOrderMap[ord.userId][ord.productId] = (userOrderMap[ord.userId][ord.productId] || 0) + ord.quantity;
    if (productTotals[ord.productId] !== undefined) {
      productTotals[ord.productId] += ord.quantity;
    }
  }

  var rows = "";
  var userIds = Object.keys(userOrderMap);
  userIds.sort(function(a, b) {
    var ua = getUserById(a);
    var ub = getUserById(b);
    var na = ua ? ua.name : a;
    var nb = ub ? ub.name : b;
    return na.localeCompare(nb, "cs");
  });

  for (var u = 0; u < userIds.length; u++) {
    var uid = userIds[u];
    var user = getUserById(uid);
    var userName = user ? user.name : uid;
    for (var p2 = 0; p2 < products.length; p2++) {
      var qty = userOrderMap[uid][products[p2].productId];
      if (qty && qty > 0) {
        rows += '<tr>';
        rows += '<td style="padding:5px 10px;border-bottom:1px solid #eee">' + userName + '</td>';
        rows += '<td style="padding:5px 10px;border-bottom:1px solid #eee">' + products[p2].name + '</td>';
        rows += '<td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right">' + qty + '</td>';
        rows += '</tr>';
      }
    }
  }

  var totalRows = "";
  var grandTotal = 0;
  for (var p3 = 0; p3 < products.length; p3++) {
    var total = productTotals[products[p3].productId] || 0;
    if (total > 0) {
      grandTotal += total;
      totalRows += '<tr style="font-weight:bold;background:#fdf6ee">';
      totalRows += '<td colspan="2" style="padding:5px 10px;border-top:2px solid #c8a97e">' + products[p3].name + ' celkem</td>';
      totalRows += '<td style="padding:5px 10px;border-top:2px solid #c8a97e;text-align:right">' + total + '</td>';
      totalRows += '</tr>';
    }
  }

  var body = _emailHeader("Info na pečení – " + formatDateCZ(bakingDate));
  body += '<p>Zítra se peče. Tady je přehled objednávek:</p>';

  if (rows === "") {
    body += '<p style="color:#999">Na tento den nejsou žádné objednávky.</p>';
  } else {
    body += '<table style="border-collapse:collapse;width:100%">';
    body += '<thead><tr>';
    body += '<th style="background:#5c4033;color:#fff;padding:6px 10px;text-align:left">Zákazník</th>';
    body += '<th style="background:#5c4033;color:#fff;padding:6px 10px;text-align:left">Produkt</th>';
    body += '<th style="background:#5c4033;color:#fff;padding:6px 10px;text-align:right">Kusů</th>';
    body += '</tr></thead><tbody>' + rows + totalRows + '</tbody></table>';
    body += '<p style="margin-top:12px"><strong>Celkem kusů: ' + grandTotal + '</strong></p>';
  }

  body += _emailFooter();

  sendOrQueue(CONFIG.ADMIN_EMAIL, "Info na pečení – " + formatDateCZ(bakingDate), body);
}

function sendClosedWeekNotification(weekStart, reason, affectedUserIds) {
  if (!affectedUserIds || affectedUserIds.length === 0) return;

  var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
  var weekDate = parseISO(weekISO);
  var bakingDate = getBakingDate(weekDate);
  var bakingLabel = formatDateCZ(bakingDate);

  for (var i = 0; i < affectedUserIds.length; i++) {
    var user = getUserById(affectedUserIds[i]);
    if (!user || !user.email) continue;

    var firstName = user.name.split(" ")[0];
    var url = getUserPersonalizedUrl(user.token);

    var body = _emailHeader("Zrušené pečení – " + bakingLabel);
    body += '<p>Ahoj ' + firstName + ',</p>';
    body += '<p>bohužel musíme zrušit pečení naplánované na <strong>' + bakingLabel + '</strong>.</p>';
    if (reason) {
      body += '<p><strong>Důvod:</strong> ' + reason + '</p>';
    }
    body += '<p>Tvoje objednávka na tento týden byla stornována. Můžeš si zadat objednávku na jiný termín přes svůj odkaz:</p>';
    body += '<p><a href="' + url + '" style="background:#5c4033;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Přejít na objednávky</a></p>';
    body += '<p>Omlouváme se za komplikace!</p>';
    body += _emailFooter();

    sendOrQueue(user.email, "Zrušené pečení – " + bakingLabel, body);
  }
}

function sendBakingDayChangedNotification(weekStart, newBakingDay, affectedUserIds) {
  if (!affectedUserIds || affectedUserIds.length === 0) return;

  var weekISO = (weekStart instanceof Date) ? formatDateISO(weekStart) : String(weekStart);
  var weekDate = parseISO(weekISO);
  var newBakingDate = new Date(weekDate.getTime());
  newBakingDate.setDate(newBakingDate.getDate() + (Number(newBakingDay) - 1));
  var newBakingLabel = formatDateCZ(newBakingDate);

  for (var i = 0; i < affectedUserIds.length; i++) {
    var user = getUserById(affectedUserIds[i]);
    if (!user || !user.email) continue;

    var firstName = user.name.split(" ")[0];
    var url = getUserPersonalizedUrl(user.token);

    var body = _emailHeader("Změna dne pečení");
    body += '<p>Ahoj ' + firstName + ',</p>';
    body += '<p>informujeme tě o změně: pečení v týdnu, který jsi objednal/a, se přesunulo na <strong>' + newBakingLabel + '</strong>.</p>';
    body += '<p>Pokud ti tento termín nevyhovuje, můžeš svou objednávku upravit nebo zrušit:</p>';
    body += '<p><a href="' + url + '" style="background:#5c4033;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Upravit objednávku</a></p>';
    body += _emailFooter();

    sendOrQueue(user.email, "Změna dne pečení na " + newBakingLabel, body);
  }
}

function sendOnboardingEmail(userId) {
  var user = getUserById(userId);
  if (!user || !user.email) return;

  var firstName = user.name.split(" ")[0];
  var url = getUserPersonalizedUrl(user.token);

  var body = _emailHeader("Vítej v objednávkovém systému chleba!");
  body += '<p>Ahoj ' + firstName + ',</p>';
  body += '<p>jsme rádi, že jsi s námi! 🍞 Tady je tvůj osobní odkaz pro objednávky:</p>';
  body += '<p><a href="' + url + '" style="background:#5c4033;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-size:16px">Moje objednávky</a></p>';
  body += '<h3 style="color:#5c4033;margin-top:24px">Jak to funguje?</h3>';
  body += '<ul>';
  body += '<li>Přes odkaz výše si kdykoli nastavíš, kolik chlebů chceš na každý pečící den.</li>';
  body += '<li>Objednávky jsou předvyplněné – vždy vidíš aktuální stav.</li>';
  body += '<li>Každé pondělí ráno dostaneš email s přehledem svých objednávek na nejbližší 4 týdny.</li>';
  body += '<li>Změny lze provádět do večera den před pečením.</li>';
  body += '</ul>';
  body += '<p><strong>Schovej si tento email</strong> – odkaz je tvůj osobní přístup, není potřeba žádné heslo.</p>';
  body += '<p>Těšíme se na tvou první objednávku!</p>';
  body += _emailFooter();

  sendOrQueue(user.email, "Vítej – tvůj osobní odkaz na objednávky chleba", body);
}
