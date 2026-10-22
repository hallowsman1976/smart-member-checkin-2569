// Mock ของ Apps Script services เท่าที่ระบบใช้ — สำหรับรัน gas/src บน Node เท่านั้น
// พฤติกรรมที่จำลองให้ตรงกับ Sheets จริง: ค่าที่ขึ้นต้นด้วย ' ถูกเก็บเป็นข้อความโดยตัด ' ออก, เซลล์ว่างอ่านได้ ''
import crypto from 'node:crypto';

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((v) => v.length !== this.numCols)) {
      throw new Error(`setValues: dimension mismatch (${values.length}x${values[0]?.length} vs ${this.numRows}x${this.numCols})`);
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)));
    return this;
  }
  setNumberFormat() { return this; }
  // เหมือน Sheets จริง: ใส่ checkbox ให้เซลล์ว่างแล้วเซลล์จะมีค่า FALSE (ทำให้ getLastRow นับแถวนั้น)
  setDataValidation(rule) {
    if (rule && rule.type === 'checkbox') {
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numCols; c++) {
          if (this.sheet.cell(this.row + r, this.col + c) === '') this.sheet.setCell(this.row + r, this.col + c, false);
        }
      }
    }
    return this;
  }
  clearDataValidations() { return this; }
  setFontWeight() { return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.maxRows = 1000;
  }
  cell(r, c) {
    const v = this.data[r - 1]?.[c - 1];
    return v === undefined || v === null ? '' : v;
  }
  setCell(r, c, v) {
    if (r > this.maxRows) throw new Error(`row ${r} exceeds maxRows ${this.maxRows}`);
    if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
    while (this.data.length < r) this.data.push([]);
    this.data[r - 1][c - 1] = v;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length; r >= 1; r--) {
      if ((this.data[r - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.data.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== undefined && v !== null) max = Math.max(max, i + 1); }));
    return max;
  }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  setFrozenRows() {}
  getRange(row, col, numRows = 1, numCols = 1) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) throw new Error(`invalid range ${row},${col},${numRows},${numCols}`);
    return new MockRange(this, row, col, numRows, numCols);
  }
  appendRow(values) {
    const r = this.getLastRow() + 1;
    if (r > this.maxRows) this.maxRows = r;
    values.forEach((v, i) => this.setCell(r, i + 1, v));
  }
}

class MockSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  getSheets() { return [...this.sheets.values()]; }
  insertSheet(name) {
    if (this.sheets.has(name)) throw new Error(`sheet exists: ${name}`);
    const s = new MockSheet(name);
    this.sheets.set(name, s);
    return s;
  }
  deleteSheet(sheet) {
    if (this.sheets.size <= 1) throw new Error('cannot delete the only sheet');
    this.sheets.delete(sheet.getName());
  }
}

function validationBuilder() {
  let type = 'list';
  const b = {
    requireCheckbox: () => { type = 'checkbox'; return b; },
    requireValueInList: () => b,
    setAllowInvalid: () => b,
    build: () => ({ type }),
  };
  return b;
}

/** สร้างชุด global สำหรับ vm context; clock.offsetMs ใช้เลื่อนเวลาของ CacheService */
export function createGasGlobals({ properties = {} } = {}) {
  const spreadsheets = new Map();
  const openById = (id) => {
    if (!spreadsheets.has(id)) spreadsheets.set(id, new MockSpreadsheet());
    return spreadsheets.get(id);
  };
  const spreadsheet = openById(properties.SPREADSHEET_ID || 'mock');
  const props = { ...properties };
  const clock = { offsetMs: 0 };
  const now = () => Date.now() + clock.offsetMs;
  const cacheStore = new Map();

  const SpreadsheetApp = {
    openById,
    flush: () => {},
    newDataValidation: validationBuilder,
  };

  const CacheService = {
    getScriptCache: () => ({
      get(key) {
        const e = cacheStore.get(key);
        if (!e) return null;
        if (e.expires <= now()) { cacheStore.delete(key); return null; }
        return e.value;
      },
      put(key, value, ttl = 600) {
        if (ttl > 21600) throw new Error('CacheService TTL max is 21600s');
        if (key.length > 250) throw new Error('CacheService key exceeds 250 chars');
        if (Buffer.byteLength(String(value), 'utf8') > 100 * 1024) throw new Error(`CacheService value exceeds 100KB: ${key}`);
        cacheStore.set(key, { value: String(value), expires: now() + ttl * 1000 });
      },
      putAll(values, ttl = 600) { Object.keys(values).forEach((k) => this.put(k, values[k], ttl)); },
      getAll(keys) {
        const out = {};
        keys.forEach((k) => { const v = this.get(k); if (v !== null) out[k] = v; });
        return out;
      },
      remove(key) { cacheStore.delete(key); },
      _keys: () => [...cacheStore.keys()],
    }),
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty(k, v) { props[k] = String(v); return this; },
      getProperties: () => ({ ...props }),
    }),
  };

  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest(alg, value, charset) {
      const buf = crypto.createHash(alg).update(String(value), charset).digest();
      return Array.from(buf, (b) => (b > 127 ? b - 256 : b)); // Apps Script คืน signed bytes
    },
    // รองรับเฉพาะ Asia/Bangkok และ token yyyy MM dd HH mm ss XXX กับข้อความใน '…'
    formatDate(date, tz, format) {
      if (tz !== 'Asia/Bangkok') throw new Error(`mock formatDate supports only Asia/Bangkok, got ${tz}`);
      const iso = new Date(date.getTime() + 7 * 3600000).toISOString();
      const parts = { yyyy: iso.slice(0, 4), MM: iso.slice(5, 7), dd: iso.slice(8, 10), HH: iso.slice(11, 13), mm: iso.slice(14, 16), ss: iso.slice(17, 19), XXX: '+07:00' };
      return format.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX/g, (m, lit) => (lit !== undefined ? lit : parts[m]));
    },
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(content) {
      return { content, mimeType: null, setMimeType(m) { this.mimeType = m; return this; }, getContent() { return this.content; } };
    },
  };

  let lockHeld = false;
  const LockService = {
    getScriptLock: () => ({
      tryLock() { if (lockHeld) return false; lockHeld = true; return true; },
      waitLock() { if (lockHeld) throw new Error('Lock timeout'); lockHeld = true; },
      releaseLock() { lockHeld = false; },
      hasLock() { return lockHeld; },
    }),
  };

  const triggers = []
  const ScriptApp = {
    newTrigger(handler) {
      const t = { handler, getHandlerFunction: () => handler }
      const builder = {
        timeBased: () => builder,
        everyMinutes: (m) => { t.everyMinutes = m; return builder },
        create: () => { triggers.push(t); return t },
      }
      return builder
    },
    getProjectTriggers: () => [...triggers],
    deleteTrigger: (t) => { triggers.splice(triggers.indexOf(t), 1) },
  }

  return {
    globals: { SpreadsheetApp, CacheService, PropertiesService, Utilities, ContentService, LockService, ScriptApp },
    spreadsheet,
    openById,
    triggers,
    props,
    clock,
  };
}
