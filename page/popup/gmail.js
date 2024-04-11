'use strict';

const gmail = {};
const bodyCache = new Map();
const keyCache = {
    iks: new Map(),
    ats: new Map()
};
const labelCache = new Map()

gmail.get = {
    base: url => /[^?]*/.exec(url)[0],
    account: url => {
        const tmp = /u\/(\d+)/.exec(url);
        if (tmp && tmp.length) {
            return tmp[1];
        }
        return null;
    },
    thread: url => {
        const tmp = /message_id=([^&]*)/.exec(url);
        if (tmp && tmp.length) {
            return tmp[1];
        }
        return null;
    },
};

gmail.body = link => {

    const url = gmail.get.base(link);
    const thread = gmail.get.thread(link);

    if (!thread) {
        return Promise.reject(Error('body -> Error at resolving thread. Please switch back to the summary mode.'));
    }

    if (bodyCache.has(thread)) {
        return Promise.resolve(gmail.render(bodyCache.get(thread)));
    }

    const href = url + '/?ui=2&view=pt&dsqt=1&search=all&msg=' + thread;

    return fetch(href, {
        credentials: 'include'
    }).then(r => {
        if (!r.ok) {
            throw Error('body -> print failed -> ' + r.status);
        }

        return r.text();
    }).then(content => {
        bodyCache.set(thread, content);
        return gmail.render(content);
    });
};

