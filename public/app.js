// USDT <> USD Arbitrage Dashboard Client Logic

let chartInstance = null;
let clientDashboardKey = localStorage.getItem('dashboard_key') || '';
let currentLastCheckTimestamp = null;

// Dynamic check time display with relative counter
function updateCheckTimeDisplay() {
  if (!currentLastCheckTimestamp) {
    lastCheckTimeEl.textContent = '--:--:--';
    return;
  }
  const d = new Date(currentLastCheckTimestamp);
  const timeStr = d.toLocaleTimeString('zh-TW', { hour12: false });
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));

  let relativeStr = '';
  if (diffSec < 5) {
    relativeStr = '剛剛';
  } else if (diffSec < 60) {
    relativeStr = `${diffSec} 秒前`;
  } else if (diffSec < 3600) {
    const min = Math.floor(diffSec / 60);
    relativeStr = `${min} 分鐘前`;
  } else {
    const hr = Math.floor(diffSec / 3600);
    relativeStr = `${hr} 小時前`;
  }

  lastCheckTimeEl.innerHTML = `${timeStr} <span class="relative-time">(${relativeStr})</span>`;
}

// DOM Elements
const monitorStatusBadge = document.getElementById('monitorStatusBadge');
const lastCheckTimeEl = document.getElementById('lastCheckTime');
const btnManualCheck = document.getElementById('btnManualCheck');
const opportunityBanner = document.getElementById('opportunityBanner');
const opportunityText = document.getElementById('opportunityText');

// Metrics
const profitCard = document.getElementById('profitCard');
const metricProfit = document.getElementById('metricProfit');
const profitRateTag = document.getElementById('profitRateTag');
const metricBaseAmount = document.getElementById('metricBaseAmount');
const metricMinProfit = document.getElementById('metricMinProfit');
const metricUbotRate = document.getElementById('metricUbotRate');
const metricDiscount = document.getElementById('metricDiscount');
const metricNetUsdRate = document.getElementById('metricNetUsdRate');
const metricMaiCoinRate = document.getElementById('metricMaiCoinRate');
const metricUsdtAmount = document.getElementById('metricUsdtAmount');
const metricMaxRate = document.getElementById('metricMaxRate');
const metricFeeRate = document.getElementById('metricFeeRate');
const metricFinalAmount = document.getElementById('metricFinalAmount');

// Controls & Form
const toggleMonitoring = document.getElementById('toggleMonitoring');
const toggleNotifications = document.getElementById('toggleNotifications');
const configForm = document.getElementById('configForm');
const inputBaseAmount = document.getElementById('inputBaseAmount');
const inputMinProfit = document.getElementById('inputMinProfit');
const inputMaxFee = document.getElementById('inputMaxFee');
const inputUbotDiscount = document.getElementById('inputUbotDiscount');
const inputWithdrawFee = document.getElementById('inputWithdrawFee');
const inputInterval = document.getElementById('inputInterval');
const historyTableBody = document.getElementById('historyTableBody');
const chartPointsCount = document.getElementById('chartPointsCount');

// Password Modal
const passwordModal = document.getElementById('passwordModal');
const modalPasswordInput = document.getElementById('modalPasswordInput');
const btnSubmitPassword = document.getElementById('btnSubmitPassword');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Request Helper with Auth Header
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(clientDashboardKey ? { 'x-dashboard-key': clientDashboardKey } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(endpoint, { ...options, headers });
  if (res.status === 401) {
    passwordModal.classList.remove('hidden');
    throw new Error('未授權，需要密碼驗證');
  }
  return res.json();
}

// Format numbers
function formatMoney(num) {
  if (num === undefined || num === null || isNaN(num)) return '--';
  return Number(num).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('arbitrageChart').getContext('2d');

  // Neon gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '預估獲利 (TWD)',
          data: [],
          borderColor: '#06b6d4',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#080c14',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: '通知門檻 (TWD)',
          data: [],
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: "'Outfit', sans-serif", size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', maxRotation: 0, font: { family: "'JetBrains Mono', monospace", size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            color: '#94a3b8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (v) => `${v.toLocaleString()}元`
          }
        }
      }
    }
  });
}

function updateChartData(historyList, minProfitThreshold = 1000) {
  if (!chartInstance || !Array.isArray(historyList)) return;

  const displayList = historyList.slice(-50); // Show last 50 points
  chartPointsCount.textContent = `${displayList.length} 筆資料`;

  const labels = displayList.map(item => {
    const d = new Date(item.timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  });

  const profits = displayList.map(item => item.config?.profitTWD ?? 0);
  const thresholds = displayList.map(() => minProfitThreshold);

  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].data = profits;
  chartInstance.data.datasets[1].data = thresholds;

  // Dynamically change line color if latest point is opportunity
  const latestProfit = profits[profits.length - 1] || 0;
  if (latestProfit >= minProfitThreshold) {
    chartInstance.data.datasets[0].borderColor = '#10b981';
    chartInstance.data.datasets[0].pointBackgroundColor = '#10b981';
  } else {
    chartInstance.data.datasets[0].borderColor = '#06b6d4';
    chartInstance.data.datasets[0].pointBackgroundColor = '#06b6d4';
  }

  chartInstance.update();
}

