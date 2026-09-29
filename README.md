<p align="center">
  <img width="800" src="./public/images/lode_runner_hero.jpg" alt="USDT Arbitrage Lode Runner Edition" />
</p>

<h1 align="center">USDT &lt;&gt; USD 搬磚套利監控系統</h1>

<p align="center">
  即時監控聯邦銀行 USD/TWD 匯率、MaiCoin USDT/USD 盤價與 MAX 交易所 USDT/TWD 盤價，自動計算套利空間。<br>
  配備高質感 Web 儀表板與 Telegram 雙向遙控機器人，支援一鍵參數熱更新與 VPS 容器化部署。
</p>

---

## ✨ 核心特色與改進

1. **🖥️ 現代高質感 Web Dashboard**
   - **即時盤口卡片**：即時掌握聯邦即期賣出、MaiCoin 買入、MAX 賣出與預估純利潤。
   - **動態開關與調參面板**：隨時在網頁一鍵切換「定時輪詢監控」與「Telegram 警報」，即時修改本金、利潤門檻、換匯讓分與手續費，**儲存立即生效（無需重啟）**。
   - **互動走勢圖表 (Chart.js)**：視覺化展示歷史套利純利趨勢與門檻對比。
   - **安全性防護**：支援設定 `DASHBOARD_PASSWORD` 啟用存取密碼保護。

2. **🤖 Telegram 雙向遙控互動**
   - 不需開網頁，直接在手機 Telegram 聊天室遙控 VPS 主機：
     - `/menu`：呼叫 Inline Keyboard 互動按鈕（點擊一鍵手動檢查、切換開關）。
     - `/status`：查看當前監控狀態、即時三大盤口與試算利潤。
     - `/check`：立即抓取即時匯率並計算套利結果。
     - `/toggle`：一鍵切換背景自動輪詢 (開啟 / 暫停)。
     - `/notify`：一鍵切換 Telegram 警報推播 (開啟 / 關閉)。
     - `/set_profit <金額>`：調整通知利潤門檻。
     - `/set_amount <金額>`：調整投入本金。

3. **🛡️ 企業級程式碼強健度**
   - **修復 Axios POST 參數問題**：修正以往自訂 Header 與 Timeout 未生效之問題。
   - **WebSocket 生命週期管理**：完善超時清理與連線釋放，防禦記憶體洩漏。
   - **原子寫入保護**：歷史紀錄採用 Atomic Write，避免進程中斷導致 JSON 損毀。
   - **完全參數化**：聯邦讓分優惠、提領手續費等常數全部抽離至統一配置。

---

## 🚀 快速開始

### 1. 安裝依賴

```bash
yarn
```

### 2. 配置環境變數

複製 `.env.example` 為 `.env`，並填入 Telegram Token 與相關設定：

```bash
cp .env.example .env
```

```ini
# Telegram 設定
TELEGRAM_BOT_TOKEN=你的_Telegram_Bot_Token
TELEGRAM_CHAT_ID=你的_Telegram_Chat_ID
ENABLE_NOTIFICATIONS=true

# 策略與手續費設定
BASE_AMOUNT=490000
MIN_PROFIT_TWD=1000
MAX_TRADE_FEE_RATE=0.045
UBOT_DISCOUNT=0.035
WITHDRAW_FEE=30
POLLING_INTERVAL_MINUTES=1

# Web 儀表板設定
PORT=3888
DASHBOARD_PASSWORD=你的儀表板密碼(選填)
```

### 3. 本地開發啟動 (無需 Docker)

本地開發時直接使用標準 Yarn 指令即可，支援動態熱載入與即時測試：

```bash
yarn start
```

啟動後即可在瀏覽器開啟 Web 儀表板：
👉 **http://localhost:3888**

執行健康度與試算測試：
```bash
yarn test
```

---

## 🚀 VPS 自動化部署 (GitHub Actions + Docker Compose)

本專案提供標準的 GitHub Actions CI/CD 自動化部署流程：
當推送到 `master` 分支時，GitHub Actions 會自動透過 SSH rsync 同步程式碼，並在 VPS 上自動建置與重啟 Docker 容器。

### 1. 設定 GitHub Repository Secrets
請在 GitHub 專案的 **Settings** -> **Secrets and variables** -> **Actions** 中設定：

| Secret 名稱 | 說明 | 範例 / 預設值 |
| :--- | :--- | :--- |
| `SERVER_HOST` | VPS 伺服器 IP 或主機名稱 | `your-server-ip-or-domain.com` |
| `SERVER_USER` | SSH 連線使用者名稱 | `ubuntu` / `root` |
| `SERVER_SSH_KEY` | SSH 私鑰 (Private Key) | `-----BEGIN OPENSSH PRIVATE KEY...` |
| `SERVER_PORT` | SSH 連線 Port (選填，若非預設 22 請務必填寫) | `22` |
| `SERVER_APP_DIR` | 專案在 VPS 上的存放路徑 (選填) | `~/apps/usdt_usd_arbitrage_telegram_bot/` |

