const TelegramBot = require('node-telegram-bot-api');
const { getConfig, updateConfig } = require('./config');

let bot = null;
let monitorController = null; // injected to trigger check or get status

function initTelegramBot(controller) {
  monitorController = controller;
  const config = getConfig();

  if (!config.telegram.token) {
    console.log('[Telegram] 未提供 TELEGRAM_BOT_TOKEN，略過 Telegram Bot 初始化');
    return null;
  }

  try {
    // Start bot with polling for interactive commands
    bot = new TelegramBot(config.telegram.token, { polling: true });

    bot.on('polling_error', (error) => {
      // Suppress noisy network poll errors on VPS
      console.warn('[Telegram Polling Error]:', error.code || error.message);
    });

    setupCommands();
    console.log('[Telegram] Bot 已啟動並開啟 Polling 雙向指令互動模式');
    return bot;
  } catch (err) {
    console.error('[Telegram] 初始化失敗:', err.message);
    return null;
  }
}

function isAuthorized(msg) {
  const config = getConfig();
  if (!config.telegram.chatId) return false; // Strictly disallow control if chatId is not configured
  const fromId = msg.chat?.id ?? msg.from?.id;
  if (!fromId) return false;
  return fromId.toString() === config.telegram.chatId.toString();
}

function buildMenuKeyboard() {
  const config = getConfig();
  const monitorStateText = config.polling.enabled ? '🟢 監控中' : '⏸️ 已暫停';
  const notifyStateText = config.telegram.enableNotifications ? '🔔 通知開' : '🔕 通知關';

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 立即檢查一次', callback_data: 'cb_check' },
          { text: `📊 當前狀態 (${monitorStateText})`, callback_data: 'cb_status' }
        ],
        [
          { text: `⏯️ 切換監控開關 (${monitorStateText})`, callback_data: 'cb_toggle_monitor' },
          { text: `🔔 切換通知開關 (${notifyStateText})`, callback_data: 'cb_toggle_notify' }
        ]
      ]
    }
  };
}

