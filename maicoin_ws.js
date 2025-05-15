const WebSocket = require('ws');

function getMaiCoinAskPrice(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://ws.maicoin.com/ws');
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('MaiCoin WebSocket 請求超時'));
    }, timeout);

    ws.on('open', () => {
      console.log('MaiCoin WebSocket 連接已建立');
      ws.send(JSON.stringify({
        action: 'sub',
        subscriptions: [{ channel: 'index_price', market: 'usdtwd' }]
      }));
      ws.send(JSON.stringify({
        action: 'sub',
        subscriptions: [{ channel: 'pricing', market: 'usdtusd' }]
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.c === 'pricing' && message.M === 'usdtusd') {
          const askPrice = message.pr?.ask?.[0]?.price;
          if (askPrice) {
            clearTimeout(timer);
            ws.close();
            resolve(parseFloat(askPrice));
          }
        }
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = {
  getMaiCoinAskPrice
};