function updateHistoryTable(historyList) {
  if (!Array.isArray(historyList) || historyList.length === 0) {
    historyTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暫無歷史紀錄</td></tr>';
    return;
  }

  const reversed = [...historyList].reverse().slice(0, 30);
  historyTableBody.innerHTML = reversed.map(item => {
    const d = new Date(item.timestamp);
    const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    const profit = item.config?.profitTWD ?? 0;
    const profitRate = item.config?.profitRate ?? 0;
    const isOpp = item.hasOpportunity;
    const profitColor = profit >= 0 ? '#34d399' : '#fb7185';

    return `
      <tr>
        <td>${timeStr}</td>
        <td>$${item.usdRate ?? '--'}</td>
        <td>$${item.maiCoinRate ?? '--'}</td>
        <td>NT$${item.maxRate ?? '--'}</td>
        <td style="color: ${profitColor}; font-weight: 700;">${profit >= 0 ? '+' : ''}${formatMoney(profit)}</td>
        <td>${profitRate.toFixed(2)}%</td>
        <td>
          <span class="tag ${isOpp ? 'tag-success' : 'tag-neutral'}">
            ${isOpp ? '🎯 套利機會' : '未達標'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

const authStatusBadge = document.getElementById('authStatusBadge');
const authUserText = document.getElementById('authUserText');
const errorAlertBanner = document.getElementById('errorAlertBanner');
const errorAlertText = document.getElementById('errorAlertText');
const errorAlertTime = document.getElementById('errorAlertTime');

// Apply status data to UI
function applyStatus(data) {
  const { config, lastResult, lastCheckTime, isChecking, lastError, consecutiveFailures } = data;

  // Cloudflare Zero Trust Auth Badge
  if (config.auth?.isCloudflareZeroTrust) {
    authStatusBadge.classList.remove('hidden');
    authUserText.textContent = config.auth.userEmail || 'Zero Trust 驗證通過';
    passwordModal.classList.add('hidden');
  } else {
    authStatusBadge.classList.add('hidden');
  }

  // Error Alert Banner & Status Badge
  if (lastError) {
    errorAlertBanner.classList.remove('hidden');
    const failsText = consecutiveFailures > 1 ? ` (已連續失敗 ${consecutiveFailures} 次)` : '';
    errorAlertText.textContent = `${lastError.message}${failsText}`;
    if (lastError.time) {
      errorAlertTime.textContent = new Date(lastError.time).toLocaleTimeString('zh-TW', { hour12: false });
    }
    if (config.polling.enabled) {
      monitorStatusBadge.className = 'status-badge status-error';
      monitorStatusBadge.querySelector('.text').textContent = '連線異常中';
    } else {
      monitorStatusBadge.className = 'status-badge status-paused';
      monitorStatusBadge.querySelector('.text').textContent = '監控已暫停';
    }
  } else {
    errorAlertBanner.classList.add('hidden');
    if (config.polling.enabled) {
      monitorStatusBadge.className = 'status-badge status-running';
      monitorStatusBadge.querySelector('.text').textContent = '自動輪詢中';
    } else {
      monitorStatusBadge.className = 'status-badge status-paused';
      monitorStatusBadge.querySelector('.text').textContent = '監控已暫停';
    }
  }

  // Last check time
  if (lastCheckTime) {
    currentLastCheckTimestamp = lastCheckTime;
    updateCheckTimeDisplay();
  }

  // Toggles
  toggleMonitoring.checked = !!config.polling.enabled;
  toggleNotifications.checked = !!config.telegram.enableNotifications;

  // Inputs populate
  inputBaseAmount.value = config.arbitrage.baseAmount;
  inputMinProfit.value = config.arbitrage.minProfitTWD;
  inputMaxFee.value = config.arbitrage.maxTradeFeeRate;
  inputUbotDiscount.value = config.arbitrage.ubotDiscount;
  inputWithdrawFee.value = config.arbitrage.withdrawFee;
  inputInterval.value = config.polling.intervalMinutes;

  // Footer labels in cards
  metricBaseAmount.textContent = `${Number(config.arbitrage.baseAmount).toLocaleString()} 元`;
  metricMinProfit.textContent = `${Number(config.arbitrage.minProfitTWD).toLocaleString()} 元`;
  metricDiscount.textContent = `$${config.arbitrage.ubotDiscount}`;
  metricFeeRate.textContent = `${config.arbitrage.maxTradeFeeRate}%`;

  // Last check calculation card
  if (lastResult) {
    const profit = lastResult.config?.profitTWD ?? 0;
    const rate = lastResult.config?.profitRate ?? 0;
    metricProfit.textContent = (profit > 0 ? '+' : '') + formatMoney(profit);
    profitRateTag.textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
    profitRateTag.className = `tag ${profit >= 0 ? 'tag-success' : 'tag-danger'}`;

    if (lastResult.hasOpportunity) {
      profitCard.className = 'card metric-card profit-card opportunity';
      opportunityBanner.classList.remove('hidden');
      opportunityText.textContent = `當前預估獲利 NT$ ${formatMoney(profit)}，超過門檻 NT$ ${formatMoney(config.arbitrage.minProfitTWD)}！`;
    } else {
      profitCard.className = `card metric-card profit-card ${profit < 0 ? 'negative' : ''}`;
      opportunityBanner.classList.add('hidden');
    }

    metricUbotRate.textContent = lastResult.usdRate || '--';
    metricNetUsdRate.textContent = lastResult.usdRateNet ? lastResult.usdRateNet.toFixed(3) : '--';
    metricMaiCoinRate.textContent = lastResult.maiCoinRate || '--';
    metricMaxRate.textContent = lastResult.maxRate || '--';

    if (lastResult.config) {
      metricUsdtAmount.textContent = `${lastResult.config.usdtAmount?.toLocaleString()} U`;
      metricFinalAmount.textContent = `NT$ ${lastResult.config.finalAmount?.toLocaleString()}`;
    }
  }

  // Button loading state
  if (isChecking) {
    btnManualCheck.classList.add('loading');
    btnManualCheck.querySelector('.btn-text').textContent = '檢查中...';
  } else {
    btnManualCheck.classList.remove('loading');
    btnManualCheck.querySelector('.btn-text').textContent = '立即手動檢查';
  }
}

// Fetch Full Dashboard State
async function refreshDashboard() {
  try {
    const [statusData, historyData] = await Promise.all([
      apiRequest('/api/status'),
      apiRequest('/api/history?limit=100')
    ]);

    applyStatus(statusData);
    if (historyData?.data) {
      updateChartData(historyData.data, statusData.config?.arbitrage?.minProfitTWD);
      updateHistoryTable(historyData.data);
    }
  } catch (err) {
    console.error('Failed to refresh dashboard:', err);
  }
}

// Event Listeners
btnManualCheck.addEventListener('click', async () => {
  try {
    btnManualCheck.classList.add('loading');
    btnManualCheck.querySelector('.btn-text').textContent = '檢查中...';
    showToast('正在連線取得三大匯率並進行套利試算...');
    const res = await apiRequest('/api/check', { method: 'POST' });
    if (res.success) {
      showToast('檢查完成！');
      await refreshDashboard();
    } else {
      showToast(`檢查失敗: ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnManualCheck.classList.remove('loading');
    btnManualCheck.querySelector('.btn-text').textContent = '立即手動檢查';
  }
});

