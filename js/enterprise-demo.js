/* Sample booking only. Choices stay in the page. Nothing is sent and nobody is booked. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.boot(root.document); });
    else api.boot(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var AREAS = ['Knee', 'Back', 'Hip', 'Shoulder'];
  var DAYS = [
    { id: 'mon', label: 'Mon', sub: '5' },
    { id: 'tue', label: 'Tue', sub: '6' },
    { id: 'wed', label: 'Wed', sub: '7' },
    { id: 'thu', label: 'Thu', sub: '8' }
  ];
  var TIMES = ['9:00 AM', '10:20 AM', '11:00 AM', '1:00 PM'];

  function boot(doc) {
    var root = doc.getElementById('cj-demo');
    if (!root || root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    var panel = root.querySelector('[data-panel]');
    var status = root.querySelector('[data-status]');
    var after = doc.getElementById('demo-after');
    var pips = root.querySelectorAll('[data-step-pip]');
    var state = { step: 1, area: '', day: '', time: '', done: false, focus: '' };

    function el(tag, attrs, text) {
      var node = doc.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (key) {
        if (key === 'class') node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
      if (text != null) node.textContent = text;
      return node;
    }

    function choices(name, items, current, onPick, className) {
      var group = el('div', { class: className || 'choices', role: 'group', 'aria-label': name });
      items.forEach(function (item) {
        var id = typeof item === 'string' ? item : item.id;
        var label = typeof item === 'string' ? item : item.label;
        var sub = item && typeof item === 'object' ? item.sub : '';
        var button = el('button', {
          type: 'button',
          'data-choice': id,
          'aria-pressed': current === id ? 'true' : 'false',
          'aria-label': sub ? label + ' ' + sub + ', sample' : label
        });
        if (sub) {
          button.appendChild(el('small', null, label));
          button.appendChild(el('b', null, sub));
        } else {
          button.textContent = label;
        }
        button.addEventListener('click', function () { onPick(id); });
        button.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onPick(id);
        });
        group.appendChild(button);
      });
      return group;
    }

    function actions(nodes) {
      var row = el('div', { class: 'demo-actions' });
      nodes.forEach(function (node) { row.appendChild(node); });
      return row;
    }

    function draw() {
      pips.forEach(function (pip) {
        var on = Number(pip.getAttribute('data-step-pip')) === state.step && !state.done;
        pip.classList.toggle('on', on);
        if (on) pip.setAttribute('aria-current', 'step');
        else pip.removeAttribute('aria-current');
      });
      panel.textContent = '';
      if (state.done) {
        panel.appendChild(el('h3', { id: 'demo-title', tabindex: '-1' }, 'Sample complete.'));
        panel.appendChild(el('p', { class: 'demo-note' }, 'Nothing was booked. This is a sample of the digital visit, not a live opening.'));
        panel.appendChild(el('p', null, 'Digital care happens in the video visit.'));
        var again = el('button', { type: 'button', class: 'demo-next' }, 'Start the sample again');
        again.addEventListener('click', function () {
          state.step = 1;
          state.area = '';
          state.day = '';
          state.time = '';
          state.done = false;
          state.focus = 'panel';
          if (after) after.hidden = true;
          draw();
        });
        panel.appendChild(actions([again]));
        status.textContent = 'Sample complete. Nothing was booked.';
        if (after) after.hidden = false;
      } else if (state.step === 1) {
        panel.appendChild(el('h3', { id: 'demo-title', tabindex: '-1' }, 'Choose a digital visit'));
        panel.appendChild(el('p', { class: 'demo-note' }, 'Sample screen. Not a live opening.'));
        panel.appendChild(choices('What is sore?', AREAS, state.area, function (id) {
          state.area = id;
          state.focus = id;
          status.textContent = id + ' selected. Sample only.';
          draw();
        }));
        var next = el('button', { type: 'button', class: 'demo-next' }, 'Continue');
        next.disabled = !state.area;
        next.addEventListener('click', function () {
          if (!state.area) return;
          state.step = 2;
          state.focus = 'panel';
          draw();
        });
        panel.appendChild(actions([next]));
      } else if (state.step === 2) {
        panel.appendChild(el('h3', { id: 'demo-title', tabindex: '-1' }, 'Pick a sample time'));
        panel.appendChild(el('p', { class: 'demo-note' }, 'Sample times. Not live openings.'));
        panel.appendChild(choices('Sample day', DAYS, state.day, function (id) {
          state.day = id;
          state.focus = id;
          status.textContent = 'Sample day selected. Not a live opening.';
          draw();
        }, 'day-grid'));
        panel.appendChild(choices('Sample time', TIMES, state.time, function (id) {
          state.time = id;
          state.focus = id;
          status.textContent = 'Sample time ' + id + ' selected. Not a live opening.';
          draw();
        }, 'time-grid'));
        var back = el('button', { type: 'button', class: 'demo-back' }, 'Back');
        back.addEventListener('click', function () { state.step = 1; state.focus = 'panel'; draw(); });
        var review = el('button', { type: 'button', class: 'demo-next' }, 'Review');
        review.disabled = !(state.day && state.time);
        review.addEventListener('click', function () {
          if (!(state.day && state.time)) return;
          state.step = 3;
          state.focus = 'panel';
          draw();
        });
        panel.appendChild(actions([back, review]));
      } else {
        var day = DAYS.filter(function (item) { return item.id === state.day; })[0];
        panel.appendChild(el('h3', { id: 'demo-title', tabindex: '-1' }, 'Review this sample'));
        panel.appendChild(el('p', { class: 'demo-note' }, 'Sample only. Confirming here does not book a visit or assign Gabriela R.'));
        var list = el('dl', { class: 'demo-review' });
        function line(term, value) {
          list.appendChild(el('dt', null, term));
          list.appendChild(el('dd', null, value));
        }
        line('Visit', 'Digital video visit');
        line('Focus', state.area);
        line('When', day.label + ' ' + day.sub + ', ' + state.time);
        line('With', 'Gabriela R., Registered Physiotherapist');
        panel.appendChild(list);
        var backReview = el('button', { type: 'button', class: 'demo-back' }, 'Back');
        backReview.addEventListener('click', function () { state.step = 2; state.focus = 'panel'; draw(); });
        var confirm = el('button', { type: 'button', class: 'demo-next' }, 'Confirm sample');
        confirm.addEventListener('click', function () {
          state.done = true;
          state.focus = 'panel';
          draw();
        });
        panel.appendChild(actions([backReview, confirm]));
        status.textContent = 'Reviewing a sample ' + state.area + ' video visit. Nothing is booked yet.';
      }
      panel.setAttribute('aria-labelledby', 'demo-title');
      if (state.focus === 'panel') {
        var nextFocus = panel.querySelector('.demo-next:not(:disabled)') || panel.querySelector('button');
        if (nextFocus) nextFocus.focus();
      } else if (state.focus) {
        var chosen = panel.querySelector('[data-choice="' + state.focus + '"]');
        if (chosen) chosen.focus();
      }
    }

    draw();
  }

  return { AREAS: AREAS, DAYS: DAYS, TIMES: TIMES, boot: boot };
});
