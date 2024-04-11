'use strict';

// right-click menu
const once = () => {
    chrome.contextMenus.create({
        id: 'root.ctx',
        title: chrome.i18n.getMessage('label_14'),
        contexts: ['action'],
        enabled: false
    }, () => chrome.runtime.lastError);
    chrome.contextMenus.create({
        title: chrome.i18n.getMessage('label_3'),
        contexts: ['action'],
        id: 'disable.ctx'
    }, () => chrome.runtime.lastError);
    for (const id of ['4', '5', '6', '7', '8', '9', '13']) {
        chrome.contextMenus.create({
            parentId: 'disable.ctx',
            id: 'label_' + id,
            title: chrome.i18n.getMessage('label_' + id),
            contexts: ['action']
        }, () => chrome.runtime.lastError);
    }
    // reset silence menu on startup. The actual pref is false
    chrome.storage.session.set({ // Firefox
        silent: false
    }).then(() => {
    });
    chrome.contextMenus.create({
        title: chrome.i18n.getMessage('label_10'),
        type: 'checkbox',
        contexts: ['action'],
        id: 'silent.ctx',
        checked: false
    }, () => {
        if (chrome.runtime.lastError) {
            chrome.contextMenus.update('silent.ctx', {
                checked: true
            }, () => chrome.runtime.lastError);
        }
    });
    chrome.contextMenus.create({
        title: chrome.i18n.getMessage('label_11'),
        contexts: ['action'],
        id: 'label_11'
    }, () => chrome.runtime.lastError);
    chrome.contextMenus.create({
        title: chrome.i18n.getMessage('label_1'),
        contexts: ['action'],
        id: 'label_1'
    }, () => chrome.runtime.lastError);
};

chrome.runtime.onInstalled.addListener(once);
chrome.runtime.onStartup.addListener(once); // for Firefox

/* public methods */
self.context = {};
self.context.accounts = async reason => {
    const accounts = new Map();
    for (const o of await checkEmails.getCached()) {
        const href = o.xml?.rootLink.replace(/\?.*/, '');
        if (href) {
            accounts.set(href, {
                title: o.xml.title
            });
        }
    }
    // "Logged in account" option in right click menu
    chrome.contextMenus.update('root.ctx', {
        enabled: accounts.size !== 0
    });

    // create a unique key to determine whether context menu needs update or not
    const keys = [...accounts.keys()];

    chrome.storage.session.get({
        'accounts.keys': []
    }, prefs => {
        // do we need to update
        if (prefs['accounts.keys'].join(',') === keys.join(',')) {
            log('[menu]', 'accounts menu is up to date');
            return;
        }
        log('[menu]', `Reason: "${reason}"`, prefs['accounts.keys'], keys);
        chrome.storage.session.set({
            'accounts.keys': keys
        });
        // remove old context menu items
        for (const key of prefs['accounts.keys']) {
            chrome.contextMenus.remove(key, () => chrome.runtime.lastError);
        }
        // add new items
        if (accounts.size === 1) {
            const o = accounts.values().next().value;
            chrome.contextMenus.update('root.ctx', o);
        } else {
            chrome.contextMenus.update('root.ctx', {
                title: chrome.i18n.getMessage('label_14')
            });
            for (const [id, o] of accounts) {
                chrome.contextMenus.create({
                    ...o,
                    id,
                    parentId: 'root.ctx',
                    contexts: ['action']
                }, () => chrome.runtime.lastError);
            }
        }
    });
};

{
    const silent = time => {
        // set silent true, then resume alarm
        const next = time => {
            chrome.storage.session.set({
                silent: true
            }).then(() => {
            });
            chrome.alarms.create('resume.alarm', {
                when: Date.now() + time * 1000
            }).then(() => {
            });
        };

        if (time === 'custom') {
            chrome.storage.local.get({
                'silentTime': 10 // minutes
            }, prefs => next(prefs.silentTime * 60));
        } else {
            next(time);
        }
    };

    const resume = () => {
        chrome.alarms.clear('resume.alarm').then(() => {
        });
        chrome.storage.session.set({
            silent: false
        }).then(() => {
        });
    };

    chrome.alarms.onAlarm.addListener(o => {
        if (o.name === 'resume.alarm') {
            resume();
        }
    });
    // update context when option changed
    chrome.storage.onChanged.addListener(ps => {
        if (ps.silent) {
            chrome.contextMenus.update('silent.ctx', {
                checked: !ps.silent.newValue
            });
        }
    });


    // right-click menu listener
    chrome.contextMenus.onClicked.addListener(info => {
        const method = info.menuItemId;

        if (method.startsWith('http')) {
            self.openLink(method);
        } else if (method === 'root.ctx') {
            chrome.storage.session.get({
                'accounts.keys': []
            }, prefs => {
                self.openLink(prefs['accounts.keys'][0]);
            });
        } else if (method === 'label_4') {
            silent(300);
        } else if (method === 'label_5') {
            silent(900);
        } else if (method === 'label_6') {
            silent(1800);
        } else if (method === 'label_7') {
            silent(3600);
        } else if (method === 'label_8') {
            silent(7200);
        } else if (method === 'label_9') {
            silent(18000);
        } else if (method === 'label_13') {
            silent('custom');
        } else if (method === 'label_11') {
            chrome.storage.local.get({
                compose: 'https://mail.google.com/mail/?ui=2&view=cm'
            }, prefs => self.openLink(prefs.compose));
        } else if (method === 'silent.ctx') {
            if (info.checked) {
                resume();
            } else {
                chrome.storage.session.set({
                    silent: true
                }).then(() => {
                });
            }
        } else if (method === 'label_1') {
            repeater.reset('user.request');
        }
    });
}
