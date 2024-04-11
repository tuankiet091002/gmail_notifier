// logger
self.importScripts('/core/utils/log.js');
// tab open setting
self.importScripts('/core/open.js');
// hidden document for sound effect and gmail actions
self.importScripts('/core/offscreen.js');
self.importScripts('/core/context.js');
// button
self.importScripts('/core/button.js');
// sound options handler
self.importScripts('/core/sound.js');
self.importScripts('/core/check.js');
self.importScripts('/core/repeater.js');
self.importScripts('/core/watch.js');


// on clicked for extension icon on toolbar
chrome.action.onClicked.addListener(() => chrome.storage.local.get({
    'url': 'https://mail.google.com/mail/u/0',
    'smartOpen': true
}, async prefs => {
    if (prefs.smartOpen) {
        try {
            const objs = await checkEmails.getCached();
            if (objs && objs.length) {
                // Selected account
                const unreadEntries = [].concat([], ...objs.map(obj => obj.xml.entries));
                // selecting the correct account
                if (unreadEntries.length) {
                    const newestEntry = unreadEntries.sort((p, c) => {
                        const d1 = new Date(p.modified);
                        const d2 = new Date(c.modified);
                        return d1 < d2;
                    })[0];
                    if (newestEntry) {
                        return self.openLink(newestEntry.link);
                    }
                }
                try {
                    return self.openLink(objs[0].xml.entries[0].link);
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }
    return self.openLink(prefs.url);
}));


// chrome.cookies.remove({name: 'GMAIL_AT', url: 'https://mail.google.com/mail/u/0'}, o => {
//     console.log('remove cookie')
//     chrome.cookies.get({name: 'GMAIL_AT', url: 'https://mail.google.com/mail/u/0'}, e => console.log(!!e))
// });

// runtime message handler
chrome.runtime.onMessage.addListener((request, sender, response) => {
    const method = request.method;
    log('[offscreen]', "message handler added")
    if (method === 'update' && request.forced) {
        repeater.reset('popup.forced');
    } else if (method === 'update') {
        repeater.reset('popup', 500);
    } else if (method === 'open') {
        const url = request.url;
        if (typeof url === 'string') {
            self.openLink(url);
        } else if (url.button === 2 || !url.link) {
            return true;
        } else if (url.button === 0 && (url.ctrlKey || url.metaKey)) {
            self.openLink(url.link, true, null, url.isPrivate);
        } else if (url.button === 1) {
            self.openLink(url.link, true, null, url.isPrivate);
        } else {
            self.openLink(url.link, null, null, url.isPrivate);
        }
    } else if (method === 'test-play') {
        sound.play();
    } else if (method === 'stop-sound') {
        sound.stop();
    } else if (method === 'get-at') {
        chrome.cookies.get({
            name: 'GMAIL_AT',
            url: 'https://mail.google.com/mail/u/' + Number(request.account)
        }, o => response(o?.value));
        return true;
    }
});
