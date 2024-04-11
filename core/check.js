/* global log, button, context, Feed, repeater, sound, offscreen */

self.importScripts('/core/utils/feed.js');

{
    const helper = {
        id(href) {
            const m = href.match(/u\/(?<n>\d+)/);
            if (m) {
                return Number(m.groups.n);
            }
        },
        base(href) {
            return /[^?]*/.exec(href)[0].split('/h')[0].replace(/\/$/, '');
        },
        thread(href) {
            const m = href.match(/message_id=(?<thread>[^&]+)/);
            if (m) {
                return m.groups.thread;
            }
        }
    };

    const isPrivate = false;

    const read = (prefs, type = 'local') => new Promise(resolve => chrome.storage[type].get(prefs, resolve));

    const notify = async (text, title, click = {}, buttons = []) => {
        title = title || chrome.i18n.getMessage('gmail');

        const p2 = await read({
            'silent': false
        }, 'session');
        if (p2.silent) {
            log('[feed]', 'notification is silent', text, title);
            return;
        }

        const p1 = await read({
            'notificationTime': 30 // seconds
        }, 'local');

        let isArray = Array.isArray(text);
        if (isArray && text.length === 1) {
            isArray = false;
            text = text[0];
        }
        // Users on Mac OS X only see the first item.
        if (isArray && navigator.platform.includes('Mac')) {
            isArray = false;
            text = text.join('\n\n');
        }

        // create clear notification alarm
        const when = Date.now() + p1.notificationTime * 1000;
        const id = 'action.' + Math.random();
        await chrome.storage.session.set({
            [id]: {
                buttons: (buttons || []).map(o => o.action),
                click
            }
        });
        await chrome.alarms.create('clear.notification.' + id, {
            when
        });

        // create notification alarm
        const options = {
            type: isArray ? 'list' : 'basic',
            iconUrl: '/data/icons/notification/48.png',
            title,
            message: isArray ? '' : text,
            priority: 2,
            eventTime: when,
            items: isArray ? text.map(message => {
                const tmp = message.split('\n');
                return {
                    title: (tmp[1] || '').replace('Title: ', ''),
                    message: tmp[0].replace('From: ', '')
                };
            }) : [],
            requireInteraction: !!click,
            buttons: buttons.map(b => ({
                title: b.title,
                iconUrl: b.iconUrl
            }))

        };
        if (navigator.userAgent.includes('Firefox')) {
            delete options.requireInteraction;
            delete options.buttons;
        }
        chrome.notifications.create(id, options);
    };

    notify.basic = message => chrome.notifications.create({
        type: 'basic',
        iconUrl: '/data/icons/notification/48.png',
        title: chrome.i18n.getMessage('gmail'),
        message: message || 'Unknown Error - 2'
    });

    chrome.notifications.onClicked.addListener(id => {
        chrome.notifications.clear(id);
        sound.stop();
        if (id.startsWith('action.')) {
            chrome.storage.session.get(id, prefs => {
                chrome.storage.session.remove(id);
                const {click} = prefs[id];
                if (click.cmd === 'open') {
                    const {links} = click;
                    // open the first link and use chrome.tabs.create for the rest
                    self.openLink(links[0]);
                    links.slice(1).forEach(url => chrome.tabs.create({
                        url,
                        active: false
                    }));
                } else {
                    console.error('No action', click);
                }
            });
        }
    });

    chrome.alarms.onAlarm.addListener(o => {
        if (o.name.startsWith('clear.notification.')) {
            const id = o.name.slice(19);
            chrome.notifications.clear(id);
            chrome.storage.session.remove(id);
        }
    });

    if (chrome.notifications.onButtonClicked) {
        chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
            sound.stop();

            chrome.storage.session.get(id, prefs => {
                chrome.storage.session.remove(id);
                chrome.notifications.clear(id);

                const request = prefs[id].buttons[buttonIndex];

                // links might be from different accounts
                const bases = {};
                for (const link of request.links) {
                    const base = helper.base(link);
                    bases[base] = bases[base] || [];
                    bases[base].push(link);
                }
                const requests = Object.values(bases).map(links => ({
                    ...request,
                    links
                }));

                // dispatch
                chrome.storage.local.get({
                    doReadOnArchive: true
                }, prefs => {
                    requests.forEach(r => r.prefs = prefs);
                    Promise.all(requests.map(request => offscreen.command({
                        cmd: 'gmail.action',
                        request
                    }))).then(arr => {
                        const errors = arr.filter(o => o !== true);
                        if (errors.length) {
                            console.error(errors);
                            notify.basic(errors.map(e => e.message).join('\n\n'));
                        }
                    }).finally(() => repeater.reset('action.command', 500));
                });
            });
        });
    }

    const shorten = (str = '', truncate) => {
        if (str.length < truncate) {
            return str;
        }
        return str.substr(0, truncate / 2) + '...' + str.substr(str.length - truncate / 2);
    };

    const attach = () => chrome.action.setPopup({
        popup: '/page/popup/index.html'
    });

    const detach = () => {
        chrome.action.setPopup({
            popup: ''
        }).then(() => chrome.runtime.sendMessage({
                method: 'close-popup'
            }, () => chrome.runtime.lastError
        ))
    };

    // oldFashion: 0 => Always open email preview panel
    //  1 => Open Gmail account if only one account is logged-in
    //  2 => Open Gmail account (forced)
    chrome.storage.onChanged.addListener(ps => {
        if (ps.oldFashion) {
            self.checkEmails.getCached().then(objs => {
                const numberOfAccounts = objs.map(o => o.xml ? o.xml.title : null)
                    .filter((o, i, a) => o && a.indexOf(o) === i).length;
                const hasUnread = objs.map(o => o.xml ? o.xml.fullcount : 0)
                    .reduce((p, c) => p + c, 0);

                if (numberOfAccounts === 1 && ps.oldFashion.newValue === 1) {
                    detach();
                } else if (hasUnread) {
                    attach();
                }
            });
        }
    });

    self.checkEmails = {
        getCached() {
            if (self.checkEmails.cached) {
                return Promise.resolve(self.checkEmails.cached);
            }
            return read({
                'cached-objects': []
            }, 'session').then(prefs => prefs['cached-objects']);
        }
    };

    // fetch mails
    self.checkEmails.execute = async forced => {

        if (forced) {
            button.icon = 'load';
            button.badge = 0;
            // do not use -1; if the user is logged out, the loading need to be stopped
            await chrome.storage.session.set({count: 0});
        }

        // cancel previous execution?
        if (self.checkEmails.controller) {
            self.checkEmails.controller.abort();
        }

        // default option object
        const prefs = await read({
            'url': 'https://mail.google.com/mail/u/0',
            'timeout': 9000,
            'notificationTruncate': 70,
            'combined': navigator.userAgent.includes('Firefox'),
            'maxReport': 3,
            'oldFashion': 0,
            'notification': true,
            'notification.buttons.markasread': true,
            'notification.buttons.archive': true,
            'notification.buttons.trash': false,
            'alert': true,
            'notificationFormat': chrome.i18n.getMessage('notification')
        });
        const controller = self.checkEmails.controller = new AbortController();
        const signal = controller.signal;

        // feeds from account list
        const feeds = [
            'https://mail.google.com/mail/u/0/feed/atom',
            'https://mail.google.com/mail/u/1/feed/atom',
            'https://mail.google.com/mail/u/2/feed/atom',
            'https://mail.google.com/mail/u/3/feed/atom',
            'https://mail.google.com/mail/u/4/feed/atom',
            'https://mail.google.com/mail/u/5/feed/atom'
        ].map(feed => new Feed(feed, prefs.timeout, isPrivate));

        try {
            const objs = [];
            let loggedOutFrom = -1; // keep track of the last logged-out account
            const uids = new Set();
            for (const feed of feeds) {
                if (loggedOutFrom !== -1) {
                    offscreen.command({
                        cmd: 'accounts-logged-out',
                        request: {method: 'accounts-logged-out', data: loggedOutFrom}
                    }).then()
                    break;
                }

                const r = await feed.execute(signal, uid => { // do not check logged-out feeds
                    if (uid) {
                        if (uids.has(uid)) { // this is a logged-out account
                            loggedOutFrom = helper.id(feed.href);
                            return true;
                        }
                        uids.add(uid);
                    }
                }).catch(e => signal.aborted === false && log('[feed]', 'error', e));

                if (signal.aborted) {
                    return log('[feed]', 'skipped');
                }
                if (r && r.notAuthorized) {
                    loggedOutFrom = helper.id(feed.href);
                }

                if (r && r.xml) {
                    // only add logged-in accounts
                    if (r.network && !r.notAuthorized && r.xml && r.xml.entries) {
                        objs.push(r);
                    }
                }
            }

            log('[feed]', 'forced', forced, 'objects', objs);

            const isAuthorized = objs.length !== 0 && objs.some(c => !c.notAuthorized && c.network);
            const count = await new Promise(resolve => chrome.storage.session.get({
                count: -1
            }, prefs => resolve(prefs.count)));

            if (!isAuthorized) {
                if (count !== -1) {
                    button.icon = 'blue';
                    button.badge = 0;
                    chrome.storage.session.set({count: -1});
                    chrome.storage.session.set({
                        'cached-objects': []
                    });
                    if (self.checkEmails.cached) {
                        self.checkEmails.cached.length = 0;
                    }

                    context.accounts('logged.out');
                }
                if (forced) {
                    self.openLink(prefs.url);
                    notify.basic(chrome.i18n.getMessage('log_into_your_account'));
                }
                button.label = chrome.i18n.getMessage('gmail');
                detach();

                log('[feed]', 'ignore checking', 'unauthorized');
                return;
            }

            objs.sort((a, b) => a.xml.link - b.xml.link);

            // simplified version of objs for storing and sending between contexts
            const cachedObjs = objs.map((o, i) => {
                const xml = {
                    ...o.xml
                };
                delete xml.parent;

                return {
                    newIDs: o.newIDs,
                    xml,
                };
            });

            // update cache (only copy a minimal object)
            await chrome.storage.session.set({
                'cached-objects': cachedObjs
            });

            self.checkEmails.cached = objs;

            // save new emails
            for (const o of objs) {
                o.commit();
            }

            // New total count number
            const anyNewEmails = objs.some(c => c.newIDs.length !== 0);
            let newCount = 0;
            for (const obj of objs) {
                newCount += obj.xml.fullcount;
            }

            if (!anyNewEmails && !forced && count === newCount) {
                // Updating panel if it is open
                chrome.runtime.sendMessage({
                    method: 'update-date',
                    data: cachedObjs
                }, () => {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                    // maybe the current email is marked as read but still count is 20 (max value for non inbox labels)
                    chrome.runtime.sendMessage({
                        method: 'validate-current',
                        data: cachedObjs
                    }, () => chrome.runtime.lastError);
                });

                // we could have a new account with no new emails
                chrome.storage.session.get({
                    'accounts.keys': []
                }, prefs => {
                    if (prefs['accounts.keys'].length !== objs.length) {
                        context.accounts('mismatch');
                    }
                });


                return; // Everything is clear
            }
            //
            await chrome.storage.session.set({count: newCount});
            //
            context.accounts('new.email');
            // Preparing the report
            const reportArray = [];
            for (const o of objs) {
                (o.xml && o.xml.entries ? o.xml.entries : []).filter(e => {
                    if (anyNewEmails) {
                        return o.newIDs.includes(e.id);
                    }
                    return o.xml.fullcount !== 0;
                }).forEach(e => {
                    e.parent = o;
                    reportArray.push(e);
                });
            }
            // keep recent ones
            reportArray.sort((a, b) => {
                return (new Date(b.modified)).getTime() - (new Date(a.modified)).getTime();
            });
            reportArray.splice(prefs.maxReport, reportArray.length);

            let report = reportArray.map(e => `From: ${e.author_name}\n` +
                `Title: ${shorten(e.title, prefs.notificationTruncate)}\n` +
                `Summary:  ${shorten(e.summary, prefs.notificationTruncate)}\n`);

            if (prefs.combined) {
                report = [report.join('\n\n')];
            }
            // Preparing the tooltip
            button.label = chrome.i18n.getMessage('gmail') + '\n\n' +
                objs.reduce((p, c) => {
                    return p +
                        c.xml.title +
                        (c.xml.label ? ' [' + c.xml.label + ']' : '') +
                        ' (' + c.xml.fullcount + ')\n';
                }, '').replace(/\n$/, '');

            const singleAccount = prefs.oldFashion === 1 ?
                objs.map(o => o.xml.rootLink).filter((s, i, l) => l.indexOf(s) === i).length === 1 :
                prefs.oldFashion === 2;
            //

            if (!forced && !anyNewEmails) {
                if (newCount) {
                    button.icon = 'red';
                    button.badge = newCount;
                    await chrome.storage.session.set({count: newCount});

                    chrome.runtime.sendMessage({
                        method: 'update',
                        data: cachedObjs
                    }, () => chrome.runtime.lastError);
                    if (singleAccount) {
                        detach();
                    } else {
                        attach();
                    }
                } else {
                    button.icon = 'gray';
                    button.badge = 0;
                    await chrome.storage.session.set({count: 0});
                    detach();
                }
            } else if (forced && !newCount) {
                button.icon = 'gray';
                button.badge = 0;
                await chrome.storage.session.set({count: 0});
                detach();
            } else {
                button.icon = 'new';
                button.badge = newCount;
                await chrome.storage.session.set({count: newCount});
                if (singleAccount) {
                    detach();
                } else {
                    attach();
                }

                if (prefs.notification) {
                    const buttons = [];
                    if (prefs['notification.buttons.markasread']) {
                        buttons.push({
                            title: chrome.i18n.getMessage('popup_read'),
                            iconUrl: '/data/images/read.png',
                            action: {
                                links: reportArray.map(o => o.link),
                                cmd: 'rd'
                            }
                        });
                    }
                    if (prefs['notification.buttons.archive']) {
                        buttons.push({
                            title: chrome.i18n.getMessage('popup_archive'),
                            iconUrl: '/data/images/archive.png',
                            action: {
                                links: reportArray.map(o => o.link),
                                cmd: 'rc_^i'
                            }
                        });
                    }
                    if (prefs['notification.buttons.trash']) {
                        buttons.push({
                            title: chrome.i18n.getMessage('popup_trash'),
                            iconUrl: '/data/images/trash.png',
                            action: {
                                links: reportArray.map(o => o.link),
                                cmd: 'tr'
                            }
                        });
                    }

                    // convert links
                    const links = [];
                    for (const o of reportArray) {
                        try {
                            const base = helper.base(o.link);
                            const thread = helper.thread(o.link);

                            if (thread && o.parent.xml.link.indexOf('#') === -1) {
                                links.push(base + '/?shva=1#inbox/' + thread);
                            } else if (thread) {
                                links.push(o.parent.xml.link + '/' + thread);
                            } else {
                                links.push(o.link);
                            }
                        } catch (e) {
                            console.error(e);
                            links.push(o.link);
                        }
                    }
                    await notify(report, '', {
                        cmd: 'open',
                        links
                    }, buttons.slice(0, 2));
                }
                if (prefs.alert) {
                    const entries = []; // new entries only
                    for (const o of objs) {
                        if (o.xml && o.newIDs.length) {
                            for (const entry of o.xml.entries) {
                                if (o.newIDs.includes(entry.id)) {
                                    entries.push(entry);
                                }
                            }
                        }
                    }
                    sound.play(entries);
                }
                chrome.runtime.sendMessage({
                    method: 'update-reset',
                    data: cachedObjs
                }, () => chrome.runtime.lastError);
            }
        } catch (e) {
            console.error(e);
        }
    };
}

