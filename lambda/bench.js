// bench.js — замер в браузере: тот же js/measure.js, что и у Playwright, результат приходит postMessage.
(function () {
  'use strict';
  var VARIANTS = [
    ['v1-desktop-css',   '1. Десктоп, готовый CSS'],
    ['v2-adaptive-css',  '2. Адаптив, готовый CSS'],
    ['v3-desktop-less',  '3. Десктоп + less.js'],
    ['v4-adaptive-less', '4. Адаптив + less.js']
  ];
  var KEYS = ['dcl', 'fcp', 'load', 'stylesReady', 'painted', 'lessCompile'];
  var $ = function (s) { return document.querySelector(s); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var median = function (a) { a = a.filter(function (x) { return x != null; }).sort(function (x, y) { return x - y; });
    if (!a.length) return null; var n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
  var fmt = function (v) { return v == null ? '—' : v.toFixed(1); };
  var raw = [];

  function runOnce(name, width) {
    return new Promise(function (resolve) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:absolute;left:-99999px;top:0;height:900px;border:0;width:' + width + 'px';
      f.src = name + '/index.html?__bust=' + Date.now() + Math.random().toString(36).slice(2);
      var t = setTimeout(function () { cleanup(); resolve(null); }, 30000);
      function onMsg(e) {
        if (e.source !== f.contentWindow || !e.data || e.data.type !== 'page-timing') return;
        clearTimeout(t); cleanup(); resolve(e.data.result);
      }
      function cleanup() { window.removeEventListener('message', onMsg); f.remove(); }
      window.addEventListener('message', onMsg);
      $('#frames').appendChild(f);
    });
  }

  // Проверка ДО запуска: открыта ли страница по http и видны ли index.html всех вариантов.
  // Пути вариантов считаются относительно bench.html, поэтому bench.html должен лежать рядом с папками v1..v4 (в dist/).
  async function preflight() {
    var problems = [];
    if (location.protocol === 'file:') {
      problems.push('Страница открыта как file:// — less.js не сможет загрузить .less (XHR), а iframe не отдадут результат. Запустите: python -m http.server 8000 --directory dist');
      return problems;
    }
    for (var i = 0; i < VARIANTS.length; i++) {
      var url = new URL(VARIANTS[i][0] + '/index.html', location.href).href;
      try {
        var r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) problems.push('HTTP ' + r.status + ': ' + url);
      } catch (e) { problems.push('Не загрузилось (' + e.message + '): ' + url); }
    }
    if (problems.length) problems.push('Подсказка: bench.html нужно открывать из папки dist/ (там рядом лежат v1-desktop-css … v4-adaptive-less): http://localhost:8000/bench.html');
    return problems;
  }

  $('#run').addEventListener('click', async function () {
    var bad = await preflight();
    if (bad.length) { $('#status').textContent = 'Ошибка путей'; $('#conclusion').textContent = bad.join('\n'); return; }
    $('#conclusion').textContent = '';
    var runs = +$('#runs').value || 20, width = +$('#width').value || 1440;
    $('#run').disabled = $('#csv').disabled = true; $('#t tbody').innerHTML = ''; raw = [];
    var lost = 0, res = {}; VARIANTS.forEach(function (v) { res[v[0]] = []; });
    for (var i = -2; i < runs; i++) {                       // 2 прогрева, затем замеры по кругу
      for (var k = 0; k < VARIANTS.length; k++) {
        $('#status').textContent = 'Прогон ' + (i + 3) + '/' + (runs + 2) + ': ' + VARIANTS[k][1];
        var r = await runOnce(VARIANTS[k][0], width);
        if (!r && i >= 0) lost++;
        if (r && i >= 0) { res[VARIANTS[k][0]].push(r); raw.push(Object.assign({ variant: VARIANTS[k][0], run: i + 1, width: width }, r)); }
        await sleep(50);
      }
    }
    VARIANTS.forEach(function (v) {
      var rows = res[v[0]], tr = document.createElement('tr');
      tr.innerHTML = '<td>' + v[1] + '</td><td>' + rows.length + '</td>' + KEYS.map(function (k) {
        return '<td>' + fmt(median(rows.map(function (r) { return r[k]; }))) + '</td>'; }).join('');
      $('#t tbody').appendChild(tr);
    });
    $('#status').textContent = 'Готово';
    if (lost) $('#conclusion').textContent = 'Прогонов без ответа (таймаут 30 с): ' + lost + ' — проверьте, что вкладка была активна и measure.js подключён.';
    $('#run').disabled = $('#csv').disabled = false;
  });

  $('#csv').addEventListener('click', function () {
    var cols = Object.keys(raw[0]);
    var txt = [cols.join(',')].concat(raw.map(function (r) { return cols.map(function (c) { return r[c]; }).join(','); })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = 'bench-raw.csv'; a.click();
  });
})();
