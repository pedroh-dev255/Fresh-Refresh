let interactionCooldown = false;

function notifyInteraction() {
    if (interactionCooldown) {
        return;
    }

    interactionCooldown = true;
    chrome.runtime.sendMessage({ type: "userInteraction" }).catch(() => {});

    window.setTimeout(() => {
        interactionCooldown = false;
    }, 1000);
}

document.addEventListener("click", notifyInteraction, { passive: true });