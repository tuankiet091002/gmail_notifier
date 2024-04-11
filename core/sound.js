const sound = {};

sound.play = (entries = []) => {

    chrome.storage.session.get({
        silent: false
    }, prefs => {
        // do nothing if silent
        if (prefs.silent) {
            log('[play]', 'aborted', 'silent mode');
            return;
        }

        // default config for sound setting
        chrome.storage.local.get({
            'notification.sound.media.default.type': 0,
            'notification.sound.media.default.file': null,
            'alert': true,
            'soundVolume': 80
        }, prefs => {
            const media = {
                // 0 gmail notifier default
                // 1 checker plus bell
                // 2 checker plus ding
                // 3 window email
                // 4 custom, file is needed
                get type() {
                    return prefs['notification.sound.media.default.type'];
                },
                get file() {
                    return prefs['notification.sound.media.default.file'];
                }
            };

            // create offscreen audio for first valid email
            offscreen.command({
                cmd: 'play',
                media,
                prefs: {
                    alert: prefs.alert,
                    soundVolume: prefs.soundVolume
                }
            }).then(() => {
            });
        });
    });
};

sound.stop = () => offscreen.command({
    cmd: 'stop'
});
