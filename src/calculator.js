/**
 * 計算套利機會分析
 * @param {number} usdRate 聯邦銀行 USD/TWD 即期賣出匯率
 * @param {number} maxRate MAX Exchange USDT/TWD 賣出價格 (買盤價格)
 * @param {number} maiCoinRate MaiCoin USDT/USD 買入價格
 * @param {Object} configArbitrage 套利配置參數
 * @returns {Object} 完整套利分析數據
 */
function calculateArbitrageOpportunity(usdRate, maxRate, maiCoinRate, configArbitrage) {
  const initialAmount = Number(configArbitrage.baseAmount) || 490000;
  const ubotDiscount = Number(configArbitrage.ubotDiscount ?? 0.035);
  const withdrawFee = Number(configArbitrage.withdrawFee ?? 30);
  const maxTradeFeeRate = Number(configArbitrage.maxTradeFeeRate ?? 0.045);
  const minProfitTWD = Number(configArbitrage.minProfitTWD ?? 1500);

  // 1. 聯邦銀行讓分後實質匯率 (TWD 買入 USD)
  const usdRateNet = usdRate - ubotDiscount;
  const usdAmount = initialAmount / usdRateNet;

  // 2. 在 MaiCoin 用 USD 買入 USDT
  const usdtAmount = usdAmount / maiCoinRate;

  // 3. 在 MAX 交易所賣出 USDT 得 TWD
  const finalAmount = usdtAmount * maxRate;

  // 4. MAX 交易手續費
  const tradeFeeTWD = finalAmount * (maxTradeFeeRate / 100);

  // 5. 扣除手續費與出金費之最終純利
  const profitTWD = (finalAmount - tradeFeeTWD) - initialAmount - withdrawFee;
  const profitRate = (profitTWD / initialAmount) * 100;

  // 6. 是否滿足套利門檻
  const hasOpportunity = profitTWD >= minProfitTWD;

  return {
    usdRate,
    usdRateNet,
    maxRate,
    maiCoinRate,
    config: {
      initialAmount,
      ubotDiscount,
      withdrawFee,
      maxTradeFeeRate,
      minProfitTWD,
      usdAmount: Number(usdAmount.toFixed(4)),
      usdtAmount: Number(usdtAmount.toFixed(4)),
      finalAmount: Number(finalAmount.toFixed(2)),
      tradeFeeTWD: Number(tradeFeeTWD.toFixed(2)),
      profitTWD: Number(profitTWD.toFixed(2)),
      profitRate: Number(profitRate.toFixed(4)),
    },
    hasOpportunity,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  calculateArbitrageOpportunity,
};
