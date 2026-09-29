# 使用官方 Node.js 22 LTS Alpine 輕量映象檔
FROM node:22-alpine

WORKDIR /app

# 設定環境變數
ENV NODE_ENV=production

# 複製依賴宣告並安裝
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile && yarn cache clean

# 複製其餘原始碼
COPY . .

# 預設 Web Dashboard 端口
EXPOSE 3888

# 啟動命令
CMD ["node", "index.js"]
