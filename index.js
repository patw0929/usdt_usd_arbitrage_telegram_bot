/**
 * 加密貨幣與銀行匯率套利監控系統
 * - 監控聯邦銀行 USD/TWD 匯率、MaiCoin USDT/USD 匯率與 MAX Exchange USDT/TWD 匯率
 * - 計算套利空間
 * - 當套利機會出現時通過 Telegram 發送通知
 */

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getMaiCoinAskPrice } = require('./maicoin_ws');

const CONFIG = {
  // Telegram 設定
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN, // 從環境變數讀取 Telegram Bot Token
    chatId: process.env.TELEGRAM_CHAT_ID, // 從環境變數讀取聊天 ID
    enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true', // 是否啟用通知
  },
  // 套利設定
  arbitrage: {
    baseAmount: process.env.BASE_AMOUNT || 490000, // 投入金額 (TWD)
    maxTradeFeeRate: process.env.MAX_TRADE_FEE_RATE || 0, // MAX 交易手續費率 (%), 請參考 https://max.maicoin.com/docs/fees
    // 最小利潤 (TWD)，利潤超過這個值才會發送通知
    minProfitTWD: process.env.MIN_PROFIT_TWD || 1000,
  },
  // 輪詢設定
  polling: {
    // 檢查頻率 (cron 表達式)
    schedule: '*/1 * * * *' // 每 1 分鐘檢查一次
  },
  // 記錄檔
  storage: {
    dataFile: path.join(__dirname, 'arbitrage_data.json')
  }
};

// 初始化 Telegram Bot
const bot = CONFIG.telegram.enableNotifications ?
  new TelegramBot(CONFIG.telegram.token) : null;

/**
 * 取得聯邦銀行 USD/TWD 匯率
 * @returns {number} 聯邦銀行 USD/TWD 即期賣出匯率
 */
