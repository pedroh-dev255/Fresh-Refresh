const DEFAULT_STATE = {
    running: false,
    interval: 30,
    stopOnUserInteraction: false,
    refreshCount: 0,
    nextRefreshAt: null,
    lastRefreshedAt: null,
    userInteracted: false,
    automationId: null
};

let tabStates = {};
let refreshTimers = new Map();
let automations = [];

async function init() {
    const stored = await chrome.storage.local.get(["tabStates", "automations"]);
    tabStates = stored.tabStates || {};
    automations = stored.automations || [];

    Object.entries(tabStates).forEach(([tabId, state]) => {
        if (state?.running) {
            scheduleRefreshLoop(Number(tabId), state);
        }
    });

    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => syncAutomationForTab(tab.id, tab.url)));

    notifyPopup();
}

function persistStates() {
    chrome.storage.local.set({ tabStates, automations });
    notifyPopup();
}

function persistAutomations() {
    chrome.storage.local.set({ tabStates, automations });
    notifyPopup();
}

function getAutomations() {
    return automations.filter((item) => item && item.id);
}

function normalizeUrl(value) {
    return String(value || "").trim().toLowerCase();
}

function matchesAutomation(automation, url) {
    const target = normalizeUrl(url);
    const pattern = normalizeUrl(automation?.url);

    if (!target || !pattern) {
        return false;
    }

    return target === pattern || target.startsWith(pattern);
}

function getMatchingAutomation(url) {
    return getAutomations().find((automation) => automation.enabled !== false && matchesAutomation(automation, url));
}

function saveAutomation(payload) {
    const trimmedUrl = String(payload?.url || "").trim();

    if (!trimmedUrl) {
        return null;
    }

    const automation = {
        id: payload?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        url: trimmedUrl,
        interval: Math.max(1, Number(payload?.interval) || 30),
        stopOnUserInteraction: Boolean(payload?.stopOnUserInteraction),
        enabled: payload?.enabled !== false
    };

    const index = automations.findIndex((item) => item.id === automation.id);

    if (index >= 0) {
        automations[index] = automation;
    } else {
        automations.unshift(automation);
    }

    persistAutomations();
    return automation;
}

function deleteAutomation(id) {
    automations = automations.filter((item) => item.id !== id);
    persistAutomations();
}

async function syncAutomationForTab(tabId, url) {
    if (!tabId) {
        return;
    }

    const matchingAutomation = getMatchingAutomation(url);
    const state = getTabState(tabId);

    if (matchingAutomation) {
        if (!state.running || state.automationId !== matchingAutomation.id) {
            startRefresh(tabId, matchingAutomation.interval, matchingAutomation.stopOnUserInteraction, matchingAutomation.id);
        }
        return;
    }

    if (state.automationId) {
        stopRefresh(tabId);
    }
}

async function syncAllAutomations() {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => syncAutomationForTab(tab.id, tab.url)));
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

async function getTimersSummary() {
    const entries = await Promise.all(
        Object.entries(tabStates).map(async ([tabId, state]) => {
            const tabIdNumber = Number(tabId);
            let title = state?.title || `Aba ${tabId}`;
            let url = "";
            let faviconUrl = "";

            try {
                const tab = await chrome.tabs.get(tabIdNumber);
                title = tab?.title || title;
                url = tab?.url || "";
                faviconUrl = tab?.favIconUrl || "";
            } catch (error) {
                // Ignore missing tabs.
            }

            return {
                tabId: tabIdNumber,
                title,
                url,
                faviconUrl,
                running: Boolean(state?.running),
                interval: Number(state?.interval || 30),
                stopOnUserInteraction: Boolean(state?.stopOnUserInteraction),
                refreshCount: Number(state?.refreshCount || 0)
            };
        })
    );

    return entries
        .sort((a, b) => b.running - a.running || a.tabId - b.tabId);
}

function getTabState(tabId) {
    const id = String(tabId);

    if (!tabStates[id]) {
        tabStates[id] = { ...DEFAULT_STATE, tabId: Number(tabId) };
    }

    return tabStates[id];
}

function scheduleRefreshLoop(tabId, stateOverride) {
    clearRefreshLoop(tabId);

    const state = stateOverride || getTabState(tabId);

    if (!state?.running) {
        return;
    }

    const intervalMs = Math.max(1000, Number(state.interval || 30) * 1000);

    refreshTimers.set(
        tabId,
        setInterval(() => {
            handleRefreshAlarm(tabId);
        }, intervalMs)
    );
}

