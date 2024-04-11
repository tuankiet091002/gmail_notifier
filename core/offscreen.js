const offscreen = {
    busy: false,
    cache: []
};

offscreen.command = async request => {

    // if conflicted, push request to cache
    if (offscreen.busy) {
        return new Promise(resolve => {
            offscreen.cache.push({request, resolve});
        });
    }

    // check for active offscreen worker
    offscreen.busy = true;
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
        log('[offscreen]', 'creating...');
        await chrome.offscreen.createDocument({
            url: '/page/offscreen/index.html',
            reasons: ['AUDIO_PLAYBACK', 'DOM_SCRAPING'],
            justification: 'parse a command or play alert'
        });
    }
    offscreen.busy = false;

    // empty cache
    for (const {request, resolve} of offscreen.cache) {
        chrome.runtime.sendMessage({
            method: 'offscreen',
            request
        }, resolve);
    }
    offscreen.cache.length = 0;

    // current request
    return new Promise(resolve => chrome.runtime.sendMessage({
        method: 'offscreen',
        request
    }, resolve));
};

// exit offscreen handler
chrome.runtime.onMessage.addListener(request => {
    if (request.method === 'exit-offscreen') {
        chrome.offscreen.closeDocument().then(() => {
            log('[offscreen]', 'exited');
        });
    }
});
