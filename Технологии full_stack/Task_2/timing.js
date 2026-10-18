(function () {
  'use strict';

  /** Получить объект Navigation Timing (современный API). */
  function getNav() {
    try {
      if (performance.getEntriesByType) {
        var entries = performance.getEntriesByType('navigation');
        if (entries && entries.length) return entries[0];
      }
    } catch (e) { /* старые браузеры */ }
    return null;
  }

  function round(ms) {
    if (ms == null || isNaN(ms)) return null;
    return Math.round(ms * 100) / 100;
  }

  function fmt(ms) {
    var r = round(ms);
    if (r == null) return '—';
    return r.toLocaleString('ru-RU') + ' мс';
  }

  function addRow(label, value, note) {
    var out = document.getElementById('timing-output');
    if (!out) return;

    var li = document.createElement('li');
    li.className = 'timing__item';

    var labelEl = document.createElement('span');
    labelEl.className = 'timing__label';
    labelEl.textContent = label + ': ';
    li.appendChild(labelEl);

    var valueEl = document.createElement('span');
    valueEl.className = 'timing__value';
    valueEl.textContent = fmt(value);
    li.appendChild(valueEl);

    if (note) {
      var noteEl = document.createElement('span');
      noteEl.className = 'timing__note';
      noteEl.textContent = ' ' + note;
      li.appendChild(noteEl);
    }

    out.appendChild(li);
  }

  /**
   * Считываем метрики. Вызывается ПОСЛЕ завершения события load,
   * поэтому domContentLoadedEventEnd и loadEventEnd уже заполнены.
   * Возвращает { dcl, load, response, domProcessing, resources, source }.
   */
  function readTimings() {
    var nav = getNav();
    var t = performance.timing;

    // 1) Современный API — поля уже относительны navigationStart.
    if (nav && (nav.domContentLoadedEventEnd > 0 || nav.loadEventEnd > 0)) {
      return {
        dcl:           nav.domContentLoadedEventEnd,
        load:          nav.loadEventEnd,
        response:      nav.responseEnd,
        domProcessing: nav.domContentLoadedEventEnd - nav.responseEnd,
        resources:     nav.loadEventEnd - nav.domContentLoadedEventEnd,
        source:        'NavigationTiming'
      };
    }

    // 2) Legacy API — времена абсолютные, вычитаем navigationStart.
    if (t && t.navigationStart > 0 && t.loadEventEnd > 0) {
      return {
        dcl:           t.domContentLoadedEventEnd - t.navigationStart,
        load:          t.loadEventEnd - t.navigationStart,
        response:      t.responseEnd - t.navigationStart,
        domProcessing: t.domContentLoadedEventEnd - t.responseEnd,
        resources:     t.loadEventEnd - t.domContentLoadedEventEnd,
        source:        'performance.timing'
      };
    }

    // 3) Крайний случай (BFCache, очень старый браузер) — от старта скрипта.
    var now = performance.now();
    return {
      dcl: now,
      load: now,
      response: null,
      domProcessing: null,
      resources: null,
      source: 'performance.now()'
    };
  }

  /* ---------- Единственный обработчик: window.load ----------
     К моменту его срабатывания событие DOMContentLoaded уже
     давно завершено, а load завершается прямо сейчас.
     Откладываем чтение на один тик (setTimeout 0), чтобы
     браузер успел записать loadEventEnd. */
  window.addEventListener('load', function () {
    setTimeout(function () {
      var m = readTimings();

      addRow('DOMContentLoaded', m.dcl, '(' + m.source + ')');
      if (m.response != null) {
        addRow('Ответ сервера', m.response, '(responseEnd)');
      }
      if (m.domProcessing != null) {
        addRow('Обработка DOM', m.domProcessing, '(responseEnd → DCL)');
      }

      addRow('Load (полная загрузка)', m.load, '(' + m.source + ')');
      if (m.resources != null) {
        addRow('Загрузка ресурсов', m.resources, '(DCL → load)');
      }

      var summary = document.getElementById('timing-summary');
      if (summary) {
        summary.textContent =
          'Итого: DOMContentLoaded — ' + fmt(m.dcl) +
          ', Load — ' + fmt(m.load);
      }

      if (window.console && console.table) {
        console.table({
          'DOMContentLoaded, мс':   round(m.dcl),
          'Load, мс':               round(m.load),
          'Разница load − DCL, мс': round(m.load - m.dcl),
          'Источник':               m.source
        });
      }
      // Если страница открыта во встроенном окне (замер из pages-benchmark.html),
      // отправляем результат родителю. В обычной вкладке этот блок ничего не делает.
      if (window.parent !== window) {
        var paintEntry = performance.getEntriesByName && performance.getEntriesByName('first-paint')[0];
        parent.postMessage({
          type: 'page-timing',
          result: {
            dcl: round(m.dcl),
            load: round(m.load),
            paint: paintEntry ? round(paintEntry.startTime) : null,
            source: m.source
          }
        }, '*');
      }
    }, 0);
  });
})();