async function getUbotExchangeRate() {
  try {
    const response = await axios.post('https://www.ubot.com.tw/MyBank/IBKB040101', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    // 檢查是否成功取得資料
    if (response.status !== 200) {
      throw new Error(`聯邦銀行 API 錯誤! Status: ${response.status}`);
    }

    const data = response.data.RespBody.RateList;

    // 尋找 USD 美金的匯率資料，取得「即期賣出」
    const usdRate = data.find(item => item.CurrencyEName === 'USD').ImmeSell;

    if (!usdRate) {
      throw new Error('找不到 USD 美金匯率資料');
    }

    return parseFloat(usdRate);

  } catch (error) {
    console.error('取得聯邦銀行匯率失敗:', error.message);
    throw error;
  }
}

/**
 * 取得 MAX Exchange USDT/TWD 匯率
 * @returns {number} MAX Exchange USDT/TWD 賣出價格
 */
async function getMaxExchangeRate() {
  try {
    const response = await axios.get('https://max-api.maicoin.com/api/v3/ticker', {
      params: {
        market: 'usdttwd'
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    // 檢查是否成功取得資料
    if (response.status !== 200) {
      throw new Error(`MAX Exchange API 錯誤! Status: ${response.status}`);
    }

    const data = response.data;

    // 檢查資料格式
    if (!data) {
      throw new Error('MAX Exchange 返回的資料格式不正確或資料為空');
    }

    return parseFloat(data.buy);
  } catch (error) {
    console.error('取得 MAX Exchange 匯率失敗:', error.message);
    throw error;
  }
}

/**
 * 計算套利機會
 * @param {number} usdRate 聯邦即期賣出價格
 * @param {number} maxRate MAX USDTTWD 賣出價格
 * @returns {Object} 套利分析結果
 */
function calculateArbitrageOpportunity(usdRate, maxRate, maiCoinRate = 1.0019) {
  const ubotDiscount = 0.035; // 聯邦銀行 App 換匯讓分 0.035 美元
  const initialAmount = CONFIG.arbitrage.baseAmount; // 假設初始投資 49 萬 TWD
  const usdAmount = initialAmount / (usdRate - ubotDiscount); // 用 TWD 在銀行買入 USD (銀行賣出匯率)
  const usdtAmount = usdAmount / maiCoinRate; // 用 USD 在 MaiCoin 買入 USDT
  const finalAmount = usdtAmount * maxRate; // 在交易所賣出 USDT
  const withdrawFee = 30; // MAX 出金手續費 30 TWD
  const maxTradeFeeInFloat = CONFIG.arbitrage.maxTradeFeeRate / 100; // MAX 交易手續費率
  const profitTWD = (finalAmount - (finalAmount * maxTradeFeeInFloat)) - initialAmount - withdrawFee; // 最終獲利

  // 檢查是否存在套利機會
  const hasOpportunity = profitTWD > CONFIG.arbitrage.minProfitTWD;

  return {
    usdRate,
    maxRate,
    maiCoinRate,
    config: {
      initialAmount,
      usdAmount,
      usdtAmount,
      finalAmount,
      withdrawFee,
      profitTWD,
    },
    hasOpportunity,
    timestamp: new Date().toISOString()
  };
}

/**
 * 發送 Telegram 通知
 * @param {Object} arbitrageData 套利資料
 * @returns {Promise<void>}
 */
async function sendTelegramNotification(arbitrageData) {
  if (!CONFIG.telegram.enableNotifications || !bot) {
    console.log('Telegram 通知關閉中');
    return;
  }

  try {
    const { config, usdRate, maxRate, maiCoinRate } = arbitrageData;

    // 格式化訊息
    const message = `
🔔 *USDT USD 套利機會提醒* 🔔

✅ *套利路徑*:
聯邦銀行買入 USD -> VA 至 MaiCoin -> MaiCoin 用 USD 買入 USDT -> 內轉至 MAX 交易 -> MAX 賣出 USDT -> 獲利 TWD -> 銀行出金

💰 *預期利潤*:
- 以投入 ${config.initialAmount} TWD 計算
- ${config.profitTWD.toFixed(2)} TWD

💱 *當前匯率*:
- 聯邦銀行 USD/TWD 即期賣出: ${usdRate}
- MaiCoin USDT/USD 買入: ${maiCoinRate}
- MAX Exchange USDT/TWD 賣出: ${maxRate}

⏰ *時間*: ${new Date().toLocaleString()}

⚠️ 請注意市場波動風險及手續費等成本！
`;

    // 發送訊息
    await bot.sendMessage(CONFIG.telegram.chatId, message, { parse_mode: 'Markdown' });
    console.log('Telegram 通知已發送');
  } catch (error) {
    console.error('發送 Telegram 通知失敗:', error.message);
  }
}

/**
 * 把套利資料存到本地端
 * @param {Object} data 套利資料
 */
function saveArbitrageData(data) {
  try {
    // 如果文件存在，讀取現有資料
    let existingData = [];
    if (fs.existsSync(CONFIG.storage.dataFile)) {
      const fileContent = fs.readFileSync(CONFIG.storage.dataFile, 'utf8');
      existingData = JSON.parse(fileContent);
    }

    // 增加新資料
    existingData.push(data);

    // 只保留最近 100 條記錄
    if (existingData.length > 100) {
      existingData = existingData.slice(-100);
    }

    // 寫入文件
    fs.writeFileSync(CONFIG.storage.dataFile, JSON.stringify(existingData, null, 2));
    console.log('套利資料已儲存於文件');
  } catch (error) {
    console.error('儲存套利資料失敗:', error.message);
  }
}

/**
 * 主函數：檢查套利機會
 */
async function checkArbitrageOpportunity() {
  try {
    console.log('開始檢查套利機會...');

    // 並行取得三個資料源的匯率
    const [usdRate, maxRate, maiCoinRate] = await Promise.all([
      getUbotExchangeRate(),
      getMaxExchangeRate(),
      getMaiCoinAskPrice()
    ]);

    console.log('聯邦銀行 USD/TWD 即期賣出:', usdRate);
    console.log('MAX Exchange USDT/TWD 賣出價格:', maxRate);
    console.log('MaiCoin USDT/USD 買入價格:', maiCoinRate);

    // 計算套利機會
    const arbitrageData = calculateArbitrageOpportunity(usdRate, maxRate, maiCoinRate);

    // 輸出結果
    console.log('獲利預估:', arbitrageData.config.profitTWD.toFixed(2) + ' TWD');

    // 保存歷史紀錄
    saveArbitrageData(arbitrageData);

    // 如果有套利機會，發送通知
    if (arbitrageData.hasOpportunity) {
      console.log('發現套利機會！');
      await sendTelegramNotification(arbitrageData);
    } else {
      console.log('未發現足夠大的套利機會。');
    }

    return arbitrageData;
  } catch (error) {
    console.error('檢查套利機會時發生錯誤:', error.message);
    throw error;
  }
}

/**
 * 初始化並啟動套利監控
 */
function startMonitoring() {
  console.log('啟動套利監控系統...');

  // 立即執行一次檢查
  checkArbitrageOpportunity()
    .then(() => console.log('初始檢查完成'))
    .catch(err => console.error('初始檢查失敗:', err.message));

  // 設定定時任務
  cron.schedule(CONFIG.polling.schedule, () => {
    checkArbitrageOpportunity()
      .then(() => console.log('定時檢查完成'))
      .catch(err => console.error('定時檢查失敗:', err.message));
  });

  console.log(`套利監控已啟動，檢查頻率: ${CONFIG.polling.schedule}`);
}

// 如果直接運行此文件，啟動監控
if (require.main === module) {
  startMonitoring();
}

module.exports = {
  getUbotExchangeRate,
  getMaxExchangeRate,
  calculateArbitrageOpportunity,
  checkArbitrageOpportunity,
  startMonitoring
};
