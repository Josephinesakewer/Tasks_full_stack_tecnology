// measure.js — общий измеритель для всех вариантов (подключается последним).
// Собирает DOMContentLoaded, load, момент применения стилей (для less.js —
// окончание компиляции в браузере) и момент реальной отрисовки.
// Результат: window.__perf (для Playwright) и postMessage родителю (для bench.html).
(function () {
  'use strict';
  var r2 = function (x) { return x == null ? null : Math.round(x * 100) / 100; };
  var usesLess = !!(window.less && window.less.pageLoadFinished);

  var lessDone = null, lessErr = null;
  var stylesReady = usesLess
    ? window.less.pageLoadFinished.then(function () { lessDone = performance.now(); },
                                        function (e) { lessErr = String(e); lessDone = performance.now(); })
    : Promise.resolve();

  var loaded = new Promise(function (res) {
    if (document.readyState === 'complete') res();
    else window.addEventListener('load', function () { setTimeout(res, 0); }); // дождаться loadEventEnd
  });

  Promise.all([loaded, stylesReady]).then(function () {
    // «стилизованная отрисовка»: два rAF после load И после применения стилей
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var painted = performance.now();
      var nav = performance.getEntriesByType('navigation')[0];
      var res = performance.getEntriesByType('resource');
      var lessRes = res.filter(function (e) { return /\.less(\?|$)/.test(e.name); });
      var cssRes  = res.filter(function (e) { return /\.css(\?|$)/.test(e.name); });
      var lessStart = lessRes.length ? Math.min.apply(null, lessRes.map(function (e) { return e.startTime; })) : null;
      var jsRes = res.filter(function (e) { return /less\.min\.js/.test(e.name); })[0];

      var out = {
        dcl:      r2(nav.domContentLoadedEventEnd),
        load:     r2(nav.loadEventEnd),
        // момент, когда к странице применены ВСЕ стили (css — до load, less — конец компиляции)
        stylesReady: r2(usesLess ? lessDone : nav.loadEventEnd),
        // итог: стилизованная страница реально отрисована
        painted:  r2(painted),
        lessCompile: usesLess && lessStart != null ? r2(lessDone - lessStart) : null, // XHR *.less + компиляция
        lessFiles: lessRes.length,
        lessBytes: lessRes.reduce(function (s, e) { return s + (e.transferSize || e.encodedBodySize || 0); }, 0),
        lessLibMs: jsRes ? r2(jsRes.responseEnd - jsRes.startTime) : null,
        cssBytes: cssRes.reduce(function (s, e) { return s + (e.encodedBodySize || 0); }, 0),
        domNodes: document.getElementsByTagName('*').length,
        error: lessErr
      };
      window.__perf = out;
      if (window.parent !== window) parent.postMessage({ type: 'page-timing', result: out }, '*');
    }); });
  });
})();