### 2. VPS 初次設定準備
在 VPS 伺服器上建立專案目錄並放置 `.env`：
```bash
# 建立部署目錄
mkdir -p ~/apps/usdt_usd_arbitrage_telegram_bot
cd ~/apps/usdt_usd_arbitrage_telegram_bot

# 建立環境變數檔
nano .env
# (填入 TELEGRAM_BOT_TOKEN, ALLOWED_EMAILS 等設定)
```

### 3. 自動觸發部署
只要執行 `git push origin master`，或在 GitHub Actions 頁面手動點擊 **Run workflow**，即會自動：
1. 透過 rsync 同步檔案（自動排除 `node_modules`、`.git`、`data`、`.env`、`user_config.json`）。
2. 在 VPS 執行 `docker compose up -d --build` 更新容器。
3. 自動清理過期無用映像檔 (`docker image prune -f`)。

### 4. 配置 Nginx 反向代理 (選用)

參考專案內隨附的 `nginx.conf.example`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 憑證 (若使用 Cloudflare 橘雲且 SSL 設為 Full，亦可使用主機自簽憑證)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 轉發 Cloudflare Zero Trust 驗證標頭
        proxy_set_header Cf-Access-Authenticated-User-Email $http_cf_access_authenticated_user_email;
        proxy_set_header Cf-Access-Jwt-Assertion $http_cf_access_jwt_assertion;
    }
}
```

> **💡 多站點共存提示**：若同一台 VPS 同時運行多個專案服務，請確保各子網域皆有配置獨立的 `server_name` 與 `proxy_pass`，避免 HTTPS 請求因未匹配專屬網域而預設 fallback 至第一個站點。

---

## 🔒 進階資安：Cloudflare Zero Trust (Access) 設定教學

使用 Email One-Time PIN (OTP) 驗證是防禦暴力破解 (Brute-force) 與爬蟲掃描的最強方式。

### 為什麼推薦 Cloudflare Zero Trust？
* **零攻擊面 (Zero Attack Surface)**：未經授權的流量在 Cloudflare 邊緣節點就被攔截要求驗證，根本不會碰觸到你的 VPS。
* **無密碼可猜**：每次登入皆需要發送 6 位數動態驗證碼至你的 Email。
* **無縫身分識別**：驗證通過後，儀表板會自動在導覽列顯示你的身分 Badge（例如：`🛡️ your-email@example.com`）。

### 設定步驟：
1. 登入 [Cloudflare Zero Trust 控制台](https://one.dash.cloudflare.com/)。
2. 進入 **Access** -> **Applications** -> 點擊 **Add an application**。
3. 選擇 **Self-hosted**：
   * Application name：`USDT Arbitrage Dashboard`
   * Application domain：`your-subdomain.your-domain.com`（或專用子網域）
4. 設定 **Policies (存取政策)**：
   * Policy name：`Owner Access Only`
   * Action：`Allow`
   * Session Duration：依喜好設定（例如 `24 Hours` 或 `7 Days`）
   * **Configure rules**：
     * Selector：`Emails`
     * Value：輸入你的個人信箱（如 `your-email@example.com`）
5. 點擊 **Save application** 即可！
6. *(選填加固)* 在本專案的 `.env` 中設定 `ALLOWED_EMAILS=your-email@example.com`，後端會雙重檢查確保非白名單帳號一律回傳 403 Forbidden。
7. *(資安最佳實踐)* 強烈建議搭配 **Cloudflare Tunnel (`cloudflared`)** 直連容器 Port 3888（伺服器完全無需對外開放 80/443 Port），或在 Nginx/伺服器防火牆限制僅允許 Cloudflare IP 存取，杜絕公網繞過 Zero Trust 偽造標頭。

---

## ⚠️ 注意事項

1. **台灣銀行端海外連線限制**：聯邦銀行網站有時可能對非台灣 IP 採取限流或防火牆阻擋。若 VPS 架設在海外，請先於主機執行 `curl -X POST https://www.ubot.com.tw/MyBank/IBKB040101` 驗證連線狀況。
2. **手續費與身分等級**：MAX / MaiCoin 實際價格與費率可能依 VIP 等級而異，請在儀表板或 `.env` 依個人費率彈性調整。
3. **投資風險**：任何跨平台套利搬磚皆存在匯率滑價、鏈上或法幣提轉等待時間風險，請審慎評估。

---

## 🎁 推薦註冊

歡迎使用我的推薦碼註冊 MAX 交易所：`11c7f274`（[點此註冊](https://max.maicoin.com/signup?r=11c7f274)）

## 📄 License

MIT License.
