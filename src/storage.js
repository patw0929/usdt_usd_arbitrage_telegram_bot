const fs = require('fs');
const path = require('path');

const baseDir = process.env.DATA_DIR || path.join(__dirname, '..');
if (!fs.existsSync(baseDir)) {
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch (_) {}
}

const DATA_FILE = path.join(baseDir, 'arbitrage_data.json');
const MAX_RECORDS = 300;

// Migrate old root data file to DATA_DIR if needed
const oldFile = path.join(__dirname, '..', 'arbitrage_data.json');
if (process.env.DATA_DIR && fs.existsSync(oldFile) && !fs.existsSync(DATA_FILE)) {
  try { fs.copyFileSync(oldFile, DATA_FILE); } catch (_) {}
}

function loadHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Storage] Error reading history file:', err.message);
  }
  return [];
}

function saveRecord(record) {
  try {
    let history = loadHistory();
    history.push(record);

    if (history.length > MAX_RECORDS) {
      history = history.slice(-MAX_RECORDS);
    }

    // Atomic write to prevent file corruption
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(history, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
    return history;
  } catch (err) {
    console.error('[Storage] Error saving record:', err.message);
    return [];
  }
}

module.exports = {
  loadHistory,
  saveRecord,
  DATA_FILE,
};
