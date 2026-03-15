// =============================================================================
// CustomerUI.gs – Zákaznické rozhraní (formulář objednávek chleba)
// =============================================================================

/**
 * Sestaví HTML stránku pro zákazníka a vrátí HtmlOutput.
 *
 * @param {string} userId – UUID zákazníka
 * @return {HtmlOutput}
 */
function renderCustomerPage(userId) {
  var user = getUserById(userId);
  if (!user || !user.active) {
    // Security by obscurity – nevyzrazovat existenci systému
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><title>Stránka nenalezena</title></head>' +
      '<body><p>Stránka nenalezena.</p></body></html>'
    ).setTitle("Stránka nenalezena");
  }

  var userName   = _escapeHtml(String(user.name));
  var weeks      = getUpcomingBakingWeeks(CONFIG.WEEKS_AHEAD);
  var products   = getActiveProducts();
  var userOrders = getOrdersForUser(userId);

  // Sestav mapu objednávek: "productId__weekStart" → quantity
  var orderMap = {};
  for (var i = 0; i < userOrders.length; i++) {
    var o = userOrders[i];
    orderMap[o.productId + "__" + o.weekStart] = o.quantity;
  }

  // Sestav data týdnů pro šablonu
  var weeksData = [];
  for (var w = 0; w < weeks.length; w++) {
    var weekISO   = weeks[w];
    var weekDate  = parseISO(weekISO);
    var bakingDate = getBakingDate(weekDate);
    var label     = formatDateCZ(bakingDate);
    var canEdit   = isBeforeCutoff(weekDate);

    var productsData = [];
    for (var p = 0; p < products.length; p++) {
      var prod = products[p];
      var key  = prod.productId + "__" + weekISO;
      var qty  = orderMap[key] ? Number(orderMap[key]) : 0;
      productsData.push({
        productId:   _escapeHtml(String(prod.productId)),
        name:        _escapeHtml(String(prod.name)),
        description: _escapeHtml(String(prod.description || "")),
        quantity:    qty
      });
    }

    weeksData.push({
      weekStart:    weekISO,
      label:        _escapeHtml(label),
      canEdit:      canEdit,
      products:     productsData
    });
  }

  var html = _buildCustomerHtml(userId, userName, weeksData);

  return HtmlService.createHtmlOutput(html)
    .setTitle("Objednávky chleba – " + user.name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

/**
 * Zpracuje POST z formuláře zákazníka.
 * ordersJson = JSON string pole {productId, weekStart, quantity}
 *
 * @param {string} userId
 * @param {string} ordersJson
 * @return {Object} {success, message, summary}
 */
function handleSaveOrders(userId, ordersJson) {
  try {
    var user = getUserById(userId);
    if (!user || !user.active) {
      return { success: false, message: "Neplatný přístup.", summary: [] };
    }

    var ordersArray = JSON.parse(ordersJson);
    if (!Array.isArray(ordersArray)) {
      return { success: false, message: "Neplatný formát dat.", summary: [] };
    }

    // Validace a filtrování – jen otevřené týdny, kladná celá čísla
    var validOrders = [];
    for (var i = 0; i < ordersArray.length; i++) {
      var item = ordersArray[i];
      var productId = String(item.productId || "");
      var weekStart = String(item.weekStart || "");
      var quantity  = parseInt(item.quantity, 10);

      if (!productId || !weekStart) continue;
      if (isNaN(quantity) || quantity < 0) continue;

      // Cutoff check – nenechat zapsat do uzavřeného týdne
      var weekDate = parseISO(weekStart);
      if (!weekDate) continue;
      if (!isBeforeCutoff(weekDate)) {
        // Tiše přeskočit – týden je read-only
        continue;
      }

      validOrders.push({ productId: productId, weekStart: weekStart, quantity: quantity });
    }

    upsertOrders(userId, validOrders);

    // Sestav souhrn pro zobrazení uživateli (jen qty > 0)
    var summary = [];
    var products = getActiveProducts();
    var productNames = {};
    for (var p = 0; p < products.length; p++) {
      productNames[products[p].productId] = products[p].name;
    }

    for (var j = 0; j < validOrders.length; j++) {
      var vo = validOrders[j];
      if (vo.quantity > 0) {
        var pName    = productNames[vo.productId] || vo.productId;
        var weekDate2 = parseISO(vo.weekStart);
        var bakingDate = getBakingDate(weekDate2);
        var dateLabel  = formatDateCZ(bakingDate);
        summary.push({
          product:   pName,
          quantity:  vo.quantity,
          weekStart: vo.weekStart,
          dateLabel: dateLabel
        });
      }
    }

    return {
      success: true,
      message: "Objednávky byly uloženy.",
      summary: summary
    };

  } catch (e) {
    return {
      success: false,
      message: "Chyba při ukládání: " + e.message,
      summary: []
    };
  }
}

// =============================================================================
// Interní helpery
// =============================================================================

/**
 * Escapuje HTML speciální znaky (ochrana proti XSS).
 */
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sestaví kompletní HTML string zákaznické stránky.
 *
 * @param {string} userId
 * @param {string} userName  – již escapované jméno
 * @param {Array}  weeksData – pole objektů { weekStart, label, canEdit, products[] }
 * @return {string}
 */
function _buildCustomerHtml(userId, userName, weeksData) {
  var parts = [];

  // ── HEAD ──────────────────────────────────────────────────────────────────
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="cs">');
  parts.push('<head>');
  parts.push('  <meta charset="UTF-8">');
  parts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  parts.push('  <meta name="referrer" content="no-referrer">');
  parts.push('  <title>Objednávky chleba</title>');
  parts.push('  <style>');
  parts.push(_getCustomerCss());
  parts.push('  </style>');
  parts.push('</head>');

  // ── BODY ──────────────────────────────────────────────────────────────────
  parts.push('<body>');

  // Záhlaví
  parts.push('<header class="page-header">');
  parts.push('  <p class="greeting">Dobrý den, <strong>' + userName + '</strong></p>');
  parts.push('  <h1 class="page-title">Vaše objednávky chleba</h1>');
  parts.push('</header>');

  parts.push('<main class="main-content">');

  // Zpráva / spinner / souhrn – dynamicky plněno JS
  parts.push('<div id="status-bar" class="status-bar" style="display:none"></div>');
  parts.push('<div id="summary-box" class="summary-box" style="display:none"></div>');

  if (weeksData.length === 0) {
    parts.push('<p class="empty-notice">Momentálně nejsou k dispozici žádné otevřené týdny pro objednání.</p>');
  } else {
    parts.push('<form id="orders-form" novalidate>');

    for (var w = 0; w < weeksData.length; w++) {
      var week = weeksData[w];
      parts.push(_buildWeekCard(week));
    }

    parts.push('  <div class="form-actions">');
    parts.push('    <button type="submit" id="save-btn" class="btn-save">Uložit objednávky</button>');
    parts.push('  </div>');
    parts.push('</form>');
  }

  parts.push('</main>');

  // ── JS ────────────────────────────────────────────────────────────────────
  parts.push('<script>');
  parts.push(_getCustomerJs(userId));
  parts.push('</script>');

  parts.push('</body>');
  parts.push('</html>');

  return parts.join("\n");
}

/**
 * Sestaví HTML blok jednoho týdenního kartičky.
 */
function _buildWeekCard(week) {
  var lines = [];
  var cardClass = week.canEdit ? "week-card" : "week-card week-card--closed";

  lines.push('<div class="' + cardClass + '">');
  lines.push('  <div class="week-card__header">');
  lines.push('    <span class="week-card__date">' + week.label + '</span>');
  if (!week.canEdit) {
    lines.push('    <span class="week-card__closed-badge">Objednávka uzavřena</span>');
  }
  lines.push('  </div>');

  if (!week.canEdit) {
    // Read-only souhrn existujících objednávek pro tento týden
    lines.push('  <div class="week-card__readonly-notice">');
    lines.push('    Objednávky na tento týden již nelze měnit.');
    lines.push('  </div>');
    for (var p = 0; p < week.products.length; p++) {
      var prod = week.products[p];
      if (prod.quantity > 0) {
        lines.push('  <div class="product-row product-row--readonly">');
        lines.push('    <span class="product-name">' + prod.name + '</span>');
        if (prod.description) {
          lines.push('    <span class="product-desc">' + prod.description + '</span>');
        }
        lines.push('    <span class="product-qty-static">' + prod.quantity + '&times;</span>');
        lines.push('  </div>');
      }
    }
    if (_allZero(week.products)) {
      lines.push('  <p class="no-orders-note">Žádná objednávka.</p>');
    }
  } else {
    lines.push('  <div class="week-card__products">');
    for (var q = 0; q < week.products.length; q++) {
      var prod2 = week.products[q];
      var inputId = "qty_" + prod2.productId + "_" + week.weekStart;
      lines.push('    <div class="product-row">');
      lines.push('      <label class="product-label" for="' + inputId + '">');
      lines.push('        <span class="product-name">' + prod2.name + '</span>');
      if (prod2.description) {
        lines.push('        <span class="product-desc">' + prod2.description + '</span>');
      }
      lines.push('      </label>');
      lines.push('      <input');
      lines.push('        class="qty-input"');
      lines.push('        type="number"');
      lines.push('        id="' + inputId + '"');
      lines.push('        name="' + inputId + '"');
      lines.push('        data-product-id="' + prod2.productId + '"');
      lines.push('        data-week-start="' + week.weekStart + '"');
      lines.push('        min="0"');
      lines.push('        step="1"');
      lines.push('        value="' + prod2.quantity + '"');
      lines.push('        inputmode="numeric"');
      lines.push('      >');
      lines.push('    </div>');
    }
    lines.push('  </div>');
  }

  lines.push('</div>');
  return lines.join("\n");
}

/**
 * Vrátí true pokud mají všechny produkty v týdnu quantity === 0.
 */
function _allZero(products) {
  for (var i = 0; i < products.length; i++) {
    if (products[i].quantity > 0) return false;
  }
  return true;
}

// =============================================================================
// CSS
// =============================================================================

function _getCustomerCss() {
  return [
    "/* ── Reset & base ───────────────────────────────────────────────── */",
    "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
    "html { font-size: 16px; }",
    "body {",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  background: #f5f5f5;",
    "  color: #222;",
    "  min-height: 100vh;",
    "}",
    "",
    "/* ── Layout ──────────────────────────────────────────────────────── */",
    ".page-header {",
    "  background: #2e7d32;",
    "  color: #fff;",
    "  padding: 1.25rem 1rem 1rem;",
    "  text-align: center;",
    "}",
    ".greeting {",
    "  font-size: 0.95rem;",
    "  margin-bottom: 0.25rem;",
    "  opacity: 0.9;",
    "}",
    ".page-title {",
    "  font-size: 1.25rem;",
    "  font-weight: 600;",
    "  letter-spacing: 0.01em;",
    "}",
    ".main-content {",
    "  max-width: 600px;",
    "  margin: 0 auto;",
    "  padding: 1rem;",
    "}",
    "",
    "/* ── Status / souhrn ─────────────────────────────────────────────── */",
    ".status-bar {",
    "  border-radius: 8px;",
    "  padding: 0.75rem 1rem;",
    "  margin-bottom: 1rem;",
    "  font-size: 0.95rem;",
    "}",
    ".status-bar--error {",
    "  background: #ffebee;",
    "  color: #b71c1c;",
    "  border: 1px solid #ef9a9a;",
    "}",
    ".status-bar--loading {",
    "  background: #e8f5e9;",
    "  color: #2e7d32;",
    "  border: 1px solid #a5d6a7;",
    "}",
    ".summary-box {",
    "  background: #e8f5e9;",
    "  border: 1px solid #a5d6a7;",
    "  border-radius: 8px;",
    "  padding: 1rem;",
    "  margin-bottom: 1rem;",
    "}",
    ".summary-box__title {",
    "  font-weight: 600;",
    "  margin-bottom: 0.5rem;",
    "  color: #1b5e20;",
    "}",
    ".summary-box__list {",
    "  list-style: none;",
    "  font-size: 0.95rem;",
    "}",
    ".summary-box__list li {",
    "  padding: 0.2rem 0;",
    "}",
    ".summary-box__empty {",
    "  font-size: 0.9rem;",
    "  color: #555;",
    "}",
    "",
    "/* ── Kartičky týdnů ──────────────────────────────────────────────── */",
    ".week-card {",
    "  background: #fff;",
    "  border-radius: 10px;",
    "  box-shadow: 0 1px 3px rgba(0,0,0,0.12);",
    "  margin-bottom: 1rem;",
    "  overflow: hidden;",
    "}",
    ".week-card__header {",
    "  background: #2e7d32;",
    "  color: #fff;",
    "  padding: 0.65rem 1rem;",
    "  display: flex;",
    "  justify-content: space-between;",
    "  align-items: center;",
    "  flex-wrap: wrap;",
    "  gap: 0.25rem;",
    "}",
    ".week-card--closed .week-card__header {",
    "  background: #757575;",
    "}",
    ".week-card__date {",
    "  font-weight: 600;",
    "  font-size: 1rem;",
    "}",
    ".week-card__closed-badge {",
    "  font-size: 0.75rem;",
    "  background: rgba(255,255,255,0.2);",
    "  padding: 0.2rem 0.5rem;",
    "  border-radius: 4px;",
    "  white-space: nowrap;",
    "}",
    ".week-card__products {",
    "  padding: 0.75rem 1rem;",
    "}",
    ".week-card__readonly-notice {",
    "  padding: 0.5rem 1rem 0;",
    "  font-size: 0.85rem;",
    "  color: #757575;",
    "}",
    "",
    "/* ── Řádek produktu ──────────────────────────────────────────────── */",
    ".product-row {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  padding: 0.55rem 0;",
    "  border-bottom: 1px solid #f0f0f0;",
    "  gap: 0.5rem;",
    "}",
    ".product-row:last-child { border-bottom: none; }",
    ".product-row--readonly {",
    "  padding: 0.4rem 1rem;",
    "}",
    ".product-label {",
    "  flex: 1;",
    "  cursor: pointer;",
    "  min-width: 0;",
    "}",
    ".product-name {",
    "  display: block;",
    "  font-weight: 500;",
    "  font-size: 1rem;",
    "}",
    ".product-desc {",
    "  display: block;",
    "  font-size: 0.8rem;",
    "  color: #757575;",
    "  margin-top: 0.1rem;",
    "  white-space: nowrap;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "}",
    ".qty-input {",
    "  width: 70px;",
    "  padding: 0.45rem 0.5rem;",
    "  border: 1px solid #bdbdbd;",
    "  border-radius: 6px;",
    "  font-size: 1rem;",
    "  text-align: center;",
    "  background: #fafafa;",
    "  flex-shrink: 0;",
    "  -moz-appearance: textfield;",
    "}",
    ".qty-input::-webkit-inner-spin-button,",
    ".qty-input::-webkit-outer-spin-button { opacity: 1; }",
    ".qty-input:focus {",
    "  outline: 2px solid #2e7d32;",
    "  border-color: #2e7d32;",
    "  background: #fff;",
    "}",
    ".product-qty-static {",
    "  font-weight: 600;",
    "  color: #2e7d32;",
    "  font-size: 1rem;",
    "  flex-shrink: 0;",
    "}",
    ".no-orders-note {",
    "  padding: 0.5rem 1rem 0.75rem;",
    "  font-size: 0.875rem;",
    "  color: #9e9e9e;",
    "}",
    ".empty-notice {",
    "  text-align: center;",
    "  color: #757575;",
    "  padding: 2rem 0;",
    "}",
    "",
    "/* ── Tlačítko ────────────────────────────────────────────────────── */",
    ".form-actions {",
    "  padding: 0.5rem 0 1.5rem;",
    "}",
    ".btn-save {",
    "  display: block;",
    "  width: 100%;",
    "  padding: 0.9rem;",
    "  background: #2e7d32;",
    "  color: #fff;",
    "  font-size: 1.05rem;",
    "  font-weight: 600;",
    "  border: none;",
    "  border-radius: 8px;",
    "  cursor: pointer;",
    "  transition: background 0.15s;",
    "  letter-spacing: 0.01em;",
    "}",
    ".btn-save:hover { background: #1b5e20; }",
    ".btn-save:disabled {",
    "  background: #a5d6a7;",
    "  cursor: not-allowed;",
    "}",
    "",
    "/* ── Spinner ─────────────────────────────────────────────────────── */",
    "@keyframes spin { to { transform: rotate(360deg); } }",
    ".spinner {",
    "  display: inline-block;",
    "  width: 1em;",
    "  height: 1em;",
    "  border: 2px solid currentColor;",
    "  border-right-color: transparent;",
    "  border-radius: 50%;",
    "  animation: spin 0.6s linear infinite;",
    "  vertical-align: middle;",
    "  margin-right: 0.35em;",
    "}",
    ""
  ].join("\n");
}

