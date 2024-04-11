{
    const parseUri = str => {
        const uri = new URL(str);
        if (uri.hostname.startsWith('mail.google')) {
            uri.messageId = (/message_id=([^&]*)|#[^/]*\/([^&]*)/.exec(uri.href) || [])[1] || uri.hash.split('/').pop();
            {
                const a = uri.hash.substr(1).replace('label/', '').split('/');
                a.pop();
                uri.label = a.length ? a.join('/') : '';
            }
        }
        return uri;
    };

    const notify = message => chrome.notifications.create({
        type: 'basic',
        iconUrl: '/data/icons/notification/48.png',
        title: chrome.i18n.getMessage('gmail'),
        message: message || 'Unknown Error - 3'
    });

    self.openLink = (url, inBackground, refresh) => {
        url = url.replace('@private', ''); // some urls might end with "@private" for private mode

        chrome.storage.local.get({
            // 0: background tab
            // 1: new window
            // 2: active tab
            'openMode': 0,
            // ignore opened gmail tags
            'ignoreOpens': false,
            // search for an open Gmail account only on the active window
            'searchMode': true,
            // show desktop notification to warn that Gmail is already opened in the active tab
            'onGmailNotification': true,
        }, async prefs => {

            // option handler
            const mode = prefs.openMode;

            const tabs = prefs.ignoreOpens ? [] : await new Promise(resolve => {
                const options = {};
                if (prefs.searchMode) {
                    options.currentWindow = true;
                }
                chrome.tabs.query(options, tabs => resolve(tabs.filter(t => t.url)));
            });

            const parse2 = parseUri(url);

            for (let i = 0; i < tabs.length; i++) {
                const tab = tabs[i];
                if (tab.url === url) {
                    if (prefs.onGmailNotification && tab.active) {
                        notify(chrome.i18n.getMessage('msg_1'));
                    }
                    const options = {
                        active: true
                    };
                    if (refresh) {
                        options.url = url;
                    }
                    await chrome.tabs.update(tab.id, options);
                    await chrome.windows.update(tab.windowId, {
                        focused: true
                    });
                    return;
                }

                const parse1 = parseUri(tab.url);
                // Only if Gmail
                if (
                    parse1.hostname.startsWith('mail.google') &&
                    parse1.hostname === parse2.hostname &&
                    parse1.pathname.indexOf(parse2.pathname) === 0 &&
                    !/to=/.test(url) &&
                    !/view=cm/.test(url)
                ) {
                    const reload = refresh ||
                        (parse2.messageId && tab.url.indexOf(parse2.messageId) === -1) ||
                        (parse1.messageId && !parse2.messageId); // when opening INBOX when a thread page is open

                    if (tab.active && !reload) {
                        if (prefs.onGmailNotification) {
                            notify(chrome.i18n.getMessage('msg_1'));
                        }
                    }
                    const options = {
                        active: true
                    };
                    if (reload) {
                        options.url = url;
                    }
                    await chrome.tabs.update(tab.id, options);
                    await chrome.windows.update(tab.windowId, {
                        focused: true
                    });

                    return;
                }
            }
            if (mode === 2) {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, ([tab]) => chrome.tabs.update(tab.id, {url}));
            } else if (mode === 0) {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, ([tab]) => {
                    const options = {
                        url,
                        index: tab.index + 1,
                        active: !inBackground
                    };
                    chrome.tabs.create(options);
                });
            } else {
                await chrome.windows.create({
                    url,
                    focused: !inBackground
                });
            }
        });
    };
}