toggleMonitoring.addEventListener('change', async () => {
  try {
    const res = await apiRequest('/api/toggle-monitor', { method: 'POST' });
    if (res.success) {
      showToast(`定時監控已${res.enabled ? '啟動 🟢' : '暫停 ⏸️'}`);
      refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

toggleNotifications.addEventListener('change', async () => {
  try {
    const res = await apiRequest('/api/toggle-notifications', { method: 'POST' });
    if (res.success) {
      showToast(`Telegram 通知已${res.enableNotifications ? '開啟 🔔' : '關閉 🔕'}`);
      refreshDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    arbitrage: {
      baseAmount: Number(inputBaseAmount.value),
      minProfitTWD: Number(inputMinProfit.value),
      maxTradeFeeRate: Number(inputMaxFee.value),
      ubotDiscount: Number(inputUbotDiscount.value),
      withdrawFee: Number(inputWithdrawFee.value),
    },
    polling: {
      intervalMinutes: Number(inputInterval.value)
    }
  };

  try {
    const res = await apiRequest('/api/config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast('設定已成功保存並套用！');
      refreshDashboard();
    } else {
      showToast(`儲存失敗: ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Password Modal Event
btnSubmitPassword.addEventListener('click', () => {
  const val = modalPasswordInput.value.trim();
  if (val) {
    clientDashboardKey = val;
    localStorage.setItem('dashboard_key', val);
    passwordModal.classList.add('hidden');
    refreshDashboard();
  }
});

// Init on load
window.addEventListener('DOMContentLoaded', () => {
  initChart();
  refreshDashboard();
  // Auto refresh dashboard data every 15 seconds
  setInterval(refreshDashboard, 15000);
  // Live relative time ticking every second (e.g. 剛剛 -> 15 秒前)
  setInterval(updateCheckTimeDisplay, 1000);
});
