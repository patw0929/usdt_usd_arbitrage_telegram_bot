const axios = require('axios');
const WebSocket = require('ws');

/**
 * 取得聯邦銀行 USD/TWD 匯率 (即期賣出)
 */
async function getUbotExchangeRate() {
  try {
    const response = await axios.post(
      'https://www.ubot.com.tw/MyBank/IBKB040101',
      {}, // request body
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.status !== 200) {
      throw new Error(`聯邦銀行 API 回應異常，Status: ${response.status}`);
    }

    const rateList = response.data?.RespBody?.RateList;
    if (!rateList || !Array.isArray(rateList)) {
      throw new Error('聯邦銀行 API 回傳格式錯誤，找不到 RateList');
    }

    const usdInfo = rateList.find(item => item.CurrencyEName === 'USD');
    if (!usdInfo || !usdInfo.ImmeSell) {
      throw new Error('找不到聯邦銀行 USD 美元即期賣出匯率資料');
    }

    return parseFloat(usdInfo.ImmeSell);
  } catch (error) {
    console.error('[Exchanges] 取得聯邦銀行匯率失敗:', error.message);
    throw error;
  }
}

/**
 * 取得 MAX Exchange USDT/TWD 即期買入/賣出匯率
 */
async function getMaxExchangeRate() {
  try {
    const response = await axios.get('https://max-api.maicoin.com/api/v3/ticker', {
      params: { market: 'usdttwd' },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (response.status !== 200 || !response.data) {
      throw new Error(`MAX Exchange API 錯誤，Status: ${response.status}`);
    }

    const buyPrice = parseFloat(response.data.buy);
    if (isNaN(buyPrice)) {
      throw new Error('MAX Exchange 回傳無效的買盤價格 (data.buy)');
    }

    return buyPrice;
  } catch (error) {
    console.error('[Exchanges] 取得 MAX Exchange 匯率失敗:', error.message);
    throw error;
  }
}

/**
 * 透過 WebSocket 取得 MaiCoin USDT/USD 買入價格 (Ask Price)
 * @param {number} timeoutMs 
 */
function getMaiCoinAskPrice(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let ws = null;
    let timer = null;
    let isSettled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (ws) {
        try {
          ws.removeAllListeners();
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (_) {}
      }
    };

    timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        reject(new Error(`MaiCoin WebSocket 請求超時 (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    try {
      ws = new WebSocket('wss://ws.maicoin.com/ws');

      ws.on('open', () => {
        try {
          ws.send(JSON.stringify({
            action: 'sub',
            subscriptions: [{ channel: 'pricing', market: 'usdtusd' }]
          }));
        } catch (err) {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            reject(err);
          }
        }
      });

      ws.on('message', (data) => {
        if (isSettled) return;
        try {
          const message = JSON.parse(data);
          if (message.c === 'pricing' && message.M === 'usdtusd') {
            const askPrice = message.pr?.ask?.[0]?.price;
            if (askPrice) {
              const parsed = parseFloat(askPrice);
              if (!isNaN(parsed)) {
                isSettled = true;
                cleanup();
                resolve(parsed);
              }
            }
          }
        } catch (err) {
          // parse error or other message format, continue waiting until timeout
        }
      });

      ws.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          reject(err);
        }
      });

      ws.on('close', () => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          reject(new Error('MaiCoin WebSocket 連線意外關閉'));
        }
      });
    } catch (err) {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        reject(err);
      }
    }
  });
}

module.exports = {
  getUbotExchangeRate,
  getMaxExchangeRate,
  getMaiCoinAskPrice,
};
