// global log & check emails
const repeater = {
    reason: ''
};

repeater.build = (type = 'normal', reason, delay) => chrome.storage.local.get({
    'period': 120, // seconds
}, async prefs => {

    repeater.reason = reason;

    // normal: on startup, fired: repeated alarm
    if (isNaN(delay)) {
        // 1 seconds delay before fetching message
        if (type === 'normal') {
            delay = 1000;
        } else if (type === 'fired') {
            delay = prefs.period * 1000;
        } else {
            delay = 100;
        }
    }
    const now = Date.now();
    const when = now + delay;

    // ignore
    if (type !== 'fired') {
        const next = await chrome.alarms.get('repeater');
        if (next) {
            if (next.scheduledTime > now) {
                if ((when - next.scheduledTime) > 0) {
                    return log('[repeater]', 'ignored', when - next.scheduledTime);
                }
            }
        }
    }

    log('[repeater]', `Reason: "${reason}"`, `Type: "${type}"`, `Delay: ${(delay / 1000).toFixed(2)}s`);

    await chrome.alarms.create('repeater', {
        when,
        periodInMinutes: prefs.period / 60
    });
});

repeater.reset = (reason, delay) => repeater.build('now', reason, delay);

// alarm
chrome.alarms.onAlarm.addListener(o => {
    if (o.name === 'repeater') {
        repeater.build('fired', 'alarm.fired'); // make sure we can handle less than a minute calls

        const forced = ['user.request', 'options.changes', 'change.of.feeds', 'popup.forced'].includes(repeater.reason)
        checkEmails.execute(forced);
    }
});

// startup
chrome.runtime.onStartup.addListener(() => repeater.build('normal', 'startup'));
chrome.runtime.onInstalled.addListener(() => repeater.build('normal', 'startup'));

// idle
chrome.runtime.onStartup.addListener(() => chrome.storage.local.get({
    'idle-detection': 5 // minutes
}, prefs => {
    chrome.idle.setDetectionInterval(prefs['idle-detection'] * 60);
}));

chrome.idle.onStateChanged.addListener(name => {
    if (name === 'active') {
        repeater.reset('exit.idle');
    }
});

/* pref changes */
chrome.storage.onChanged.addListener(prefs => {
    if (prefs.minimal) {
        repeater.reset('change.of.feeds');
    }
    if (prefs.clrPattern || prefs.badge) {
        repeater.reset('options.changes');
    }
    if (prefs.period) {
        repeater.reset('period.changed');
    }
    if (prefs.oldFashion) {
        repeater.reset('options.changes');
    }
});
