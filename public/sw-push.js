/* Daily reminder notifications. Pulled into the site's service worker (sw.js) by importScripts, so it runs in the
   worker, never in a page. When the server sends the reminder it shows a notification naming today's saint (read
   from the copy of the day's data already on the device, so it also works offline); tapping it opens the site.
   The message from the server is only words and a same-site link: {title, body, url, tag}. */
(function () {
  'use strict';

  function safeUrl(raw) {
    try {
      var u = new URL(raw || '/', self.location.origin);
      return u.origin === self.location.origin ? u.href : self.location.origin + '/';
    } catch (e) {
      return self.location.origin + '/';
    }
  }

  // Today's key on the device's own calendar, like the home page: MM-DD.
  function todayKey() {
    var n = new Date();
    return ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  }

  function todaysSaint() {
    var url = '/data/day/' + todayKey() + '.json';
    return caches.match(url).then(function (hit) { return hit || fetch(url); })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d.title === 'string' ? d.title : null; })
      .catch(function () { return null; });
  }

  self.addEventListener('push', function (event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
    var title = typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : 'An Anglican Synaxarium';
    var body = typeof data.body === 'string' ? data.body.slice(0, 240) : '';
    var tag = typeof data.tag === 'string' ? data.tag.slice(0, 60) : undefined;
    var url = safeUrl(data.url);
    var isDaily = tag === 'synaxarium:daily';
    event.waitUntil((isDaily ? todaysSaint() : Promise.resolve(null)).then(function (saint) {
      return self.registration.showNotification(title, {
        body: saint ? 'Today: ' + saint : body,
        tag: tag,
        icon: '/icons/icon-192.png',
        data: { url: url }
      });
    }));
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var url = safeUrl(event.notification.data && event.notification.data.url);
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
            return c.focus().then(function (focused) {
              if (focused && 'navigate' in focused) { return focused.navigate(url); }
              return undefined;
            });
          }
        }
        return clients.openWindow(url);
      })
    );
  });
})();