// =============================================================================
// JavaScript (client-side)
// =============================================================================

function _getCustomerJs(userId) {
  // userId je vložen server-side jako string literal (bezpečný – uuid obsahuje jen [0-9a-f-])
  var safeUserId = String(userId).replace(/[^0-9a-f\-]/gi, "");

  return [
    "(function () {",
    "  'use strict';",
    "  var USER_ID = '" + safeUserId + "';",
    "",
    "  var form      = document.getElementById('orders-form');",
    "  var saveBtn   = document.getElementById('save-btn');",
    "  var statusBar = document.getElementById('status-bar');",
    "  var summaryBox = document.getElementById('summary-box');",
    "",
    "  if (!form) return; // žádné otevřené týdny",
    "",
    "  form.addEventListener('submit', function (e) {",
    "    e.preventDefault();",
    "    submitOrders();",
    "  });",
    "",
    "  function submitOrders() {",
    "    var inputs = form.querySelectorAll('.qty-input');",
    "    var orders = [];",
    "    for (var i = 0; i < inputs.length; i++) {",
    "      var inp = inputs[i];",
    "      var qty = parseInt(inp.value, 10);",
    "      if (isNaN(qty) || qty < 0) qty = 0;",
    "      orders.push({",
    "        productId: inp.getAttribute('data-product-id'),",
    "        weekStart: inp.getAttribute('data-week-start'),",
    "        quantity:  qty",
    "      });",
    "    }",
    "",
    "    setLoading(true);",
    "    hideStatus();",
    "    hideSummary();",
    "",
    "    google.script.run",
    "      .withSuccessHandler(onSaveSuccess)",
    "      .withFailureHandler(onSaveError)",
    "      .handleSaveOrders(USER_ID, JSON.stringify(orders));",
    "  }",
    "",
    "  function onSaveSuccess(result) {",
    "    setLoading(false);",
    "    if (result && result.success) {",
    "      showSummary(result.summary);",
    "    } else {",
    "      var msg = (result && result.message) ? result.message : 'Neznámá chyba.';",
    "      showError(msg);",
    "    }",
    "  }",
    "",
    "  function onSaveError(err) {",
    "    setLoading(false);",
    "    var msg = (err && err.message) ? err.message : 'Nepodařilo se uložit objednávky. Zkuste to znovu.';",
    "    showError(msg);",
    "  }",
    "",
    "  function setLoading(on) {",
    "    saveBtn.disabled = on;",
    "    saveBtn.innerHTML = on",
    "      ? '<span class=\"spinner\"></span>Ukládám\\u2026'",
    "      : 'Uložit objednávky';",
    "  }",
    "",
    "  function showError(msg) {",
    "    statusBar.className = 'status-bar status-bar--error';",
    "    statusBar.textContent = msg;",
    "    statusBar.style.display = '';",
    "    statusBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });",
    "  }",
    "",
    "  function hideStatus() {",
    "    statusBar.style.display = 'none';",
    "    statusBar.textContent = '';",
    "  }",
    "",
    "  function showSummary(summary) {",
    "    summaryBox.innerHTML = '';",
    "    var title = document.createElement('p');",
    "    title.className = 'summary-box__title';",
    "    title.textContent = 'Uloženo!';",
    "    summaryBox.appendChild(title);",
    "",
    "    if (!summary || summary.length === 0) {",
    "      var empty = document.createElement('p');",
    "      empty.className = 'summary-box__empty';",
    "      empty.textContent = 'Žádné aktivní objednávky.';",
    "      summaryBox.appendChild(empty);",
    "    } else {",
    "      var ul = document.createElement('ul');",
    "      ul.className = 'summary-box__list';",
    "      // Seskup podle data pečení",
    "      var byDate = {};",
    "      var dateOrder = [];",
    "      for (var i = 0; i < summary.length; i++) {",
    "        var s = summary[i];",
    "        var key = s.dateLabel;",
    "        if (!byDate[key]) { byDate[key] = []; dateOrder.push(key); }",
    "        byDate[key].push(s.product + '\\u00a0' + s.quantity + '\\u00d7');",
    "      }",
    "      for (var d = 0; d < dateOrder.length; d++) {",
    "        var dl = dateOrder[d];",
    "        var li = document.createElement('li');",
    "        li.textContent = dl + ': ' + byDate[dl].join(', ');",
    "        ul.appendChild(li);",
    "      }",
    "      summaryBox.appendChild(ul);",
    "    }",
    "",
    "    summaryBox.style.display = '';",
    "    summaryBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });",
    "  }",
    "",
    "  function hideSummary() {",
    "    summaryBox.style.display = 'none';",
    "    summaryBox.innerHTML = '';",
    "  }",
    "",
    "})();",
    ""
  ].join("\n");
}
