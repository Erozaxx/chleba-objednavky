var PRODUCTS_COLS = {
  productId:   0,
  name:        1,
  description: 2,
  active:      3,
  sortOrder:   4
};

function _rowToProduct(row) {
  return {
    productId:   row[PRODUCTS_COLS.productId],
    name:        row[PRODUCTS_COLS.name],
    description: row[PRODUCTS_COLS.description],
    active:      row[PRODUCTS_COLS.active] === true,
    sortOrder:   Number(row[PRODUCTS_COLS.sortOrder])
  };
}

function _sortBySortOrder(a, b) {
  return a.sortOrder - b.sortOrder;
}

function getActiveProducts() {
  var sheet = getSheet("products");
  var data = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][PRODUCTS_COLS.active] === true) {
      results.push(_rowToProduct(data[i]));
    }
  }
  results.sort(_sortBySortOrder);
  return results;
}

function getAllProducts() {
  var sheet = getSheet("products");
  var data = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < data.length; i++) {
    results.push(_rowToProduct(data[i]));
  }
  results.sort(_sortBySortOrder);
  return results;
}

function createProduct(name, description, sortOrder) {
  var sheet = getSheet("products");
  var productId = generateUUID();
  var newRow = [productId, name, description, true, Number(sortOrder)];
  sheet.appendRow(newRow);
  return {
    productId:   productId,
    name:        name,
    description: description,
    active:      true,
    sortOrder:   Number(sortOrder)
  };
}

function setProductActive(productId, active) {
  var sheet = getSheet("products");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][PRODUCTS_COLS.productId] === productId) {
      sheet.getRange(i + 1, PRODUCTS_COLS.active + 1).setValue(active === true);
      return true;
    }
  }
  return false;
}

function updateProductSortOrder(productId, sortOrder) {
  var sheet = getSheet("products");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][PRODUCTS_COLS.productId] === productId) {
      sheet.getRange(i + 1, PRODUCTS_COLS.sortOrder + 1).setValue(Number(sortOrder));
      return true;
    }
  }
  return false;
}
