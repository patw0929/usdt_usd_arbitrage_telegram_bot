const fs = require('fs');
const path = require('path');
require('dotenv').config();

const baseDir = process.env.DATA_DIR || path.join(__dirname, '..');
if (!fs.existsSync(baseDir)) {
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch (_) {}
}

const CONFIG_FILE = path.join(baseDir, 'user_config.json');

// Migrate old root config file to DATA_DIR if needed
const oldConfigFile = path.join(__dirname, '..', 'user_config.json');
if (process.env.DATA_DIR && fs.existsSync(oldConfigFile) && !fs.existsSync(CONFIG_FILE)) {
  try { fs.copyFileSync(oldConfigFile, CONFIG_FILE); } catch (_) {}
}

// Default initial config based on environment variables or fallbacks
const defaultConfig = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',
  },
  arbitrage: {
    baseAmount: Number(process.env.BASE_AMOUNT) || 490000,
    maxTradeFeeRate: Number(process.env.MAX_TRADE_FEE_RATE) || 0.045, // %
    minProfitTWD: Number(process.env.MIN_PROFIT_TWD) || 1500,
    ubotDiscount: Number(process.env.UBOT_DISCOUNT) || 0.035, // 聯邦讓分 USD
    withdrawFee: Number(process.env.WITHDRAW_FEE) || 30, // MAX 出金 TWD
  },
  polling: {
    enabled: true,
    intervalMinutes: Number(process.env.POLLING_INTERVAL_MINUTES) || 1,
  },
  web: {
    port: Number(process.env.PORT) || 3888,
    password: process.env.DASHBOARD_PASSWORD || '',
  },
  auth: {
    // Cloudflare Zero Trust (Access)
    cfAccessEnabled: process.env.CF_ACCESS_ENABLED !== 'false', // default true if CF headers present
    allowedEmails: (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean),
  }
};

let currentConfig = { ...defaultConfig };

// Load user-modified config from user_config.json if it exists
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // Only merge allowed non-credential runtime settings
      currentConfig = {
        telegram: {
          ...defaultConfig.telegram,
          enableNotifications: saved.telegram?.enableNotifications ?? defaultConfig.telegram.enableNotifications,
        },
        arbitrage: {
          baseAmount: Number(saved.arbitrage?.baseAmount ?? defaultConfig.arbitrage.baseAmount),
          maxTradeFeeRate: Number(saved.arbitrage?.maxTradeFeeRate ?? defaultConfig.arbitrage.maxTradeFeeRate),
          minProfitTWD: Number(saved.arbitrage?.minProfitTWD ?? defaultConfig.arbitrage.minProfitTWD),
          ubotDiscount: Number(saved.arbitrage?.ubotDiscount ?? defaultConfig.arbitrage.ubotDiscount),
          withdrawFee: Number(saved.arbitrage?.withdrawFee ?? defaultConfig.arbitrage.withdrawFee),
        },
        polling: {
          enabled: saved.polling?.enabled ?? defaultConfig.polling.enabled,
          intervalMinutes: Math.max(1, Number(saved.polling?.intervalMinutes ?? defaultConfig.polling.intervalMinutes)),
        },
        web: { ...defaultConfig.web },
        auth: { ...defaultConfig.auth },
      };
    }
  } catch (err) {
    console.error('[Config] Failed to load user_config.json, using defaults:', err.message);
  }
  return currentConfig;
}

// Save modified config to user_config.json (credential-free)
function updateConfig(newPartial) {
  if (newPartial.telegram && typeof newPartial.telegram.enableNotifications === 'boolean') {
    currentConfig.telegram.enableNotifications = newPartial.telegram.enableNotifications;
  }

  if (newPartial.arbitrage) {
    const a = newPartial.arbitrage;
    currentConfig.arbitrage = {
      baseAmount: Math.max(1, Number(a.baseAmount ?? currentConfig.arbitrage.baseAmount) || currentConfig.arbitrage.baseAmount),
      maxTradeFeeRate: Math.max(0, Number(a.maxTradeFeeRate ?? currentConfig.arbitrage.maxTradeFeeRate) || 0),
      minProfitTWD: Number(a.minProfitTWD ?? currentConfig.arbitrage.minProfitTWD) || 0,
      ubotDiscount: Math.max(0, Number(a.ubotDiscount ?? currentConfig.arbitrage.ubotDiscount) || 0),
      withdrawFee: Math.max(0, Number(a.withdrawFee ?? currentConfig.arbitrage.withdrawFee) || 0),
    };
  }

  if (newPartial.polling) {
    const p = newPartial.polling;
    currentConfig.polling = {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : currentConfig.polling.enabled,
      intervalMinutes: Math.max(1, Number(p.intervalMinutes ?? currentConfig.polling.intervalMinutes) || 1),
    };
  }

  // Persist only non-sensitive runtime parameters
  const persistentSettings = {
    arbitrage: currentConfig.arbitrage,
    polling: currentConfig.polling,
    telegram: {
      enableNotifications: currentConfig.telegram.enableNotifications,
    },
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(persistentSettings, null, 2), 'utf8');
    console.log('[Config] Configuration updated and persisted safely (credentials excluded).');
  } catch (err) {
    console.error('[Config] Failed to save user_config.json:', err.message);
  }

  return currentConfig;
}

loadConfig();

module.exports = {
  getConfig: () => currentConfig,
  updateConfig,
  loadConfig,
};
