'use strict';

const button = {
    set label(title) {
        chrome.action.setTitle({title});
    },
    set color(color) {
        chrome.action.setBadgeBackgroundColor({color});
    }
};

// button.badge
{
    Object.defineProperty(button, 'badge', {
        set(val) {
            chrome.storage.local.get({
                'minimal': true,
                'badge': true
            }, prefs => {
                if (val > 999 && prefs.minimal) {
                    const formatter = new Intl.NumberFormat('en-US', {
                        notation: 'compact',
                        compactDisplay: 'short'
                    });
                    val = '>' + formatter.format(val);
                }
                // val < 999 => val ; val > 999 => >9.1K
                chrome.action.setBadgeText({
                    text: val === 0 || prefs.badge === false ? '' : String(val)
                });
            });
        }
    });
}

// button.icon
{
    let id;
    Object.defineProperty(button, 'icon', {
        set(color) {
            clearTimeout(id);
            // 0: normal color scheme, 1: reverse color scheme
            chrome.storage.local.get({
                'colorPattern': 0
            }, prefs => {
                function set(color) {
                    // Change color pattern?
                    if (prefs.colorPattern === 1) {
                        switch (color) {
                            case 'blue':
                                color = 'gray';
                                break;
                            case 'gray':
                                color = 'blue';
                                break;
                        }
                    }
                    if (prefs.colorPattern === 2) {
                        switch (color) {
                            case 'blue':
                                color = 'gray';
                                break;
                            case 'red':
                                color = 'blue';
                                break;
                            case 'gray':
                                color = 'red';
                                break;
                        }
                    }

                    chrome.action.setIcon({
                        path: {
                            '16': '/data/icons/' + color + '/16.png',
                            '18': '/data/icons/' + color + '/18.png',
                            '19': '/data/icons/' + color + '/19.png',
                            '32': '/data/icons/' + color + '/32.png'
                        }
                    });
                }

                // download "animation" badge for 2 seconds
                if (color === 'load') {
                    const next = (i, n = 0) => {
                        clearTimeout(id);
                        if (n < 100) {
                            id = setTimeout(() => {
                                set('load' + i);
                                i += 1;
                                next(i % 4, n += 1);
                            }, 200);
                        } else {
                            set('blue');
                        }
                    };
                    next(0);

                } else if (color === 'new') {
                    const next = i => {
                        clearTimeout(id);
                        id = setTimeout(() => {
                            set(i % 2 ? 'red' : 'new');
                            if (i < 5) {
                                i += 1;
                                next(i);
                            }
                        }, 200);
                    };
                    next(0);
                } else {
                    set(color);
                }
            });
        }
    });
}

// set default background
{
    const once = () => chrome.storage.local.get({
        'backgroundColor': '#6e6e6e'
    }, prefs => button.color = prefs.backgroundColor);

    chrome.runtime.onStartup.addListener(once);
    chrome.runtime.onInstalled.addListener(once);
}

// color change handler
chrome.storage.onChanged.addListener(ps => {
    if (ps.backgroundColor) {
        button.color = ps.backgroundColor.newValue;
    }
});
