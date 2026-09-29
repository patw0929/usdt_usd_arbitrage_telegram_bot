const { getUbotExchangeRate, getMaxExchangeRate, getMaiCoinAskPrice } = require('./exchanges');
const { calculateArbitrageOpportunity } = require('./calculator');
const { saveRecord, loadHistory } = require('./storage');
const { sendArbitrageAlert, sendErrorAlert, sendRecoveryAlert } = require('./telegram');
const { getConfig, updateConfig } = require('./config');

let lastResult = null;
let lastCheckTime = null;
let isChecking = false;
let checkIntervalTimer = null;

// Error tracking & alerting
let lastError = null;
let consecutiveFailures = 0;
let lastErrorAlertTime = 0;

// Initialize with latest item from history if available
const history = loadHistory();
if (history.length > 0) {
  lastResult = history[history.length - 1];
  lastCheckTime = lastResult.timestamp;
}

/**
 * 執行一次套利機會檢查
 * @param {boolean} isManual 是否為手動觸發
 */
async function runCheck(isManual = false) {
  if (isChecking) {
    console.log('[Monitor] 已有檢查正在進行中，略過本次請求');
    return lastResult;
  }

  isChecking = true;
  console.log(`[Monitor] 開始${isManual ? '手動' : '定時'}檢查套利機會...`);

  try {
    const config = getConfig();

    // 並行取得三大匯率資料源
    const [usdRate, maxRate, maiCoinRate] = await Promise.all([
      getUbotExchangeRate(),
      getMaxExchangeRate(),
      getMaiCoinAskPrice(8000)
    ]);

    // 計算套利數據
    const arbitrageData = calculateArbitrageOpportunity(
      usdRate,
      maxRate,
      maiCoinRate,
      config.arbitrage
    );

    lastResult = arbitrageData;
    lastCheckTime = new Date().toISOString();

    // 儲存紀錄
    saveRecord(arbitrageData);

    console.log(`[Monitor] 檢查完成! 預估純利: ${arbitrageData.config.profitTWD.toFixed(2)} TWD (${arbitrageData.config.profitRate.toFixed(2)}%) | 門檻: ${config.arbitrage.minProfitTWD} TWD`);

    // 若先前曾發生連線中斷，現在恢復正常則發送恢復通知
    if (consecutiveFailures > 0) {
      console.log(`[Monitor] 資料連線已恢復正常 (曾連續失敗 ${consecutiveFailures} 次)`);
      sendRecoveryAlert(arbitrageData).catch(err => {
        console.error('[Monitor] 發送恢復通知失敗:', err.message);
      });
    }

    // 重置錯誤狀態
    consecutiveFailures = 0;
    lastError = null;

    // 若符合套利條件且開啟通知，發送 Telegram 告警
    if (arbitrageData.hasOpportunity) {
      console.log('🚀 [Monitor] 發現套利機會！發送通知中...');
      await sendArbitrageAlert(arbitrageData);
    }

    return arbitrageData;
  } catch (error) {
    consecutiveFailures++;
    lastError = {
      message: error.message,
      time: new Date().toISOString(),
      consecutiveFailures
    };

    console.error(`[Monitor] 檢查套利時發生錯誤 (連續失敗 ${consecutiveFailures} 次):`, error.message);

    // 在定時背景輪詢中發生異常時發送 Telegram 警報 (智能防洗版: 第 1 次即時通知，持續失敗時每 30 分鐘提醒一次)
    if (!isManual) {
      const now = Date.now();
      const shouldAlert = consecutiveFailures === 1 || (now - lastErrorAlertTime >= 30 * 60 * 1000);
      if (shouldAlert) {
        lastErrorAlertTime = now;
        sendErrorAlert(error.message, consecutiveFailures).catch(err => {
          console.error('[Monitor] 發送異常警報失敗:', err.message);
        });
      }
    }

    throw error;
  } finally {
    isChecking = false;
  }
}

/**
 * 依據當前 config 同步定時調度器
 */
function syncScheduler() {
  if (checkIntervalTimer) {
    clearInterval(checkIntervalTimer);
    checkIntervalTimer = null;
  }

  const config = getConfig();
  if (!config.polling.enabled) {
    console.log('[Monitor] 自動輪詢監控已暫停 (Paused)');
    return;
  }

  const intervalMs = Math.max(1, config.polling.intervalMinutes) * 60 * 1000;
  console.log(`[Monitor] 啟動自動輪詢監控，每 ${config.polling.intervalMinutes} 分鐘檢查一次`);

  checkIntervalTimer = setInterval(() => {
    runCheck(false).catch(err => {
      console.error('[Monitor] 定時輪詢失敗:', err.message);
    });
  }, intervalMs);
}

function startMonitor() {
  syncScheduler();

  // 系統啟動時若啟用，稍候 3 秒自動執行第一次初次檢查
  const config = getConfig();
  if (config.polling.enabled) {
    setTimeout(() => {
      runCheck(false).catch(err => {
        console.error('[Monitor] 初次檢查失敗:', err.message);
      });
    }, 3000);
  }
}

function stopMonitor() {
  if (checkIntervalTimer) {
    clearInterval(checkIntervalTimer);
    checkIntervalTimer = null;
  }
}

module.exports = {
  runCheck,
  startMonitor,
  stopMonitor,
  syncScheduler,
  getLastResult: () => lastResult,
  getLastCheckTime: () => lastCheckTime,
  getIsChecking: () => isChecking,
  getLastError: () => lastError,
  getConsecutiveFailures: () => consecutiveFailures,
};