gmail.page = n => {
    if (keyCache.iks.has(n)) {
        return Promise.resolve(keyCache.iks.get(n));
    }

    const keyId = localStorage.getItem('keyId-' + n)
    if (keyId) {
        keyCache.iks.set(n, {ik: keyId});
        return {ik: keyId};
    }

    const page = localStorage.getItem('page-' + n) || `https://mail.google.com/mail/u/${n}/s/`;
    const next = async href => {

        const r = await fetch(href, {
            credentials: 'include'
        });

        if (r.ok) {
            const content = await r.text();
            const m = content.match(/ID_KEY\s*=\s*['"](?<ik>[^'"]*)['"]/);
            if (m) {
                keyCache.iks.set(n, m.groups);
                localStorage.setItem('keyId-' + n, m.groups.ik)
                return m.groups;
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const meta = doc.querySelector('meta[http-equiv="refresh"]');

            if (meta) {
                const url = meta.content.split('url=')[1];
                if (url) {
                    const o = new URL(url, page);
                    localStorage.setItem('page-' + n, o.href);

                    return next(o.href);
                }
            }
        }
        throw Error('core.js -> id_key');
    };

    return next(page);
};

gmail.at = (url) => {
    const account = gmail.get.account(url)
    const thread = gmail.get.thread(url)

    if (keyCache.ats.has(account)) {
        return Promise.resolve(keyCache.ats.get(account));
    }

    return new Promise((resolve, reject) => chrome.runtime.sendMessage({
        method: 'get-at',
        account
    }, at => {

        if (at) {
            keyCache.ats.set(account, at);
            resolve(at);
        }

        // backup plan
        else {
            console.info('[core]', 'Using alternative method to get GMAIL_AT');

            const link = `https://mail.google.com/mail/u/${account}/?ui=2&view=pt&dsqt=1&search=all&msg=${thread}`;
            return fetch(link, {credentials: "include"}).then(r => {
                if (r.ok) {
                    r.text().then(content => bodyCache[thread] = content)

                    return chrome.runtime.sendMessage({
                        method: 'get-at',
                        account
                    }, at => {
                        if (at) {
                            keyCache.ats.set(account, at);
                            resolve(at);
                        } else {
                            return chrome.runtime.lastError
                        }
                    })
                }
            }).catch(() => reject("at not found"))

        }
    }));
};

gmail.labels = async ({url, query}) => {

    const account = gmail.get.account(url)
    if (!account)
        throw Error('core.js -> valid_m');

    if (labelCache.has(account))
        return Promise.resolve(labelCache.get(account))

    const {ik} = await gmail.page(account);
    if (!ik) {
        throw Error('core.js -> ik -> empty');
    }

    const at = await gmail.at(url);
    if (!at) {
        throw Error('core.js -> at -> empty');
    }

    const body = new URLSearchParams();
    body.append('s_jr', JSON.stringify([null, [
        [null, null, null, null, null, null, [null, true, false]],
        [null, [null, query, 0, null, 80, null, null, null, false, [], [], true]]
    ], 2, null, null, null, ik]));

    const href = `https://mail.google.com/mail/u/${account}/s/?v=or&ik=${ik}&at=${at}&subui=chrome&hl=en&ts=` + Date.now();
    const r = await fetch(href, {
        method: 'POST',
        credentials: 'include',
        body
    });

    if (!r.ok) {
        throw Error('core.js -> body: ' + r.status);
    }
    const content = await r.text();
    const parts = content.split(/\d+&/);
    const results = parts[2];
    const j = JSON.parse(results);
    const entries = j[1][0][2][5].map(a => {
        const entry = {};
        entry.subject = a[3];
        entry.thread = a[11];
        entry.labels = a[8] || [];
        entry.date = a[7];
        entry.from = a[5];
        entry.text = a[4];

        try {
            if (a[10][2] === 1) {
                entry.labels.push('STARRED');
            }
        } catch (e) {
            console.log(3)
        }
        return entry;
    });

    labelCache.set(account, entries)
    return entries;
};

gmail.action = async ({links, cmd, prefs}) => {
    links = typeof links === 'string' ? [links] : links;

    const a = links.map(link => ({
        account: gmail.get.account(link),
        thread: gmail.get.thread(link)
    }));

    if (a.length) {
        const at = await gmail.at(links[0]);
        if (!at) {
            throw Error('core.js -> at -> empty');
        }

        const {ik} = await gmail.page(a[0].account);
        if (!ik) {
            throw Error('core.js -> ik -> empty');
        }

        const action = {
            command: 'l:all',
            ids: []
        };

        if (cmd === 'rd' || cmd === 'rd-all') { // mark as read
            action.code = 3;
        } else if (cmd === 'rc_^i' || cmd === 'rc_Inbox') { // archive
            action.code = 1;
            if (prefs.doReadOnArchive === true || prefs.doReadOnArchive === 'true') {
                await gmail.action({
                    links,
                    cmd: 'rd',
                    prefs
                });
            }
        } else if (cmd === 'sp') { // report spam
            action.code = 7;
        } else if (cmd === 'tr') { // trash
            action.code = 9;
        } else if (cmd === 'st') { // star
            action.code = 5;
        } else if (cmd === 'xst') { // remove star
            action.code = 6;
        }
        if (!action.code) {
            throw Error('core.js -> action_not_supported: ' + cmd);
        }

        const body = new FormData();
        body.append('s_jr', JSON.stringify([null, [
            ...a.map(o => [null, null, null, [
                null, action.code, o.thread, (o.id || o.thread), action.command, [], [], o.ids
            ]]),
            [null, null, null, null, null, null, [null, true, false]],
            [null, null, null, null, null, null, [null, true, false]]
        ], 2, null, null, null, ik]));

        const href = `https://mail.google.com/mail/u/${a[0].account}/s/?v=or&ik=${ik}&at=${at}&subui=chrome&hl=en&ts=` + Date.now();

        return fetch(href, {
            method: 'POST',
            credentials: 'include',
            body
        });
    }
    throw Error('core.js -> no_links');
};

gmail.render = content => {
    const td = getLastMessage(content);
    if (td) {
        const table = document.createElement('table');
        table.classList.add('root');
        const tr = document.createElement('tr');
        table.appendChild(tr);
        tr.appendChild(td);

        return table;
    }
    return '';
}

const getLastMessage = content => {
    const doc = new DOMParser().parseFromString(content, 'text/html');

    const m = doc.querySelectorAll('.message > tbody > tr > td:last-child');
    if (m.length) {
        const td = m[m.length - 1];
        for (const a of td.querySelectorAll('a')) {
            if (a.href) {
                // prevent Google redirection
                if (a.href.startsWith('https://www.google.com/url?q=')) {
                    try {
                        const args = (new URL(a.href)).searchParams;
                        a.href = args.get('q') || a.href;
                    } catch (e) {
                    }
                }
            }
        }
        return td;
    }
    return '';
};