function setupCommands() {
  if (!bot) return;

  // /start or /help
  bot.onText(/\/(start|help)/, async (msg) => {
    const config = getConfig();
    if (!config.telegram.chatId) {
      return bot.sendMessage(
        msg.chat.id,
        `⚠️ *系統尚未設定管理者 Chat ID*\n\n你的 Telegram Chat ID 為: \`${msg.chat.id}\`\n請將此 ID 加入伺服器 \`.env\` 的 \`TELEGRAM_CHAT_ID\` 並重啟服務，以啟用機器人遙控功能。`,
        { parse_mode: 'Markdown' }
      );
    }

    if (!isAuthorized(msg)) {
      return bot.sendMessage(msg.chat.id, `⛔ 未授權的使用者。你的 Chat ID 是: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
    }

    const helpText = `
👋 *歡迎使用 USDT<>USD 套利監控機器人*

你可以直接在此透過指令或按鈕遙控 VPS 監控系統：

🔹 */menu* - 叫出快捷功能按鈕面板
🔹 */status* - 查詢即時監控狀態與最新套利試算
🔹 */check* - 立即抓取即時匯率並計算套利
🔹 */toggle* - 一鍵切換定時自動監控 (開/關)
🔹 */notify* - 一鍵切換 Telegram 警報通知 (開/關)
🔹 */set_profit <金額>* - 修改通知利潤門檻 (例如: \`/set_profit 1500\`)
🔹 */set_amount <金額>* - 修改預計投入本金 (例如: \`/set_amount 500000\`)

隨時點擊下方選單開啟控制：
    `;
    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown', ...buildMenuKeyboard() });
  });

  // /menu
  bot.onText(/\/menu/, async (msg) => {
    if (!isAuthorized(msg)) return;
    await bot.sendMessage(msg.chat.id, '🎛️ *套利監控控制面板*：', {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
  });

  // /status
  bot.onText(/\/status/, async (msg) => {
    if (!isAuthorized(msg)) return;
    await handleStatusRequest(msg.chat.id);
  });

  // /check
  bot.onText(/\/check/, async (msg) => {
    if (!isAuthorized(msg)) return;
    await handleCheckRequest(msg.chat.id);
  });

  // /toggle (監控開關)
  bot.onText(/\/toggle/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const config = getConfig();
    const newEnabled = !config.polling.enabled;
    updateConfig({ polling: { enabled: newEnabled } });
    if (monitorController && monitorController.syncScheduler) {
      monitorController.syncScheduler();
    }
    await bot.sendMessage(msg.chat.id, `⚙️ 自動監控已切換為：*${newEnabled ? '🟢 運行中' : '⏸️ 已暫停'}*`, {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
  });

  // /notify (通知開關)
  bot.onText(/\/notify/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const config = getConfig();
    const newNotify = !config.telegram.enableNotifications;
    updateConfig({ telegram: { enableNotifications: newNotify } });
    await bot.sendMessage(msg.chat.id, `🔔 Telegram 通知已切換為：*${newNotify ? '已開啟' : '已關閉'}*`, {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
  });

  // /set_profit <amount>
  bot.onText(/\/set_profit\s+(\d+)/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const val = parseInt(match[1], 10);
    if (isNaN(val) || val < 0) {
      return bot.sendMessage(msg.chat.id, '❌ 請輸入有效的整數金額');
    }
    updateConfig({ arbitrage: { minProfitTWD: val } });
    await bot.sendMessage(msg.chat.id, `✅ 最小利潤通知門檻已更新為: *${val.toLocaleString()} TWD*`, { parse_mode: 'Markdown' });
  });

  // /set_amount <amount>
  bot.onText(/\/set_amount\s+(\d+)/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const val = parseInt(match[1], 10);
    if (isNaN(val) || val <= 0) {
      return bot.sendMessage(msg.chat.id, '❌ 請輸入大於 0 的整數金額');
    }
    updateConfig({ arbitrage: { baseAmount: val } });
    await bot.sendMessage(msg.chat.id, `✅ 投入本金已更新為: *${val.toLocaleString()} TWD*`, { parse_mode: 'Markdown' });
  });

  // Callback query handling for inline buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (!isAuthorized({ chat: { id: chatId } })) {
      return bot.answerCallbackQuery(query.id, { text: '⛔ 未授權' });
    }

    try {
      await bot.answerCallbackQuery(query.id);
      if (query.data === 'cb_check') {
        await handleCheckRequest(chatId);
      } else if (query.data === 'cb_status') {
        await handleStatusRequest(chatId);
      } else if (query.data === 'cb_toggle_monitor') {
        const config = getConfig();
        const newEnabled = !config.polling.enabled;
        updateConfig({ polling: { enabled: newEnabled } });
        if (monitorController && monitorController.syncScheduler) {
          monitorController.syncScheduler();
        }
        await bot.sendMessage(chatId, `⚙️ 自動監控已切換為：*${newEnabled ? '🟢 運行中' : '⏸️ 已暫停'}*`, {
          parse_mode: 'Markdown',
          ...buildMenuKeyboard()
        });
      } else if (query.data === 'cb_toggle_notify') {
        const config = getConfig();
        const newNotify = !config.telegram.enableNotifications;
        updateConfig({ telegram: { enableNotifications: newNotify } });
        await bot.sendMessage(chatId, `🔔 Telegram 通知已切換為：*${newNotify ? '已開啟' : '已關閉'}*`, {
          parse_mode: 'Markdown',
          ...buildMenuKeyboard()
        });
      }
    } catch (err) {
      console.error('[Telegram Callback Error]:', err.message);
    }
  });
}

async function handleCheckRequest(chatId) {
  if (!bot) return;
  const msgSending = await bot.sendMessage(chatId, '⏳ 正在向聯邦銀行、MAX、MaiCoin 抓取最新即時匯率並試算...');

  try {
    if (!monitorController || !monitorController.runCheck) {
      throw new Error('監控核心尚未就緒');
    }
    const result = await monitorController.runCheck(true);
    const { config, usdRate, usdRateNet, maxRate, maiCoinRate } = result;

    const profitEmoji = config.profitTWD > 0 ? '🟢' : '🔴';
    const oppEmoji = result.hasOpportunity ? '🚀 【達到套利門檻！】' : '⏳ 【未達套利門檻】';

    const text = `
📊 *即時套利試算結果* ${oppEmoji}

💰 *利潤試算 (本金 ${config.initialAmount.toLocaleString()} TWD)*:
- 預估純利: ${profitEmoji} *${config.profitTWD.toFixed(2)} TWD* (${config.profitRate.toFixed(2)}%)
- MAX 交易手續費: ${config.tradeFeeTWD.toFixed(2)} TWD (${config.maxTradeFeeRate}%)
- 出金手續費: ${config.withdrawFee} TWD
- 門檻設定: ${config.minProfitTWD.toLocaleString()} TWD

💱 *即時匯率*:
- 聯邦 USD/TWD 即期賣出: \`${usdRate}\` (讓分後淨匯率: \`${usdRateNet.toFixed(3)}\`)
- MaiCoin USDT/USD 買入: \`${maiCoinRate}\`
- MAX USDT/TWD 賣出: \`${maxRate}\`

⏱️ 檢查時間: ${new Date(result.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...buildMenuKeyboard() });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ 檢查失敗: ${err.message}`);
  }
}

async function handleStatusRequest(chatId) {
  if (!bot) return;
  const config = getConfig();
  const monitorState = config.polling.enabled ? '🟢 運行中' : '⏸️ 已暫停';
  const notifyState = config.telegram.enableNotifications ? '🔔 已開啟' : '🔕 已關閉';

  let lastInfo = '尚無檢查紀錄';
  if (monitorController && monitorController.getLastResult()) {
    const last = monitorController.getLastResult();
    lastInfo = `預估獲利: *${last.config.profitTWD.toFixed(2)} TWD* (${new Date(last.timestamp).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })})`;
  }

  const statusText = `
ℹ️ *系統當前狀態*

⚙️ *監控設定*:
- 自動輪詢狀態: *${monitorState}* (每 ${config.polling.intervalMinutes} 分鐘)
- Telegram 警報通知: *${notifyState}*
- 投入本金: *${config.arbitrage.baseAmount.toLocaleString()} TWD*
- 最小通知門檻: *${config.arbitrage.minProfitTWD.toLocaleString()} TWD*
- MAX 交易手續費: *${config.arbitrage.maxTradeFeeRate}%*
- 聯邦換匯讓分: *${config.arbitrage.ubotDiscount} USD*
- 出金手續費: *${config.arbitrage.withdrawFee} TWD*

📈 *最近一次檢查結果*:
${lastInfo}
`;

  await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown', ...buildMenuKeyboard() });
}

/**
 * 當發現套利機會時發送主動告警
 */
async function sendArbitrageAlert(arbitrageData) {
  const config = getConfig();
  if (!config.telegram.enableNotifications || !bot || !config.telegram.chatId) {
    return;
  }

  try {
    const { config: c, usdRate, usdRateNet, maxRate, maiCoinRate } = arbitrageData;

    const message = `
🚨 *【發現 USDT<>USD 搬磚套利機會！】* 🚨

💰 *預估純利*: *+${c.profitTWD.toFixed(2)} TWD* (投報率: *${c.profitRate.toFixed(2)}%*)
💼 *計算本金*: ${c.initialAmount.toLocaleString()} TWD
🎯 *設定門檻*: ${c.minProfitTWD.toLocaleString()} TWD

💱 *即時盤口匯率*:
- 聯邦銀行賣出: \`${usdRate}\` (讓分後淨匯率: \`${usdRateNet.toFixed(3)}\`)
- MaiCoin 買入 USDT: \`${maiCoinRate}\`
- MAX 賣出 USDT: \`${maxRate}\`

🔄 *操作路徑*:
1. 聯邦 App 換匯買 USD (享讓分 ${c.ubotDiscount})
2. 入金 MaiCoin USD 帳戶
3. MaiCoin 買入 USDT
4. 內轉 MAX 交易所賣出 USDT 得 TWD
5. 提領 TWD 回銀行

⏰ 時間: ${new Date(arbitrageData.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
⚠️ 提醒：請留意市場即時深度滑價與銀行營業換匯時間！
`;

    await bot.sendMessage(config.telegram.chatId, message, {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
    console.log('[Telegram] 套利通知已發送');
  } catch (error) {
    console.error('[Telegram] 發送通知失敗:', error.message);
  }
}

/**
 * 發送連線異常通知
 */
async function sendErrorAlert(errorMessage, consecutiveFailures) {
  const config = getConfig();
  if (!config.telegram.enableNotifications || !bot || !config.telegram.chatId) {
    return;
  }

  try {
    const message = `
⚠️ *【USDT<>USD 監控連線異常警告】* ⚠️

🔴 *無法取得即時匯率資料*:
\`${errorMessage}\`

🔁 *連續失敗次數*: ${consecutiveFailures} 次
⏰ *時間*: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}

💡 *說明*: 可能是聯邦銀行/MAX API 異常或網路暫時中斷。系統將持續自動重試；恢復時會主動發送通知。
`;
    await bot.sendMessage(config.telegram.chatId, message, {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
    console.log('[Telegram] 連線異常警告已發送');
  } catch (err) {
    console.error('[Telegram] 發送異常警告失敗:', err.message);
  }
}

/**
 * 發送連線恢復通知
 */
async function sendRecoveryAlert(arbitrageData) {
  const config = getConfig();
  if (!config.telegram.enableNotifications || !bot || !config.telegram.chatId) {
    return;
  }

  try {
    const profit = arbitrageData.config?.profitTWD ?? 0;
    const message = `
✅ *【USDT<>USD 監控連線已恢復正常】* ✅

🎉 聯邦銀行、MaiCoin 與 MAX 資料連線已恢復通暢！
📊 *最新試算獲利*: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} TWD*
⏰ *恢復時間*: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
`;
    await bot.sendMessage(config.telegram.chatId, message, {
      parse_mode: 'Markdown',
      ...buildMenuKeyboard()
    });
    console.log('[Telegram] 連線恢復通知已發送');
  } catch (err) {
    console.error('[Telegram] 發送恢復通知失敗:', err.message);
  }
}

module.exports = {
  initTelegramBot,
  sendArbitrageAlert,
  sendErrorAlert,
  sendRecoveryAlert,
  getBot: () => bot,
};

