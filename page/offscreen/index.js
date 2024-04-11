/* global gmail */
const ids = new Set();

const exit = () => {
    clearTimeout(exit.id);
    console.info('exit request', ids.size);
    exit.id = setTimeout(() => {
        if (ids.size === 0) {
            chrome.runtime.sendMessage({
                method: 'exit-offscreen'
            });
        }
    }, 60000);
};

// play audio
const play = request => {
    // remove all impending audio
    stop();
    const audio = document.createElement('audio');
    audio.setAttribute('preload', 'auto');
    audio.setAttribute('autobuffer', 'true');
    audio.setAttribute('autoplay', 'true');
    audio.onerror = audio.onended = () => {
        ids.delete(request.id);
        exit();
    };
    audio.iid = request.id;
    document.body.append(audio);
    const {media, prefs} = request;

    audio.src = media.type !== 4 ? '/data/sounds/' + media.type + '.ogg' : media.default.file;
    audio.volume = prefs.soundVolume / 100;
    audio.play().then(() => {
    });
};

const stop = () => {
    for (const e of document.querySelectorAll('audio')) {
        e.pause();
        e.remove();
        ids.delete(e.iid);
    }
    exit();
};

chrome.runtime.onMessage.addListener(({request, method}, sender, response) => {
    if (method === 'offscreen') {
        clearTimeout(exit.id);
        const id = request.cmd + ';' + Math.random();
        request.id = id;
        ids.add(id);

        if (request.cmd === 'play') {
            play(request);
            response(true);
        } else if (request.cmd === 'stop') {
            stop(request);
            response(true);
            // if somehow id is not in document
            ids.delete(request.id);
            exit();
        } else if (request.cmd === 'accounts-logged-out') {
            for (let i = request.request.data; i < 6; i++) {
                localStorage.removeItem("keyId-" + i)
            }
            return true;
        }
    }
});
