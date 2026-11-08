/* Product Insider Access. The code is checked on the Calm Joints server. */
(function () {
  var gate = document.getElementById('insider-gate');
  var gateStatus = document.getElementById('insider-gate-status');
  if (!gate) return;
  var accepted = '';
  var overlay = null;
  var returnFocus = null;

  function say(node, text) {
    if (node) node.textContent = text || '';
  }

  function post(body) {
    return fetch('/api/squash-insider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data || {} }; });
    });
  }

  function line(tag, text, className) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])'), function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function closeModal() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    overlay = null;
    document.body.classList.remove('insider-open');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function onKey(event) {
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    var items = focusables(overlay);
    if (!items.length) return;
    var first = items[0];
    var lastItem = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      first.focus();
    }
  }

  function showModal(data) {
    closeModal();
    returnFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'insider-overlay';
    var dialog = document.createElement('div');
    dialog.className = 'insider-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'insider-modal-title');
    dialog.tabIndex = -1;

    var head = document.createElement('div');
    head.className = 'insider-dialog-head';
    head.appendChild(line('h2', 'Recovery products', ''));
    head.querySelector('h2').id = 'insider-modal-title';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'insider-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = 'Close';
    close.addEventListener('click', closeModal);
    head.appendChild(close);
    dialog.appendChild(head);

    (data.offer || []).forEach(function (text) {
      dialog.appendChild(line('p', text, 'insider-offer'));
    });

    var form = document.createElement('form');
    form.className = 'insider-pick';
    form.noValidate = true;
    var groups = {};
    var order = [];
    (data.products || []).forEach(function (item) {
      var use = item.use || 'Recovery';
      if (!groups[use]) {
        groups[use] = [];
        order.push(use);
      }
      groups[use].push(item);
    });
    order.forEach(function (use) {
      var group = document.createElement('fieldset');
      group.className = 'insider-group';
      var legend = document.createElement('legend');
      legend.textContent = use;
      group.appendChild(legend);
      groups[use].forEach(function (item) {
        var label = document.createElement('label');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.name = 'product';
        box.value = item.id;
        label.appendChild(box);
        var text = document.createElement('span');
        text.appendChild(line('strong', item.name));
        text.appendChild(line('small', item.detail));
        text.appendChild(line('small', item.price_kind + ' ' + item.price_label + '. ' + item.source));
        label.appendChild(text);
        group.appendChild(label);
      });
      form.appendChild(group);
    });

    var emailLabel = line('label', 'Email for a reply');
    emailLabel.htmlFor = 'insider-email';
    var email = document.createElement('input');
    email.id = 'insider-email';
    email.name = 'email';
    email.type = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.maxLength = 120;
    var button = document.createElement('button');
    button.className = 'btn btn-book';
    button.type = 'submit';
    button.textContent = 'Send my wishlist';
    var status = line('p', '', 'insider-status');
    status.setAttribute('role', 'status');
    form.appendChild(emailLabel);
    form.appendChild(email);
    form.appendChild(button);
    form.appendChild(status);
    if (data.store && /^https:\/\//.test(data.store.href || '')) {
      var storeNote = line('p', data.store.note || '', 'insider-store-note');
      var storeLink = document.createElement('a');
      storeLink.href = data.store.href;
      storeLink.target = '_blank';
      storeLink.rel = 'noopener noreferrer';
      storeLink.textContent = 'Industry Insider’s Store';
      storeNote.appendChild(document.createTextNode(' '));
      storeNote.appendChild(storeLink);
      form.appendChild(storeNote);
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var ids = Array.prototype.map.call(form.querySelectorAll('input[name="product"]:checked'), function (box) {
        return box.value;
      });
      if (!ids.length) {
        say(status, 'Choose at least one product.');
        return;
      }
      if (!email.value.trim()) {
        say(status, 'Enter an email address.');
        return;
      }
      button.disabled = true;
      say(status, 'Sending your interest.');
      post({
        intent: 'interest',
        code: accepted,
        email: email.value.trim(),
        product_ids: ids,
        company: '',
      }).then(function (res) {
        button.disabled = false;
        if (res.data && res.data.delivery === 'sent') {
          say(status, 'Sent. Check your email for the wishlist. This was not an order.');
          button.disabled = true;
          return;
        }
        if (res.data && res.data.delivery === 'unconfigured') {
          say(status, 'This site cannot deliver that wishlist yet. Nothing was sent.');
          return;
        }
        say(status, 'The wishlist did not go through. Nothing was sent.');
      }).catch(function () {
        button.disabled = false;
        say(status, 'The wishlist did not go through. Nothing was sent.');
      });
    });
    dialog.appendChild(form);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
    document.body.classList.add('insider-open');
    document.addEventListener('keydown', onKey);
    dialog.focus();
  }

  var shareBtn = document.getElementById('insider-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = 'https://calmjoints.org/squash';
      var status = document.getElementById('insider-share-status');
      function done(msg) { if (status) status.textContent = msg; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          done('Link copied. It does not include a code.');
        }).catch(function () { done(url); });
        return;
      }
      done(url);
    });
  }

  gate.addEventListener('submit', function (event) {
    event.preventDefault();
    var code = (gate.elements.code && gate.elements.code.value) || '';
    var company = (gate.elements.company && gate.elements.company.value) || '';
    say(gateStatus, '');
    post({ intent: 'open', code: code, company: company }).then(function (res) {
      if (!res.data || !res.data.ok) {
        say(gateStatus, res.status === 429 ? 'Please wait a moment and try that code again.' : 'That code was not recognized.');
        return;
      }
      accepted = code;
      if (gate.elements.code) gate.elements.code.value = '';
      showModal(res.data);
    }).catch(function () {
      say(gateStatus, 'The code could not be checked just now.');
    });
  });
})();
