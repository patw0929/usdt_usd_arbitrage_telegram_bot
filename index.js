/**
 * USDT <> USD 搬磚套利監控系統主程序
 * - 整合聯邦銀行、MaiCoin 與 MAX 交易所匯率計算
 * - 支援 Web 儀表板 (REST API + 響應式前端)
 * - 支援 Telegram 雙向控制與即時警報
 */

const { getConfig } = require('./src/config');
const monitor = require('./src/monitor');
const { initTelegramBot } = require('./src/telegram');
const { createServer } = require('./src/server');

async function main() {
  console.log('========================================================');
  console.log('🚀 USDT <> USD 搬磚套利監控系統 啟動中...');
  console.log('========================================================');

  const config = getConfig();

  // 1. 初始化 Telegram 雙向互動機器人
  initTelegramBot({
    runCheck: (isManual) => monitor.runCheck(isManual),
    getLastResult: () => monitor.getLastResult(),
    syncScheduler: () => monitor.syncScheduler(),
  });

  // 2. 啟動定時輪詢監控調度器
  monitor.startMonitor();

  // 3. 啟動 Web 服務與儀表板
  const app = createServer(monitor);
  const server = app.listen(config.web.port, '0.0.0.0', () => {
    console.log(`🌐 Web Dashboard 已運行於: http://0.0.0.0:${config.web.port}`);
    console.log(`🔒 儀表板存取保護: ${config.web.password ? '已啟用密碼防護' : '未設定密碼 (公開)'}`);
  });

  // 4. 優雅退場處理 (Graceful Shutdown)
  const shutdown = (signal) => {
    console.log(`\n🛑 收到 ${signal} 訊號，正在關閉服務...`);
    monitor.stopMonitor();
    server.close(() => {
      console.log('✅ 服務已安全終止。');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('💥 啟動過程中發生嚴重錯誤:', err);
  process.exit(1);
});
