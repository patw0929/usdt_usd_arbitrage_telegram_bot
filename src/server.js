const express = require('express');
const path = require('path');
const { getConfig, updateConfig } = require('./config');
const { loadHistory } = require('./storage');

function createServer(monitor) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Sanitize config to prevent exposing sensitive tokens in HTTP responses
  const getSafeConfig = (config, req) => {
    const cfUserEmail = req ? (req.headers['cf-access-authenticated-user-email'] || null) : null;
    return {
      telegram: {
        hasToken: !!config.telegram.token,
        hasChatId: !!config.telegram.chatId,
        enableNotifications: config.telegram.enableNotifications,
      },
      arbitrage: config.arbitrage,
      polling: config.polling,
      web: {
        port: config.web.port,
        hasPassword: !!config.web.password,
      },
      auth: {
        cfAccessEnabled: config.auth.cfAccessEnabled,
        userEmail: cfUserEmail,
        isCloudflareZeroTrust: !!cfUserEmail,
      }
    };
  };

  // Cloudflare Zero Trust & Dashboard Key Auth Middleware
  const authMiddleware = (req, res, next) => {
    const config = getConfig();
    const serverPass = config.web.password;
    const clientPass = req.headers['x-dashboard-key'] || req.query.key;

    // 1. If dashboard password is set and client provided valid key, authorize
    if (serverPass && clientPass === serverPass) {
      return next();
    }

    // 2. If request comes through Cloudflare Zero Trust
    const cfUserEmail = req.headers['cf-access-authenticated-user-email'];
    if (config.auth.cfAccessEnabled && cfUserEmail) {
      const allowedEmails = config.auth.allowedEmails;
      if (allowedEmails.length > 0 && !allowedEmails.includes(cfUserEmail.toLowerCase())) {
        return res.status(403).json({
          error: `存取拒絕：您的帳號 (${cfUserEmail}) 未在允許名單中`
        });
      }
      req.userEmail = cfUserEmail;
      return next();
    }

    // 3. If password protection is configured on server but not passed
    if (serverPass) {
      return res.status(401).json({ error: '密碼錯誤或未授權' });
    }

    // 4. Open access (e.g. Local development or private network)
    return next();
  };

  // Get current status & config
  app.get('/api/status', (req, res) => {
    const config = getConfig();
    const lastResult = monitor.getLastResult();
    const lastCheckTime = monitor.getLastCheckTime();
    const isChecking = monitor.getIsChecking();
    const lastError = monitor.getLastError();
    const consecutiveFailures = monitor.getConsecutiveFailures();

    res.json({
      status: 'ok',
      isChecking,
      lastCheckTime,
      lastResult,
      lastError,
      consecutiveFailures,
      config: getSafeConfig(config, req),
    });
  });

  // Get arbitrage history for charts
  app.get('/api/history', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const history = loadHistory();
    res.json({
      total: history.length,
      data: history.slice(-limit)
    });
  });

  // Trigger manual check
  app.post('/api/check', authMiddleware, async (req, res) => {
    try {
      const result = await monitor.runCheck(true);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Toggle monitoring on/off
  app.post('/api/toggle-monitor', authMiddleware, (req, res) => {
    const config = getConfig();
    const newEnabled = !config.polling.enabled;
    const updated = updateConfig({ polling: { enabled: newEnabled } });
    monitor.syncScheduler();
    res.json({ success: true, enabled: updated.polling.enabled });
  });

  // Toggle notifications on/off
  app.post('/api/toggle-notifications', authMiddleware, (req, res) => {
    const config = getConfig();
    const newNotify = !config.telegram.enableNotifications;
    const updated = updateConfig({ telegram: { enableNotifications: newNotify } });
    res.json({ success: true, enableNotifications: updated.telegram.enableNotifications });
  });

  // Update parameters (credential-safe)
  app.post('/api/config', authMiddleware, (req, res) => {
    try {
      const { arbitrage, polling, telegram } = req.body || {};
      const safeTelegramUpdate = telegram && typeof telegram.enableNotifications === 'boolean'
        ? { enableNotifications: telegram.enableNotifications }
        : undefined;

      const updated = updateConfig({
        arbitrage,
        polling,
        telegram: safeTelegramUpdate,
      });

      monitor.syncScheduler();
      res.json({ success: true, config: getSafeConfig(updated, req) });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // SPA fallback
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return app;
}

module.exports = {
  createServer,
};