function clearRefreshLoop(tabId) {
    const timer = refreshTimers.get(tabId);

    if (timer) {
        clearInterval(timer);
        refreshTimers.delete(tabId);
    }
}

async function notifyPopup(tabId = null, stateOverride = null) {
    const timers = await getTimersSummary();

    chrome.runtime.sendMessage({
        type: "stateUpdated",
        tabId,
        state: stateOverride || (tabId !== null ? getTabState(tabId) : null),
        timers
    }).catch(() => {});
}

function stopRefresh(tabId) {
    const state = getTabState(tabId);
    state.running = false;
    state.nextRefreshAt = null;
    state.userInteracted = false;
    state.automationId = null;

    clearRefreshLoop(tabId);
    persistStates();
    notifyPopup(tabId, state);
}

function startRefresh(tabId, interval, stopOnUserInteraction, automationId = null) {
    const state = getTabState(tabId);
    state.running = true;
    state.interval = Math.max(1, Number(interval) || 30);
    state.stopOnUserInteraction = Boolean(stopOnUserInteraction);
    state.userInteracted = false;
    state.automationId = automationId;
    state.nextRefreshAt = Date.now() + state.interval * 1000;

    scheduleRefreshLoop(tabId, state);
    persistStates();
    notifyPopup(tabId, state);
}

async function reloadTargetTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        if (!tab?.id) {
            return;
        }

        if (tab.url && !tab.url.startsWith("http")) {
            return;
        }

        await chrome.tabs.reload(tab.id, { bypassCache: false });
    } catch (error) {
        clearRefreshLoop(tabId);
        delete tabStates[String(tabId)];
        persistStates();
    }
}

async function handleRefreshAlarm(tabId) {
    const state = getTabState(tabId);

    if (!state.running) {
        return;
    }

    if (state.stopOnUserInteraction && state.userInteracted) {
        stopRefresh(tabId);
        return;
    }

    await reloadTargetTab(tabId);

    state.refreshCount += 1;
    state.lastRefreshedAt = new Date().toISOString();
    state.nextRefreshAt = Date.now() + state.interval * 1000;
    persistStates();
    notifyPopup(tabId, state);
}

chrome.runtime.onInstalled.addListener(() => {
    init();
});

chrome.runtime.onStartup.addListener(() => {
    init();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId).then((tab) => syncAutomationForTab(tab.id, tab.url));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
        syncAutomationForTab(tabId, tab.url);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    clearRefreshLoop(tabId);
    delete tabStates[String(tabId)];
    persistStates();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = Number(message?.tabId ?? sender?.tab?.id);

    if (message?.type === "toggleRefresh") {
        if (Number.isNaN(tabId)) {
            sendResponse({ state: null });
            return true;
        }

        if (getTabState(tabId).running) {
            stopRefresh(tabId);
        } else {
            startRefresh(tabId, message.interval, message.stopOnUserInteraction);
        }

        sendResponse({ state: getTabState(tabId) });
        return true;
    }

    if (message?.type === "getState") {
        sendResponse({ state: getTabState(tabId) });
        return true;
    }

    if (message?.type === "getTimersSummary") {
        getTimersSummary().then((timers) => {
            sendResponse({ timers });
        });
        return true;
    }

    if (message?.type === "getAutomations") {
        sendResponse({ automations: getAutomations() });
        return true;
    }

    if (message?.type === "saveAutomation") {
        const automation = saveAutomation(message);
        sendResponse({ automation });
        return true;
    }

    if (message?.type === "deleteAutomation") {
        deleteAutomation(message.id);
        sendResponse({ success: true });
        return true;
    }

    if (message?.type === "deleteTimer") {
        if (!Number.isNaN(tabId)) {
            clearRefreshLoop(tabId);
            delete tabStates[String(tabId)];
            persistStates();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false });
        }

        return true;
    }

    if (message?.type === "saveSettings") {
        const state = getTabState(tabId);
        state.interval = Math.max(1, Number(message.interval) || 30);
        state.stopOnUserInteraction = Boolean(message.stopOnUserInteraction);
        persistStates();
        sendResponse({ state });
        return true;
    }

    if (message?.type === "userInteraction") {
        if (!Number.isNaN(tabId) && getTabState(tabId).running && getTabState(tabId).stopOnUserInteraction) {
            const state = getTabState(tabId);
            state.userInteracted = true;
            stopRefresh(tabId);
            sendResponse({ stopped: true });
        } else {
            sendResponse({ stopped: false });
        }

        return true;
    }

    return false;
});

init();