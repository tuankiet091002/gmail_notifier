'use strict';

var config = {};

config.map = {
    number: [
        'period', 'resetPeriod', 'notificationTime', 'notificationTruncate', 'openMode', 'notification.sound.media.default.type', 'soundVolume', 'silentTime', 'oldFashion', 'size', 'fullWidth', 'fullHeight', 'clrPattern'
    ],
    checkbox: ['notification', 'alert', 'searchMode', 'ignoreOpens', 'doReadOnArchive', 'inboxRedirection', 'alphabetic', 'onGmailNotification', 'minimal', 'badge', 'express', 'smartOpen', 'notification.buttons.markasread', 'notification.buttons.archive', 'notification.buttons.trash', 'decorateOnExpand', 'manualAsData']
};

config.prefs = {
    'period': 120, // seconds
    'resetPeriod': 0, // minutes
    'notification': true,
    'notificationTime': 30, // seconds
    'notificationTruncate': 70,
    'alert': true,
    'notification.sound.media.default.type': 0,
    'soundVolume': 80,
    'silentTime': 10, // minutes
    'searchMode': true,
    'openMode': 0,
    'ignoreOpens': false,
    'oldFashion': 0,
    'size': 0,
    'fullWidth': 750,
    'fullHeight': 600,
    'doReadOnArchive': true,
    'inboxRedirection': true,
    'clrPattern': 0,
    'onGmailNotification': true,
    'minimal': true,
    'badge': true,
    'backgroundColor': '#6e6e6e',
    'express': false,
    'notification.buttons.markasread': true,
    'notification.buttons.archive': true,
    'notification.buttons.trash': false,
    'smartOpen': true,
    'decorateOnExpand': true,
    'manualAsData': true,
};
