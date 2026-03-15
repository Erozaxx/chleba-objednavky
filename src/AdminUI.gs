// =============================================================================
// AdminUI.gs – Admin rozhraní (server-side handlers + inline HTML)
// =============================================================================

// ---------------------------------------------------------------------------
// ZÁKAZNÍCI – server-side handlers
// ---------------------------------------------------------------------------

function adminGetAllUsers() {
  try {
    var users = getAllUsers();
    return JSON.stringify(users);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminCreateUser(name, email) {
  try {
    if (!name || !email) throw new Error("Jméno a email jsou povinné.");
    var user = createUser(String(name).trim(), String(email).trim());
    return JSON.stringify(user);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminSetUserActive(userId, active) {
  try {
    if (!userId) throw new Error("Chybí userId.");
    var ok = setUserActive(String(userId), active === true);
    return JSON.stringify({ success: ok });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminResetUserToken(userId) {
  try {
    if (!userId) throw new Error("Chybí userId.");
    var newToken = resetUserToken(String(userId));
    if (!newToken) throw new Error("Uživatel nenalezen.");
    var newUrl = getUserPersonalizedUrl(newToken);
    return JSON.stringify({ success: true, newUrl: newUrl });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminSendOnboardingEmail(userId) {
  try {
    if (!userId) throw new Error("Chybí userId.");
    sendOnboardingEmail(String(userId));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminGetOrdersForUser(userId) {
  try {
    if (!userId) throw new Error("Chybí userId.");
    var orders = getOrdersForUser(String(userId));
    return JSON.stringify(orders);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminSaveOrdersForUser(userId, ordersJson) {
  try {
    if (!userId) throw new Error("Chybí userId.");
    var ordersArray = JSON.parse(ordersJson);
    if (!Array.isArray(ordersArray)) throw new Error("Neplatný formát dat.");

    // Načti platné weekStart hodnoty (nadcházející týdny)
    var upcomingWeeks = getUpcomingWeeksSettings(CONFIG.WEEKS_AHEAD);
    var validWeekStarts = {};
    for (var w = 0; w < upcomingWeeks.length; w++) {
      validWeekStarts[upcomingWeeks[w].weekStart] = true;
    }

    var sanitized = [];
    for (var i = 0; i < ordersArray.length; i++) {
      var item = ordersArray[i];
      var productId = String(item.productId || "").trim();
      var weekStart = String(item.weekStart || "").trim();
      var quantity  = parseInt(item.quantity, 10);

      if (!productId || !weekStart) continue;
      if (!validWeekStarts[weekStart]) continue;
      if (isNaN(quantity) || quantity < 0) continue;
      // Pouze celá čísla (parseInt již zajišťuje, zkontroluj že není float)
      if (quantity !== Math.floor(quantity)) continue;

      sanitized.push({ productId: productId, weekStart: weekStart, quantity: quantity });
    }

    var processed = upsertOrders(String(userId), sanitized);
    return JSON.stringify({ success: true, processed: processed });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

// ---------------------------------------------------------------------------
// PRODUKTY – server-side handlers
// ---------------------------------------------------------------------------

function adminGetAllProducts() {
  try {
    var products = getAllProducts();
    return JSON.stringify(products);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminCreateProduct(name, description, sortOrder) {
  try {
    if (!name) throw new Error("Název produktu je povinný.");
    var product = createProduct(
      String(name).trim(),
      String(description || "").trim(),
      Number(sortOrder) || 0
    );
    return JSON.stringify(product);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminSetProductActive(productId, active) {
  try {
    if (!productId) throw new Error("Chybí productId.");
    var ok = setProductActive(String(productId), active === true);
    return JSON.stringify({ success: ok });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminUpdateSortOrder(productId, sortOrder) {
  try {
    if (!productId) throw new Error("Chybí productId.");
    var ok = updateProductSortOrder(String(productId), Number(sortOrder));
    return JSON.stringify({ success: ok });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

// ---------------------------------------------------------------------------
// TÝDNY – server-side handlers
// ---------------------------------------------------------------------------

function adminGetWeeksOverview() {
  try {
    var weeks = getUpcomingWeeksSettings(CONFIG.WEEKS_AHEAD);
    var result = [];
    for (var i = 0; i < weeks.length; i++) {
      var ws = weeks[i];
      var weekDate = parseISO(ws.weekStart);
      var bakingDate = getBakingDate(weekDate);
      var ordersForWeek = getOrdersForWeek(ws.weekStart);
      var orderCount = ordersForWeek.length;
      result.push({
        weekStart:   ws.weekStart,
        bakingDay:   ws.bakingDay,
        bakingDate:  formatDateISO(bakingDate),
        bakingLabel: formatDateCZ(bakingDate),
        closed:      ws.closed,
        reason:      ws.reason,
        notifiedAt:  ws.notifiedAt ? String(ws.notifiedAt) : null,
        orderCount:  orderCount
      });
    }
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

function adminSetWeekClosed(weekStart, reason) {
  try {
    if (!weekStart) throw new Error("Chybí weekStart.");
    if (!reason || String(reason).trim() === "") throw new Error("Důvod zavření je povinný.");

    var weekISO = String(weekStart);

    // 1. Archivovat orders – pokud selže, vyhodí Error a delete se neprovede
    archiveOrdersForWeek(weekISO, "closed_week");

    // 2. Smazat z orders – provede se jen pokud archivace proběhla bez chyby
    deleteOrdersForWeek(weekISO);

    // 3. Notifikovat zákazníky (z archivu zjistíme koho)
    var archiveSheet = getSheet("orders_archive");
    var archiveData = archiveSheet.getDataRange().getValues();
    var notifiedSet = {};
    var affectedUserIds = [];
    for (var i = 1; i < archiveData.length; i++) {
      var ws = archiveData[i][ARCHIVE_COLS.weekStart];
      var wsISO = (ws instanceof Date) ? formatDateISO(ws) : String(ws);
      var archivedReason = String(archiveData[i][ARCHIVE_COLS.reason]);
      if (wsISO === weekISO && archivedReason === "closed_week") {
        var uid = String(archiveData[i][ARCHIVE_COLS.userId]);
        if (!notifiedSet[uid]) {
          notifiedSet[uid] = true;
          affectedUserIds.push(uid);
        }
      }
    }
    sendClosedWeekNotification(weekISO, String(reason).trim(), affectedUserIds);

    // 4. setWeekClosed – zapíše notifiedAt ve stejném řádku, bez race condition
    setWeekClosed(weekISO, String(reason).trim(), new Date());

    return JSON.stringify({ success: true, notified: affectedUserIds.length });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminSetWeekOpen(weekStart) {
  try {
    if (!weekStart) throw new Error("Chybí weekStart.");
    var ok = setWeekOpen(String(weekStart));
    return JSON.stringify({ success: ok });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

function adminSetBakingDayOverride(weekStart, bakingDay) {
  try {
    if (!weekStart) throw new Error("Chybí weekStart.");
    var day = Number(bakingDay);
    if (day < 1 || day > 7) throw new Error("Neplatný den pečení (1–7).");

    var weekISO = String(weekStart);

    // Override dne
    var ok = setBakingDayOverride(weekISO, day);
    if (!ok) throw new Error("Nepodařilo se nastavit override.");

    // Notifikace dotčeným zákazníkům
    var affectedUserIds = getUsersWithOrdersForWeek(weekISO);
    sendBakingDayChangedNotification(weekISO, day, affectedUserIds);

    return JSON.stringify({ success: true, notified: affectedUserIds.length });
  } catch (e) {
    return JSON.stringify({ success: false, error: String(e) });
  }
}

// ---------------------------------------------------------------------------
// renderAdminPage() – vrátí HtmlService output kompletního admin rozhraní
// ---------------------------------------------------------------------------

function renderAdminPage() {
  var html = _buildAdminHtml();
  return HtmlService.createHtmlOutput(html)
    .setTitle("Admin – Objednávky chleba")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _buildAdminHtml() {
  var scriptUrl = ScriptApp.getService().getUrl();
  // Získáme aktuální admin token z URL není možné přímo, předáme prázdný string –
  // URL pro admin odkaz sestavíme v JS na frontendu ze window.location.
  return '<!DOCTYPE html>\n' +
'<html lang="cs">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<meta name="referrer" content="no-referrer">\n' +
'<title>Admin – Objednávky chleba</title>\n' +
'<style>\n' +
_adminCss() +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<header class="top-bar">\n' +
'  <span class="logo">🍞 Admin – Objednávky chleba</span>\n' +
'</header>\n' +
'<nav class="tabs">\n' +
'  <button class="tab-btn active" data-tab="customers">Zákazníci</button>\n' +
'  <button class="tab-btn" data-tab="products">Produkty</button>\n' +
'  <button class="tab-btn" data-tab="weeks">Týdny</button>\n' +
'</nav>\n' +
'\n' +
'<main class="content">\n' +
'\n' +
'  <!-- ========== TAB: ZÁKAZNÍCI ========== -->\n' +
'  <section id="tab-customers" class="tab-panel active">\n' +
'    <div class="section-header">\n' +
'      <h2>Zákazníci</h2>\n' +
'      <button class="btn btn-primary" onclick="showAddUserForm()">+ Přidat zákazníka</button>\n' +
'    </div>\n' +
'\n' +
'    <div id="add-user-form" class="card form-card hidden">\n' +
'      <h3>Nový zákazník</h3>\n' +
'      <div class="form-row">\n' +
'        <label>Jméno</label>\n' +
'        <input type="text" id="new-user-name" placeholder="Jan Novák">\n' +
'      </div>\n' +
'      <div class="form-row">\n' +
'        <label>Email</label>\n' +
'        <input type="email" id="new-user-email" placeholder="jan@example.com">\n' +
'      </div>\n' +
'      <div class="form-actions">\n' +
'        <button class="btn btn-primary" onclick="doCreateUser()">Vytvořit</button>\n' +
'        <button class="btn btn-secondary" onclick="hideAddUserForm()">Zrušit</button>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <div id="users-loading" class="loading">Načítám zákazníky…</div>\n' +
'    <div id="users-error" class="error-msg hidden"></div>\n' +
'    <div id="users-table-wrap" class="table-wrap hidden">\n' +
'      <table id="users-table">\n' +
'        <thead>\n' +
'          <tr>\n' +
'            <th>Jméno</th>\n' +
'            <th>Email</th>\n' +
'            <th>Aktivní</th>\n' +
'            <th>Odkaz</th>\n' +
'            <th>Akce</th>\n' +
'          </tr>\n' +
'        </thead>\n' +
'        <tbody id="users-tbody"></tbody>\n' +
'      </table>\n' +
'    </div>\n' +
'\n' +
'    <!-- Inline editace objednávek zákazníka -->\n' +
'    <div id="edit-orders-panel" class="card hidden">\n' +
'      <div class="section-header">\n' +
'        <h3 id="edit-orders-title">Objednávky zákazníka</h3>\n' +
'        <button class="btn btn-secondary" onclick="hideOrdersPanel()">✕ Zavřít</button>\n' +
'      </div>\n' +
'      <div id="orders-loading" class="loading hidden">Načítám objednávky…</div>\n' +
'      <div id="orders-error" class="error-msg hidden"></div>\n' +
'      <div id="orders-form-wrap"></div>\n' +
'      <div id="orders-save-wrap" class="form-actions hidden">\n' +
'        <button class="btn btn-primary" onclick="doSaveOrders()">Uložit objednávky</button>\n' +
'        <span id="orders-save-msg" class="save-msg"></span>\n' +
'      </div>\n' +
'    </div>\n' +
'  </section>\n' +
'\n' +
'  <!-- ========== TAB: PRODUKTY ========== -->\n' +
'  <section id="tab-products" class="tab-panel">\n' +
'    <div class="section-header">\n' +
'      <h2>Produkty</h2>\n' +
'      <button class="btn btn-primary" onclick="showAddProductForm()">+ Přidat produkt</button>\n' +
'    </div>\n' +
'\n' +
'    <div id="add-product-form" class="card form-card hidden">\n' +
'      <h3>Nový produkt</h3>\n' +
'      <div class="form-row">\n' +
'        <label>Název</label>\n' +
'        <input type="text" id="new-product-name" placeholder="Žitný chleba">\n' +
'      </div>\n' +
'      <div class="form-row">\n' +
'        <label>Popis</label>\n' +
'        <input type="text" id="new-product-desc" placeholder="Volitelný popis">\n' +
'      </div>\n' +
'      <div class="form-row">\n' +
'        <label>Pořadí</label>\n' +
'        <input type="number" id="new-product-sort" value="10" min="0">\n' +
'      </div>\n' +
'      <div class="form-actions">\n' +
'        <button class="btn btn-primary" onclick="doCreateProduct()">Vytvořit</button>\n' +
'        <button class="btn btn-secondary" onclick="hideAddProductForm()">Zrušit</button>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <div id="products-loading" class="loading">Načítám produkty…</div>\n' +
'    <div id="products-error" class="error-msg hidden"></div>\n' +
'    <div id="products-table-wrap" class="table-wrap hidden">\n' +
'      <table id="products-table">\n' +
'        <thead>\n' +
'          <tr>\n' +
'            <th>Název</th>\n' +
'            <th>Popis</th>\n' +
'            <th>Pořadí</th>\n' +
'            <th>Aktivní</th>\n' +
'            <th>Akce</th>\n' +
'          </tr>\n' +
'        </thead>\n' +
'        <tbody id="products-tbody"></tbody>\n' +
'      </table>\n' +
'    </div>\n' +
'  </section>\n' +
'\n' +
'  <!-- ========== TAB: TÝDNY ========== -->\n' +
'  <section id="tab-weeks" class="tab-panel">\n' +
'    <div class="section-header">\n' +
'      <h2>Správa týdnů</h2>\n' +
'      <button class="btn btn-secondary" onclick="loadWeeks()">↺ Obnovit</button>\n' +
'    </div>\n' +
'    <div id="weeks-loading" class="loading">Načítám týdny…</div>\n' +
'    <div id="weeks-error" class="error-msg hidden"></div>\n' +
'    <div id="weeks-grid" class="weeks-grid hidden"></div>\n' +
'  </section>\n' +
'\n' +
'</main>\n' +
'\n' +
'<div id="toast" class="toast hidden"></div>\n' +
'\n' +
'<script>\n' +
_adminJs() +
'</script>\n' +
'</body>\n' +
'</html>\n';
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
function _adminCss() {
  return '* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'body { font-family: Arial, sans-serif; background: #f5f0eb; color: #333; min-height: 100vh; }\n' +
'.top-bar { background: #5c4033; color: #fff; padding: 12px 20px; font-size: 18px; font-weight: bold; }\n' +
'.logo { letter-spacing: 0.5px; }\n' +
'\n' +
'/* Tabs */\n' +
'.tabs { display: flex; background: #4a3329; }\n' +
'.tab-btn { background: transparent; color: #cbb89a; border: none; padding: 12px 24px; font-size: 15px;\n' +
'           cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.15s; }\n' +
'.tab-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }\n' +
'.tab-btn.active { color: #fff; border-bottom-color: #c8a97e; background: rgba(255,255,255,0.05); }\n' +
'\n' +
'/* Content */\n' +
'.content { max-width: 1100px; margin: 0 auto; padding: 20px 16px; }\n' +
'.tab-panel { display: none; }\n' +
'.tab-panel.active { display: block; }\n' +
'\n' +
'/* Cards */\n' +
'.card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px;\n' +
'        box-shadow: 0 1px 4px rgba(0,0,0,0.08); }\n' +
'.form-card { border-left: 4px solid #c8a97e; }\n' +
'\n' +
'/* Section header */\n' +
'.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }\n' +
'.section-header h2 { font-size: 20px; color: #5c4033; }\n' +
'.section-header h3 { font-size: 17px; color: #5c4033; }\n' +
'\n' +
'/* Buttons */\n' +
'.btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; transition: opacity 0.15s; }\n' +
'.btn:hover { opacity: 0.85; }\n' +
'.btn:disabled { opacity: 0.45; cursor: not-allowed; }\n' +
'.btn-primary { background: #5c4033; color: #fff; }\n' +
'.btn-secondary { background: #e0d4c8; color: #5c4033; }\n' +
'.btn-danger { background: #c0392b; color: #fff; }\n' +
'.btn-success { background: #27ae60; color: #fff; }\n' +
'.btn-warning { background: #e67e22; color: #fff; }\n' +
'.btn-sm { padding: 5px 10px; font-size: 12px; }\n' +
'\n' +
'/* Forms */\n' +
'.form-row { margin-bottom: 12px; }\n' +
'.form-row label { display: block; font-size: 13px; font-weight: bold; color: #666; margin-bottom: 4px; }\n' +
'.form-row input, .form-row select, .form-row textarea { width: 100%; padding: 8px 10px; border: 1px solid #ddd;\n' +
'  border-radius: 4px; font-size: 14px; }\n' +
'.form-row input:focus, .form-row select:focus { outline: none; border-color: #c8a97e; }\n' +
'.form-actions { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }\n' +
'\n' +
'/* Tables */\n' +
'.table-wrap { overflow-x: auto; }\n' +
'table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden;\n' +
'        box-shadow: 0 1px 4px rgba(0,0,0,0.07); font-size: 14px; }\n' +
'thead { background: #5c4033; color: #fff; }\n' +
'th { padding: 10px 12px; text-align: left; font-size: 13px; white-space: nowrap; }\n' +
'td { padding: 9px 12px; border-bottom: 1px solid #f0e8e0; vertical-align: middle; }\n' +
'tr:last-child td { border-bottom: none; }\n' +
'tr:hover td { background: #fdf6ee; }\n' +
'.td-actions { display: flex; gap: 5px; flex-wrap: wrap; }\n' +
'\n' +
'/* Status badges */\n' +
'.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }\n' +
'.badge-active { background: #d5f5e3; color: #1e8449; }\n' +
'.badge-inactive { background: #fdecea; color: #c0392b; }\n' +
'.badge-open { background: #d5f5e3; color: #1e8449; }\n' +
'.badge-closed { background: #fdecea; color: #c0392b; }\n' +
'\n' +
'/* Weeks grid */\n' +
'.weeks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }\n' +
'.week-card { background: #fff; border-radius: 8px; padding: 16px;\n' +
'             box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-top: 4px solid #c8a97e; }\n' +
'.week-card.closed { border-top-color: #c0392b; background: #fff9f9; }\n' +
'.week-card-title { font-size: 15px; font-weight: bold; color: #5c4033; margin-bottom: 6px; }\n' +
'.week-card-meta { font-size: 13px; color: #777; margin-bottom: 10px; }\n' +
'.week-card-meta span { display: block; margin-bottom: 2px; }\n' +
'.week-card-actions { display: flex; flex-direction: column; gap: 8px; }\n' +
'.week-card-actions .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }\n' +
'.week-select { padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }\n' +
'.reason-input { padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; flex: 1; min-width: 120px; }\n' +
'\n' +
'/* Orders edit form */\n' +
'.orders-week-block { background: #fdf6ee; border-left: 4px solid #c8a97e; padding: 14px 16px; margin-bottom: 14px; border-radius: 0 6px 6px 0; }\n' +
'.orders-week-block h4 { color: #5c4033; font-size: 14px; margin-bottom: 10px; }\n' +
'.orders-product-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }\n' +
'.orders-product-row label { flex: 1; font-size: 14px; }\n' +
'.orders-product-row input[type=number] { width: 80px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }\n' +
'\n' +
'/* Link copy */\n' +
'.link-copy { font-size: 12px; color: #5c4033; cursor: pointer; text-decoration: underline; white-space: nowrap; }\n' +
'.link-copy:hover { color: #c8a97e; }\n' +
'\n' +
'/* Misc */\n' +
'.loading { color: #999; padding: 16px 0; font-size: 14px; }\n' +
'.error-msg { color: #c0392b; padding: 10px 14px; background: #fdecea; border-radius: 4px; font-size: 14px; margin-bottom: 12px; }\n' +
'.save-msg { font-size: 13px; color: #27ae60; }\n' +
'.hidden { display: none !important; }\n' +
'\n' +
'/* Toast */\n' +
'.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);\n' +
'         background: #333; color: #fff; padding: 10px 22px; border-radius: 6px;\n' +
'         font-size: 14px; z-index: 9999; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }\n' +
'.toast.success { background: #27ae60; }\n' +
'.toast.error { background: #c0392b; }\n' +
'\n' +
'/* Responsive */\n' +
'@media (max-width: 600px) {\n' +
'  .tab-btn { padding: 10px 14px; font-size: 13px; }\n' +
'  th, td { padding: 7px 8px; }\n' +
'  .btn-sm { padding: 4px 8px; }\n' +
'}\n';
}

// ---------------------------------------------------------------------------
// JavaScript (client-side)
// ---------------------------------------------------------------------------
function _adminJs() {
  return '// ---- State ----\n' +
'var _users = [];\n' +
'var _products = [];\n' +
'var _editUserId = null;\n' +
'var _editUserOrders = [];\n' +
'var _weeksData = [];\n' +
'\n' +
'// ---- Tab routing ----\n' +
'document.querySelectorAll(".tab-btn").forEach(function(btn) {\n' +
'  btn.addEventListener("click", function() {\n' +
'    var tab = btn.dataset.tab;\n' +
'    document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });\n' +
'    document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });\n' +
'    btn.classList.add("active");\n' +
'    document.getElementById("tab-" + tab).classList.add("active");\n' +
'    if (tab === "products" && _products.length === 0) loadProducts();\n' +
'    if (tab === "weeks") loadWeeks();\n' +
'  });\n' +
'});\n' +
'\n' +
'// ---- Toast ----\n' +
'function showToast(msg, type) {\n' +
'  var t = document.getElementById("toast");\n' +
'  t.textContent = msg;\n' +
'  t.className = "toast " + (type || "");\n' +
'  t.classList.remove("hidden");\n' +
'  clearTimeout(t._timer);\n' +
'  t._timer = setTimeout(function() { t.classList.add("hidden"); }, 3000);\n' +
'}\n' +
'\n' +
'// ---- Escape HTML ----\n' +
'function esc(s) {\n' +
'  return String(s)\n' +
'    .replace(/&/g,"&amp;")\n' +
'    .replace(/</g,"&lt;")\n' +
'    .replace(/>/g,"&gt;")\n' +
'    .replace(/"/g,"&quot;");\n' +
'}\n' +
'\n' +
'// ---- Copy to clipboard ----\n' +
'function copyLink(url) {\n' +
'  if (navigator.clipboard) {\n' +
'    navigator.clipboard.writeText(url).then(function() { showToast("Odkaz zkopírován", "success"); });\n' +
'  } else {\n' +
'    var ta = document.createElement("textarea");\n' +
'    ta.value = url;\n' +
'    document.body.appendChild(ta);\n' +
'    ta.select();\n' +
'    document.execCommand("copy");\n' +
'    document.body.removeChild(ta);\n' +
'    showToast("Odkaz zkopírován", "success");\n' +
'  }\n' +
'}\n' +
'\n' +
'// ================================================================\n' +
'// ZÁKAZNÍCI\n' +
'// ================================================================\n' +
'\n' +
'function loadUsers() {\n' +
'  var loading = document.getElementById("users-loading");\n' +
'  var errEl   = document.getElementById("users-error");\n' +
'  var wrap    = document.getElementById("users-table-wrap");\n' +
'  loading.classList.remove("hidden");\n' +
'  errEl.classList.add("hidden");\n' +
'  wrap.classList.add("hidden");\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      loading.classList.add("hidden");\n' +
'      try {\n' +
'        var data = JSON.parse(json);\n' +
'        if (data.error) throw new Error(data.error);\n' +
'        _users = data;\n' +
'        renderUsersTable(_users);\n' +
'        wrap.classList.remove("hidden");\n' +
'      } catch(e) {\n' +
'        errEl.textContent = "Chyba: " + e.message;\n' +
'        errEl.classList.remove("hidden");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) {\n' +
'      loading.classList.add("hidden");\n' +
'      errEl.textContent = "Chyba serveru: " + e.message;\n' +
'      errEl.classList.remove("hidden");\n' +
'    })\n' +
'    .adminGetAllUsers();\n' +
'}\n' +
'\n' +
'function renderUsersTable(users) {\n' +
'  var tbody = document.getElementById("users-tbody");\n' +
'  if (users.length === 0) {\n' +
'    tbody.innerHTML = \'<tr><td colspan="5" style="color:#999;text-align:center">Žádní zákazníci</td></tr>\';\n' +
'    return;\n' +
'  }\n' +
'  var html = "";\n' +
'  for (var i = 0; i < users.length; i++) {\n' +
'    var u = users[i];\n' +
'    var url = window.location.href.split("?")[0] + "?token=" + esc(u.token);\n' +
'    var activeBadge = u.active\n' +
'      ? \'<span class="badge badge-active">✓ aktivní</span>\'\n' +
'      : \'<span class="badge badge-inactive">✗ neaktivní</span>\';\n' +
'    var toggleLabel = u.active ? "Deaktivovat" : "Aktivovat";\n' +
'    var toggleClass = u.active ? "btn-danger" : "btn-success";\n' +
'    html += \'<tr>\';\n' +
'    html += \'<td>\' + esc(u.name) + \'</td>\';\n' +
'    html += \'<td>\' + esc(u.email) + \'</td>\';\n' +
'    html += \'<td>\' + activeBadge + \'</td>\';\n' +
'    html += \'<td><span class="link-copy" onclick="copyLink(\\\'\' + esc(url) + \'\\\')">📋 Kopírovat</span></td>\';\n' +
'    html += \'<td><div class="td-actions">\';\n' +
'    html += \'<button class="btn btn-sm \' + toggleClass + \'" onclick="doSetUserActive(\\\'\' + esc(u.userId) + \'\\\', \' + (!u.active) + \')">\'+ toggleLabel +\'</button>\';\n' +
'    html += \'<button class="btn btn-sm btn-secondary" onclick="doResetToken(\\\'\' + esc(u.userId) + \'\\\')">Reset tokenu</button>\';\n' +
'    html += \'<button class="btn btn-sm btn-secondary" onclick="doSendOnboarding(\\\'\' + esc(u.userId) + \'\\\')">Onboarding email</button>\';\n' +
'    html += \'<button class="btn btn-sm btn-primary" onclick="openOrdersPanel(\\\'\' + esc(u.userId) + \'\\\', \\\'\' + esc(u.name) + \'\\\')">Editovat objednávky</button>\';\n' +
'    html += \'</div></td>\';\n' +
'    html += \'</tr>\';\n' +
'  }\n' +
'  tbody.innerHTML = html;\n' +
'}\n' +
'\n' +
'function showAddUserForm() {\n' +
'  document.getElementById("add-user-form").classList.remove("hidden");\n' +
'  document.getElementById("new-user-name").focus();\n' +
'}\n' +
'function hideAddUserForm() {\n' +
'  document.getElementById("add-user-form").classList.add("hidden");\n' +
'  document.getElementById("new-user-name").value = "";\n' +
'  document.getElementById("new-user-email").value = "";\n' +
'}\n' +
'\n' +
'function doCreateUser() {\n' +
'  var name  = document.getElementById("new-user-name").value.trim();\n' +
'  var email = document.getElementById("new-user-email").value.trim();\n' +
'  if (!name || !email) { showToast("Vyplňte jméno i email", "error"); return; }\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.error) { showToast("Chyba: " + data.error, "error"); return; }\n' +
'      showToast("Zákazník vytvořen", "success");\n' +
'      hideAddUserForm();\n' +
'      loadUsers();\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminCreateUser(name, email);\n' +
'}\n' +
'\n' +
'function doSetUserActive(userId, active) {\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) { showToast(active ? "Zákazník aktivován" : "Zákazník deaktivován", "success"); loadUsers(); }\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSetUserActive(userId, active);\n' +
'}\n' +
'\n' +
'function doResetToken(userId) {\n' +
'  if (!confirm("Reset tokenu zneplatní starý odkaz zákazníka. Pokračovat?")) return;\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) { showToast("Token resetován. Nový odkaz: " + data.newUrl, "success"); loadUsers(); }\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminResetUserToken(userId);\n' +
'}\n' +
'\n' +
'function doSendOnboarding(userId) {\n' +
'  if (!confirm("Odeslat onboardingový email?")) return;\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) showToast("Onboardingový email odeslán", "success");\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSendOnboardingEmail(userId);\n' +
'}\n' +
'\n' +
'// ---- Editace objednávek zákazníka ----\n' +
'\n' +
'function openOrdersPanel(userId, userName) {\n' +
'  _editUserId = userId;\n' +
'  document.getElementById("edit-orders-title").textContent = "Objednávky: " + userName;\n' +
'  var panel  = document.getElementById("edit-orders-panel");\n' +
'  var ldEl   = document.getElementById("orders-loading");\n' +
'  var errEl  = document.getElementById("orders-error");\n' +
'  var fwrap  = document.getElementById("orders-form-wrap");\n' +
'  var swrap  = document.getElementById("orders-save-wrap");\n' +
'  panel.classList.remove("hidden");\n' +
'  ldEl.classList.remove("hidden");\n' +
'  errEl.classList.add("hidden");\n' +
'  fwrap.innerHTML = "";\n' +
'  swrap.classList.add("hidden");\n' +
'  panel.scrollIntoView({ behavior: "smooth" });\n' +
'\n' +
'  // Načteme objednávky i produkty i týdny paralelně\n' +
'  var ordersLoaded = false;\n' +
'  var productsLoaded = false;\n' +
'  var weeksLoaded = false;\n' +
'  var ordersData = [];\n' +
'  var productsData = [];\n' +
'  var weeksData = [];\n' +
'\n' +
'  function checkAllLoaded() {\n' +
'    if (!ordersLoaded || !productsLoaded || !weeksLoaded) return;\n' +
'    ldEl.classList.add("hidden");\n' +
'    _editUserOrders = ordersData;\n' +
'    renderOrdersForm(ordersData, productsData, weeksData);\n' +
'    swrap.classList.remove("hidden");\n' +
'  }\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var d = JSON.parse(json);\n' +
'      if (d.error) { ldEl.classList.add("hidden"); errEl.textContent = d.error; errEl.classList.remove("hidden"); return; }\n' +
'      ordersData = d; ordersLoaded = true; checkAllLoaded();\n' +
'    })\n' +
'    .withFailureHandler(function(e) { ldEl.classList.add("hidden"); errEl.textContent = e.message; errEl.classList.remove("hidden"); })\n' +
'    .adminGetOrdersForUser(userId);\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var d = JSON.parse(json);\n' +
'      if (d.error) { productsData = []; } else { productsData = d; }\n' +
'      productsLoaded = true; checkAllLoaded();\n' +
'    })\n' +
'    .withFailureHandler(function() { productsData = []; productsLoaded = true; checkAllLoaded(); })\n' +
'    .adminGetAllProducts();\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var d = JSON.parse(json);\n' +
'      if (d.error) { weeksData = []; } else { weeksData = d; }\n' +
'      weeksLoaded = true; checkAllLoaded();\n' +
'    })\n' +
'    .withFailureHandler(function() { weeksData = []; weeksLoaded = true; checkAllLoaded(); })\n' +
'    .adminGetWeeksOverview();\n' +
'}\n' +
'\n' +
'function hideOrdersPanel() {\n' +
'  document.getElementById("edit-orders-panel").classList.add("hidden");\n' +
'  _editUserId = null;\n' +
'  _editUserOrders = [];\n' +
'}\n' +
'\n' +
'function renderOrdersForm(orders, products, weeks) {\n' +
'  var wrap = document.getElementById("orders-form-wrap");\n' +
'  if (!weeks || weeks.length === 0) {\n' +
'    wrap.innerHTML = \'<p style="color:#999">Nejsou dostupné žádné týdny.</p>\';\n' +
'    return;\n' +
'  }\n' +
'\n' +
'  // Build order lookup: weekStart + productId -> quantity\n' +
'  var orderMap = {};\n' +
'  for (var o = 0; o < orders.length; o++) {\n' +
'    orderMap[orders[o].weekStart + "__" + orders[o].productId] = orders[o].quantity;\n' +
'  }\n' +
'\n' +
'  // Filter active products and sort\n' +
'  var activeProducts = products.filter(function(p) { return p.active; });\n' +
'  activeProducts.sort(function(a, b) { return a.sortOrder - b.sortOrder; });\n' +
'\n' +
'  var html = "";\n' +
'  for (var w = 0; w < weeks.length; w++) {\n' +
'    var week = weeks[w];\n' +
'    // Admin vidí všechny týdny (bez cutoff omezení)\n' +
'    if (week.closed) {\n' +
'      html += \'<div class="orders-week-block" style="opacity:0.5">\' +\n' +
'              \'<h4>🔒 \' + esc(week.bakingLabel) + \' – ZAVŘENO\' + (week.reason ? \' (\' + esc(week.reason) + \')\' : \'\') + \'</h4>\' +\n' +
'              \'</div>\';\n' +
'      continue;\n' +
'    }\n' +
'    html += \'<div class="orders-week-block">\';\n' +
'    html += \'<h4>Pečení: \' + esc(week.bakingLabel) + \'</h4>\';\n' +
'    if (activeProducts.length === 0) {\n' +
'      html += \'<p style="color:#999;font-size:13px">Žádné aktivní produkty</p>\';\n' +
'    }\n' +
'    for (var p = 0; p < activeProducts.length; p++) {\n' +
'      var prod = activeProducts[p];\n' +
'      var key = week.weekStart + "__" + prod.productId;\n' +
'      var qty = orderMap[key] || 0;\n' +
'      html += \'<div class="orders-product-row">\';\n' +
'      html += \'<label>\' + esc(prod.name);\n' +
'      if (prod.description) html += \' <small style="color:#999">\' + esc(prod.description) + \'</small>\';\n' +
'      html += \'</label>\';\n' +
'      html += \'<input type="number" min="0" step="1" value="\' + qty + \'"\' +\n' +
'              \' data-week="\' + esc(week.weekStart) + \'"\' +\n' +
'              \' data-product="\' + esc(prod.productId) + \'"\' +\n' +
'              \' class="order-qty-input">\';\n' +
'      html += \'</div>\';\n' +
'    }\n' +
'    html += \'</div>\';\n' +
'  }\n' +
'  wrap.innerHTML = html;\n' +
'}\n' +
'\n' +
'function doSaveOrders() {\n' +
'  if (!_editUserId) return;\n' +
'  var inputs = document.querySelectorAll(".order-qty-input");\n' +
'  var ordersArray = [];\n' +
'  for (var i = 0; i < inputs.length; i++) {\n' +
'    ordersArray.push({\n' +
'      weekStart: inputs[i].dataset.week,\n' +
'      productId: inputs[i].dataset.product,\n' +
'      quantity:  Math.max(0, parseInt(inputs[i].value, 10) || 0)\n' +
'    });\n' +
'  }\n' +
'  var msgEl = document.getElementById("orders-save-msg");\n' +
'  msgEl.textContent = "Ukládám…";\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) {\n' +
'        msgEl.textContent = "✓ Uloženo (" + data.processed + " záznamů)";\n' +
'        showToast("Objednávky uloženy", "success");\n' +
'      } else {\n' +
'        msgEl.textContent = "";\n' +
'        showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) {\n' +
'      msgEl.textContent = "";\n' +
'      showToast("Chyba: " + e.message, "error");\n' +
'    })\n' +
'    .adminSaveOrdersForUser(_editUserId, JSON.stringify(ordersArray));\n' +
'}\n' +
'\n' +
'// ================================================================\n' +
'// PRODUKTY\n' +
'// ================================================================\n' +
'\n' +
'function loadProducts() {\n' +
'  var loading = document.getElementById("products-loading");\n' +
'  var errEl   = document.getElementById("products-error");\n' +
'  var wrap    = document.getElementById("products-table-wrap");\n' +
'  loading.classList.remove("hidden");\n' +
'  errEl.classList.add("hidden");\n' +
'  wrap.classList.add("hidden");\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      loading.classList.add("hidden");\n' +
'      try {\n' +
'        var data = JSON.parse(json);\n' +
'        if (data.error) throw new Error(data.error);\n' +
'        _products = data;\n' +
'        renderProductsTable(_products);\n' +
'        wrap.classList.remove("hidden");\n' +
'      } catch(e) {\n' +
'        errEl.textContent = "Chyba: " + e.message;\n' +
'        errEl.classList.remove("hidden");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) {\n' +
'      loading.classList.add("hidden");\n' +
'      errEl.textContent = "Chyba serveru: " + e.message;\n' +
'      errEl.classList.remove("hidden");\n' +
'    })\n' +
'    .adminGetAllProducts();\n' +
'}\n' +
'\n' +
'function renderProductsTable(products) {\n' +
'  var tbody = document.getElementById("products-tbody");\n' +
'  if (products.length === 0) {\n' +
'    tbody.innerHTML = \'<tr><td colspan="5" style="color:#999;text-align:center">Žádné produkty</td></tr>\';\n' +
'    return;\n' +
'  }\n' +
'  var html = "";\n' +
'  for (var i = 0; i < products.length; i++) {\n' +
'    var p = products[i];\n' +
'    var activeBadge = p.active\n' +
'      ? \'<span class="badge badge-active">✓ aktivní</span>\'\n' +
'      : \'<span class="badge badge-inactive">✗ neaktivní</span>\';\n' +
'    var toggleLabel = p.active ? "Deaktivovat" : "Aktivovat";\n' +
'    var toggleClass = p.active ? "btn-danger" : "btn-success";\n' +
'    html += \'<tr>\';\n' +
'    html += \'<td>\' + esc(p.name) + \'</td>\';\n' +
'    html += \'<td style="color:#777">\' + esc(p.description || "–") + \'</td>\';\n' +
'    html += \'<td><div style="display:flex;align-items:center;gap:6px">\';\n' +
'    html += \'<input type="number" value="\' + p.sortOrder + \'" min="0" style="width:65px;padding:4px 6px;border:1px solid #ddd;border-radius:4px;font-size:13px" id="sort-\' + esc(p.productId) + \'">\';\n' +
'    html += \'<button class="btn btn-sm btn-secondary" onclick="doUpdateSort(\\\'\' + esc(p.productId) + \'\\\')">✓</button>\';\n' +
'    html += \'</div></td>\';\n' +
'    html += \'<td>\' + activeBadge + \'</td>\';\n' +
'    html += \'<td><div class="td-actions">\';\n' +
'    html += \'<button class="btn btn-sm \' + toggleClass + \'" onclick="doSetProductActive(\\\'\' + esc(p.productId) + \'\\\', \' + (!p.active) + \')">\'+ toggleLabel +\'</button>\';\n' +
'    html += \'</div></td>\';\n' +
'    html += \'</tr>\';\n' +
'  }\n' +
'  tbody.innerHTML = html;\n' +
'}\n' +
'\n' +
'function showAddProductForm() {\n' +
'  document.getElementById("add-product-form").classList.remove("hidden");\n' +
'  document.getElementById("new-product-name").focus();\n' +
'}\n' +
'function hideAddProductForm() {\n' +
'  document.getElementById("add-product-form").classList.add("hidden");\n' +
'  document.getElementById("new-product-name").value = "";\n' +
'  document.getElementById("new-product-desc").value = "";\n' +
'  document.getElementById("new-product-sort").value = "10";\n' +
'}\n' +
'\n' +
'function doCreateProduct() {\n' +
'  var name = document.getElementById("new-product-name").value.trim();\n' +
'  var desc = document.getElementById("new-product-desc").value.trim();\n' +
'  var sort = parseInt(document.getElementById("new-product-sort").value, 10) || 0;\n' +
'  if (!name) { showToast("Vyplňte název produktu", "error"); return; }\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.error) { showToast("Chyba: " + data.error, "error"); return; }\n' +
'      showToast("Produkt vytvořen", "success");\n' +
'      hideAddProductForm();\n' +
'      loadProducts();\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminCreateProduct(name, desc, sort);\n' +
'}\n' +
'\n' +
'function doSetProductActive(productId, active) {\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) { showToast(active ? "Produkt aktivován" : "Produkt deaktivován", "success"); loadProducts(); }\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSetProductActive(productId, active);\n' +
'}\n' +
'\n' +
'function doUpdateSort(productId) {\n' +
'  var input = document.getElementById("sort-" + productId);\n' +
'  var val = parseInt(input.value, 10);\n' +
'  if (isNaN(val) || val < 0) { showToast("Neplatné pořadí", "error"); return; }\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) { showToast("Pořadí aktualizováno", "success"); loadProducts(); }\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminUpdateSortOrder(productId, val);\n' +
'}\n' +
'\n' +
'// ================================================================\n' +
'// TÝDNY\n' +
'// ================================================================\n' +
'\n' +
'function loadWeeks() {\n' +
'  var loading = document.getElementById("weeks-loading");\n' +
'  var errEl   = document.getElementById("weeks-error");\n' +
'  var grid    = document.getElementById("weeks-grid");\n' +
'  loading.classList.remove("hidden");\n' +
'  errEl.classList.add("hidden");\n' +
'  grid.classList.add("hidden");\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      loading.classList.add("hidden");\n' +
'      try {\n' +
'        var data = JSON.parse(json);\n' +
'        if (data.error) throw new Error(data.error);\n' +
'        _weeksData = data;\n' +
'        renderWeeksGrid(_weeksData);\n' +
'        grid.classList.remove("hidden");\n' +
'      } catch(e) {\n' +
'        errEl.textContent = "Chyba: " + e.message;\n' +
'        errEl.classList.remove("hidden");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) {\n' +
'      loading.classList.add("hidden");\n' +
'      errEl.textContent = "Chyba serveru: " + e.message;\n' +
'      errEl.classList.remove("hidden");\n' +
'    })\n' +
'    .adminGetWeeksOverview();\n' +
'}\n' +
'\n' +
'var DAY_NAMES = ["pondělí","úterý","středa","čtvrtek","pátek","sobota","neděle"];\n' +
'\n' +
'function renderWeeksGrid(weeks) {\n' +
'  var grid = document.getElementById("weeks-grid");\n' +
'  if (weeks.length === 0) {\n' +
'    grid.innerHTML = \'<p style="color:#999">Žádné týdny k zobrazení.</p>\';\n' +
'    return;\n' +
'  }\n' +
'  var html = "";\n' +
'  for (var i = 0; i < weeks.length; i++) {\n' +
'    var w = weeks[i];\n' +
'    var cardClass = w.closed ? "week-card closed" : "week-card";\n' +
'    var statusBadge = w.closed\n' +
'      ? \'<span class="badge badge-closed">🔒 Zavřeno</span>\'\n' +
'      : \'<span class="badge badge-open">✓ Otevřeno</span>\';\n' +
'\n' +
'    html += \'<div class="\' + cardClass + \'">\';\n' +
'    html += \'<div class="week-card-title">\' + esc(w.bakingLabel) + \'</div>\';\n' +
'    html += \'<div class="week-card-meta">\';\n' +
'    html += \'<span>Stav: \' + statusBadge + \'</span>\';\n' +
'    if (w.closed && w.reason) {\n' +
'      html += \'<span style="color:#c0392b;font-size:12px">Důvod: \' + esc(w.reason) + \'</span>\';\n' +
'    }\n' +
'    html += \'<span>Objednávek: <strong>\' + w.orderCount + \'</strong></span>\';\n' +
'    html += \'<span style="font-size:12px;color:#999">Týden od: \' + esc(w.weekStart) + \'</span>\';\n' +
'    html += \'</div>\';\n' +
'\n' +
'    html += \'<div class="week-card-actions">\';\n' +
'\n' +
'    if (!w.closed) {\n' +
'      // Zavřít týden\n' +
'      html += \'<div class="row">\';\n' +
'      html += \'<input type="text" class="reason-input" id="reason-\' + esc(w.weekStart) + \'" placeholder="Důvod zavření…">\';\n' +
'      html += \'<button class="btn btn-sm btn-danger" onclick="doCloseWeek(\\\'\' + esc(w.weekStart) + \'\\\')">Zavřít týden</button>\';\n' +
'      html += \'</div>\';\n' +
'      // Override dne pečení\n' +
'      html += \'<div class="row">\';\n' +
'      html += \'<select class="week-select" id="baking-\' + esc(w.weekStart) + \'">\';\n' +
'      for (var d = 1; d <= 7; d++) {\n' +
'        var sel = (d === w.bakingDay) ? \' selected\' : \'\';\n' +
'        html += \'<option value="\' + d + \'"\' + sel + \'>\' + DAY_NAMES[d-1] + \'</option>\';\n' +
'      }\n' +
'      html += \'</select>\';\n' +
'      html += \'<button class="btn btn-sm btn-warning" onclick="doBakingOverride(\\\'\' + esc(w.weekStart) + \'\\\')">Override pečení</button>\';\n' +
'      html += \'</div>\';\n' +
'    } else {\n' +
'      // Otevřít týden\n' +
'      html += \'<div class="row">\';\n' +
'      html += \'<button class="btn btn-sm btn-success" onclick="doOpenWeek(\\\'\' + esc(w.weekStart) + \'\\\')">Otevřít týden</button>\';\n' +
'      html += \'</div>\';\n' +
'    }\n' +
'\n' +
'    html += \'</div>\';\n' +
'    html += \'</div>\';\n' +
'  }\n' +
'  grid.innerHTML = html;\n' +
'}\n' +
'\n' +
'function doCloseWeek(weekStart) {\n' +
'  var reasonInput = document.getElementById("reason-" + weekStart);\n' +
'  var reason = reasonInput ? reasonInput.value.trim() : "";\n' +
'  if (!reason) { showToast("Zadejte důvod zavření", "error"); if (reasonInput) reasonInput.focus(); return; }\n' +
'  if (!confirm("Zavřít týden " + weekStart + "? Objednávky budou archivovány a zákazníci notifikováni.")) return;\n' +
'\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) {\n' +
'        showToast("Týden zavřen. Notifikováno: " + data.notified + " zákazníků", "success");\n' +
'        loadWeeks();\n' +
'      } else {\n' +
'        showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSetWeekClosed(weekStart, reason);\n' +
'}\n' +
'\n' +
'function doOpenWeek(weekStart) {\n' +
'  if (!confirm("Otevřít týden " + weekStart + "? Zákazníci nebudou automaticky notifikováni.")) return;\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) { showToast("Týden otevřen", "success"); loadWeeks(); }\n' +
'      else showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSetWeekOpen(weekStart);\n' +
'}\n' +
'\n' +
'function doBakingOverride(weekStart) {\n' +
'  var sel = document.getElementById("baking-" + weekStart);\n' +
'  var day = sel ? parseInt(sel.value, 10) : 0;\n' +
'  if (!day || day < 1 || day > 7) { showToast("Neplatný den", "error"); return; }\n' +
'  var dayName = DAY_NAMES[day - 1];\n' +
'  if (!confirm("Nastavit den pečení pro týden " + weekStart + " na " + dayName + "? Zákazníci s objednávkami budou notifikováni.")) return;\n' +
'  google.script.run\n' +
'    .withSuccessHandler(function(json) {\n' +
'      var data = JSON.parse(json);\n' +
'      if (data.success) {\n' +
'        showToast("Den pečení nastaven na " + dayName + ". Notifikováno: " + data.notified + " zákazníků", "success");\n' +
'        loadWeeks();\n' +
'      } else {\n' +
'        showToast("Chyba: " + (data.error || "neznámá"), "error");\n' +
'      }\n' +
'    })\n' +
'    .withFailureHandler(function(e) { showToast("Chyba: " + e.message, "error"); })\n' +
'    .adminSetBakingDayOverride(weekStart, day);\n' +
'}\n' +
'\n' +
'// ================================================================\n' +
'// INIT – načíst zákazníky při startu\n' +
'// ================================================================\n' +
'loadUsers();\n';
}
