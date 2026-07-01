let refreshRunning = false;
let countdownTimer = null;
let currentTabId = null;
let currentTabUrl = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
    initTabs();
    initButtons();
    initInputs();
    await loadCurrentTab();
    await loadState();
    attachRuntimeMessages();
    startCountdownTicker();
}

function startCountdownTicker() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }

    countdownTimer = window.setInterval(() => {
        if (refreshRunning) {
            updateCountdown();
        }
    }, 1000);
}

function attachRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "stateUpdated" && message?.state) {
            if (message.tabId == null || message.tabId === currentTabId) {
                applyState(message.state);
            }
        }

        if (message?.type === "stateUpdated" && message?.timers) {
            renderTimersSummary(message.timers);
        }
    });
}

async function loadCurrentTab() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    currentTabId = tab?.id ?? null;
    currentTabUrl = tab?.url || "";
    const site = document.getElementById("site");

    if (currentTabUrl) {
        site.textContent = currentTabUrl;
        const automationUrlInput = document.getElementById("automationUrl");

        if (automationUrlInput && !automationUrlInput.value) {
            automationUrlInput.value = currentTabUrl;
        }
    } else {
        site.textContent = "Sem página ativa";
    }
}

function initTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
        });
    });
}

function initButtons() {
    document.getElementById("start").addEventListener("click", toggleRefresh);
    document.getElementById("saveCurrentAutomation").addEventListener("click", saveCurrentAutomation);
    document.getElementById("saveAutomation").addEventListener("click", saveCurrentAutomation);
}

function initInputs() {
    const intervalInput = document.getElementById("interval");
    const checkbox = document.getElementById("stopOnUserInteraction");

    intervalInput.addEventListener("change", () => {
        const value = Math.max(1, Number(intervalInput.value) || 30);
        intervalInput.value = value;
        saveSettings();
    });

    checkbox.addEventListener("change", () => {
        document.getElementById("interactionLabel").textContent =
            checkbox.checked ? "Ativado" : "Desativado";
        saveSettings();
    });
}

function saveSettings() {
    if (!currentTabId) {
        return;
    }

    chrome.runtime.sendMessage({
        type: "saveSettings",
        tabId: currentTabId,
        interval: Number(document.getElementById("interval").value) || 30,
        stopOnUserInteraction: document.getElementById("stopOnUserInteraction").checked
    }).catch(() => {});
}

async function loadState() {
    if (!currentTabId) {
        return;
    }

    const response = await chrome.runtime.sendMessage({ type: "getState", tabId: currentTabId });

    if (response?.state) {
        applyState(response.state);
    }

    await loadTimersSummary();
    await loadAutomations();
}

async function loadTimersSummary() {
    const summaryResponse = await chrome.runtime.sendMessage({ type: "getTimersSummary" });

    if (summaryResponse?.timers) {
        renderTimersSummary(summaryResponse.timers);
    }
}

function updateCountdown() {
    const countdown = document.getElementById("countdown");

    if (!refreshRunning) {
        countdown.textContent = "--";
        return;
    }

    const nextRefreshAt = Number(document.querySelector("#countdown")?.dataset?.nextRefreshAt || 0);

    if (!nextRefreshAt) {
        countdown.textContent = "--";
        return;
    }

    const seconds = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    countdown.textContent = `${seconds}s`;
}

function renderTimersSummary(timers) {
    const container = document.getElementById("timersList");

    if (!container) {
        return;
    }

    if (!timers || timers.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum refresh ativo no momento.</div>';
        return;
    }

    container.innerHTML = timers
        .map((timer) => {
            const title = timer.title || `Aba ${timer.tabId}`;
            const siteLabel = timer.url ? shortenUrl(timer.url) : title;
            const status = timer.running ? "Ativo" : "Parado";
            const interval = timer.interval || 30;
            const refreshCount = timer.refreshCount || 0;
            const favicon = timer.faviconUrl
                ? `<img class="timer-favicon" src="${timer.faviconUrl}" alt="${siteLabel}">`
                : `<span class="timer-favicon fallback">${(siteLabel || "S").charAt(0).toUpperCase()}</span>`;

            return `
                <div class="timer-item">
                    <div class="timer-top">
                        <div class="timer-site">
                            ${favicon}
                            <div>
                                <div class="timer-title">${siteLabel}</div>
                                <div class="timer-url">${timer.url ? shortenUrl(timer.url) : "Sem URL"}</div>
                            </div>
                        </div>
                        <div class="timer-actions">
                            <button class="timer-btn secondary" data-action="${timer.running ? "stop" : "start"}" data-tab-id="${timer.tabId}" data-interval="${interval}" data-stop-interaction="${timer.stopOnUserInteraction ? "1" : "0"}">
                                ${timer.running ? "Parar" : "Iniciar"}
                            </button>
                            <button class="timer-btn danger" data-action="delete" data-tab-id="${timer.tabId}">
                                Excluir
                            </button>
                        </div>
                    </div>
                    <div class="timer-meta">Status: ${status} · Intervalo: ${interval}s · Atualizações: ${refreshCount}</div>
                </div>
            `;
        })
        .join("");
}

