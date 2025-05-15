<p align="center">
   <img width="400" src="https://i.imgur.com/wTLd30m.png" />
</p>

<h1 align="center">USDT<>USD 搬磚套利機器人</h1>

## 簡介

這是一個用於監控聯邦銀行 USD/TWD 匯率與 MAX Exchange USDT/TWD 匯率的套利監控系統。
此工具會計算套利空間，並在發現套利機會時通過 Telegram 發送通知，幫助使用者快速掌握市場動態。

主要功能包括：
- 取得聯邦銀行 USD/TWD 即期賣出匯率
- 取得 MaiCoin USDT/USD 買入價格
- 取得 MAX Exchange USDT/TWD 賣出價格
- 計算套利機會並保存歷史資料
- 發送 Telegram 通知提醒套利機會

## 先備條件

1. MaiCoin 帳號
2. MAX 帳號（歡迎使用我的推薦碼 `11c7f274` 註冊 [MAX 交易所](https://max.maicoin.com/signup?r=11c7f274)）
3. 開設 MaiCoin 美元帳戶（聯邦銀行）

## 使用方法

1. **安裝依賴套件**
   在專案目錄下執行以下指令以安裝所需的 Node.js 套件：
   ```bash
   yarn
   ```

2. **設定環境變數**
   請參考下方的「設定方法」部分，配置 `.env` 文件。

3. **啟動監控系統**
   執行以下指令啟動套利監控系統：
   ```bash
   yarn start
   ```

4. **檢視套利資料**
   套利資料會保存至 `arbitrage_data.json` 文件，可直接檢視該文件來了解歷史記錄。

## 設定方法

1. **建立 `.env` 文件**
   請根據專案中的 `.env.example` 文件建立 `.env` 文件，並填入以下參數：
   ```
   TELEGRAM_BOT_TOKEN=你的 Telegram Bot Token
   TELEGRAM_CHAT_ID=你的 Telegram 聊天 ID
   ENABLE_NOTIFICATIONS=是否啟用通知 true/false
   MIN_PROFIT_TWD=最小利潤 (TWD)
   MAX_TRADE_FEE_RATE=MAX交易手續費率 (%)
   BASE_AMOUNT=預計投入金額 (TWD)

   ```

2. **設定檢查頻率**
   修改 `CONFIG.polling.schedule` 的 cron 表達式以調整檢查頻率（預設為每 3 分鐘檢查一次）。

## 注意事項

1. MAX/MaiCoin 的價格並未考量 VIP 價格，若您的身分更優惠，可能可以得到更高的利潤。
2. 無法保證獲利，請自行注意市場波動風險及手續費等成本。

## License

此專案採用 [MIT License](LICENSE) 授權。
您可以自由使用、修改及分發本專案，但需保留原始版權聲明。