function shortenUrl(url) {
    if (!url) {
        return "";
    }

    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./i, "");
    } catch {
        return url.replace(/^https?:\/\//i, "").slice(0, 40);
    }
}

async function loadAutomations() {
    const response = await chrome.runtime.sendMessage({ type: "getAutomations" });

    if (response?.automations) {
        renderAutomations(response.automations);
    }
}

function renderAutomations(automations) {
    const container = document.getElementById("automationList");

    if (!container) {
        return;
    }

    if (!automations || automations.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma automação cadastrada.</div>';
        return;
    }

    container.innerHTML = automations
        .map((automation) => `
            <div class="automation-item">
                <div class="automation-item-header">
                    <div>
                        <div class="automation-url">${automation.url}</div>
                        <div class="automation-meta">Intervalo: ${automation.interval || 30}s · Parar com clique: ${automation.stopOnUserInteraction ? "Sim" : "Não"}</div>
                    </div>
                    <div class="automation-actions">
                        <button class="timer-btn danger" data-action="delete-automation" data-automation-id="${automation.id}">Excluir</button>
                    </div>
                </div>
            </div>
        `)
        .join("");
}

function applyState(state) {
    refreshRunning = Boolean(state.running);

    const button = document.getElementById("start");
    button.textContent = refreshRunning ? "■ Parar" : "▶ Iniciar";

    const status = document.getElementById("status");
    status.textContent = refreshRunning ? "Ativo" : "Inativo";
    status.className = `status ${refreshRunning ? "online" : "offline"}`;

    document.getElementById("interval").value = state.interval || 30;

    const checkbox = document.getElementById("stopOnUserInteraction");
    checkbox.checked = Boolean(state.stopOnUserInteraction);
    document.getElementById("interactionLabel").textContent =
        checkbox.checked ? "Ativado" : "Desativado";

    document.getElementById("refreshCount").textContent = state.refreshCount || 0;

    const countdown = document.getElementById("countdown");
    countdown.dataset.nextRefreshAt = state.nextRefreshAt || 0;

    if (refreshRunning && state.nextRefreshAt) {
        updateCountdown();
    } else {
        countdown.textContent = "--";
    }

    startCountdownTicker();
}

async function toggleRefresh() {
    if (!currentTabId) {
        return;
    }

    const interval = Math.max(1, Number(document.getElementById("interval").value) || 30);
    const stopOnUserInteraction = document.getElementById("stopOnUserInteraction").checked;

    const response = await chrome.runtime.sendMessage({
        type: "toggleRefresh",
        tabId: currentTabId,
        interval,
        stopOnUserInteraction
    });

    if (response?.state) {
        applyState(response.state);
        await loadTimersSummary();
    }
}

async function handleTimerAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const tabId = Number(button.dataset.tabId);

    if (!tabId) {
        return;
    }

    if (action === "delete") {
        await chrome.runtime.sendMessage({ type: "deleteTimer", tabId });
        await loadTimersSummary();
        return;
    }

    const interval = Number(button.dataset.interval || 30);
    const stopOnUserInteraction = button.dataset.stopInteraction === "1";

    await chrome.runtime.sendMessage({
        type: "toggleRefresh",
        tabId,
        interval,
        stopOnUserInteraction
    });

    await loadTimersSummary();
}

function initTimerActions() {
    const container = document.getElementById("timersList");

    if (container) {
        container.addEventListener("click", handleTimerAction);
    }
}

function initAutomationActions() {
    const container = document.getElementById("automationList");

    if (container) {
        container.addEventListener("click", handleAutomationAction);
    }
}

async function saveCurrentAutomation() {
    const automationUrl = document.getElementById("automationUrl").value.trim();

    if (!automationUrl) {
        return;
    }

    const interval = Math.max(1, Number(document.getElementById("automationInterval").value) || 30);
    const stopOnUserInteraction = document.getElementById("automationStopOnUserInteraction").checked;

    await chrome.runtime.sendMessage({
        type: "saveAutomation",
        url: automationUrl,
        interval,
        stopOnUserInteraction
    });

    await loadAutomations();
}

async function handleAutomationAction(event) {
    const button = event.target.closest("button[data-action='delete-automation']");

    if (!button) {
        return;
    }

    const id = button.dataset.automationId;

    if (!id) {
        return;
    }

    await chrome.runtime.sendMessage({ type: "deleteAutomation", id });
    await loadAutomations();
}

async function init() {
    initTabs();
    initButtons();
    initInputs();
    initTimerActions();
    initAutomationActions();
    await loadCurrentTab();
    await loadState();
    attachRuntimeMessages();
    startCountdownTicker();
}