/* Product Insider Access. The code is checked on the Calm Joints server. */
(function () {
  var gate = document.getElementById('insider-gate');
  var gateStatus = document.getElementById('insider-gate-status');
  if (!gate) return;
  var accepted = '';
  var overlay = null;
  var returnFocus = null;
  var closeDetail = null;

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
    closeDetail = null;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('insider-open');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function onKey(event) {
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (closeDetail) closeDetail();
      else closeModal();
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
    var filters = [
      { id: 'highlights', label: 'Highlights' },
      { id: 'Massage', label: 'Massage' },
      { id: 'Topical', label: 'Topicals' },
      { id: 'Feet', label: 'Foot support' },
      { id: 'Compression', label: 'Compression' },
    ];
    var filterBar = document.createElement('div');
    filterBar.className = 'insider-filters';
    filterBar.setAttribute('role', 'tablist');
    filterBar.setAttribute('aria-label', 'Product groups');
    var tally = line('p', '', 'insider-tally');
    tally.setAttribute('aria-live', 'polite');
    var list = document.createElement('div');
    list.className = 'insider-catalog';
    var cards = [];
    function applyFilter(id) {
      cards.forEach(function (card) {
        var show = id === 'highlights' ? card.dataset.highlight === 'yes' : card.dataset.use === id;
        card.hidden = !show;
      });
      Array.prototype.forEach.call(filterBar.querySelectorAll('button'), function (btn) {
        var on = btn.dataset.filter === id;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      });
    }
    function recount() {
      var n = form.querySelectorAll('input[name="product"]:checked').length;
      tally.textContent = n ? (n === 1 ? '1 selected' : n + ' selected') : 'None selected';
    }
    filters.forEach(function (filter, index) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.filter = filter.id;
      tab.setAttribute('role', 'tab');
      tab.textContent = filter.label;
      tab.addEventListener('click', function () { applyFilter(filter.id); });
      if (index === 0) tab.setAttribute('aria-selected', 'true');
      filterBar.appendChild(tab);
    });
    var detail = document.createElement('div');
    detail.className = 'insider-detail';
    detail.hidden = true;
    var opener = null;
    var listScroll = 0;
    function hideDetail() {
      detail.hidden = true;
      detail.replaceChildren();
      form.hidden = false;
      dialog.setAttribute('aria-labelledby', 'insider-modal-title');
      dialog.scrollTop = listScroll;
      closeDetail = null;
      if (opener) opener.focus();
    }
    function openDetail(item, button) {
      opener = button;
      listScroll = dialog.scrollTop;
      detail.replaceChildren();
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'insider-back';
      back.textContent = 'Back to the list';
      back.addEventListener('click', hideDetail);
      var photo = document.createElement('img');
      photo.src = item.image;
      photo.alt = item.alt || item.name;
      photo.width = 800;
      photo.height = 800;
      var title = document.createElement('h3');
      title.id = 'insider-detail-title';
      title.textContent = item.name;
      var facts = document.createElement('ul');
      (item.about || []).forEach(function (fact) {
        facts.appendChild(line('li', fact));
      });
      var note = line('p', item.detail || '');
      var price = line('p', item.price_kind + ' ' + item.price_label + '. ' + item.source + '.', 'insider-price');
      var soon = line('p', 'Insider pricing coming soon.', 'insider-soon');
      detail.appendChild(back);
      detail.appendChild(photo);
      detail.appendChild(title);
      detail.appendChild(facts);
      detail.appendChild(note);
      detail.appendChild(price);
      detail.appendChild(soon);
      if (/^https:\/\//.test(item.href || '')) {
        var maker = document.createElement('a');
        maker.href = item.href;
        maker.target = '_blank';
        maker.rel = 'noopener noreferrer';
        maker.textContent = 'Maker page';
        detail.appendChild(maker);
      }
      form.hidden = true;
      detail.hidden = false;
      dialog.setAttribute('aria-labelledby', 'insider-detail-title');
      dialog.scrollTop = 0;
      closeDetail = hideDetail;
      back.focus();
    }
    (data.products || []).forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'insider-card';
      card.dataset.use = item.use || '';
      card.dataset.highlight = item.highlight ? 'yes' : 'no';
      var label = document.createElement('label');
      label.className = 'insider-check';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.name = 'product';
      box.value = item.id;
      box.setAttribute('aria-label', 'Add ' + item.name + ' to the wishlist');
      box.addEventListener('change', recount);
      label.appendChild(box);
      var info = document.createElement('button');
      info.type = 'button';
      info.className = 'insider-details';
      info.setAttribute('aria-label', 'Details for ' + item.name);
      var thumb = document.createElement('img');
      thumb.src = item.image;
      thumb.alt = '';
      thumb.width = 72;
      thumb.height = 72;
      var text = document.createElement('span');
      if (item.brand) text.appendChild(line('small', item.brand, 'insider-brand'));
      text.appendChild(line('strong', item.name));
      text.appendChild(line('small', item.price_kind + ' ' + item.price_label));
      text.appendChild(line('small', 'Insider pricing coming soon', 'insider-soon'));
      info.appendChild(thumb);
      info.appendChild(text);
      info.addEventListener('click', function () { openDetail(item, info); });
      card.appendChild(label);
      card.appendChild(info);
      list.appendChild(card);
      cards.push(card);
    });
    form.appendChild(filterBar);
    form.appendChild(tally);
    form.appendChild(list);
    applyFilter('highlights');
    recount();

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
        if (res.data && res.data.delivery === 'sent' && res.data.persisted) {
          say(status, 'Sent. Your wishlist is saved and the email is on its way. This was not an order.');
          button.disabled = true;
          return;
        }
        if (res.data && res.data.delivery === 'sent') {
          say(status, 'Sent. Check your email for the wishlist. This was not an order.');
          button.disabled = true;
          return;
        }
        if (res.data && res.data.persisted && res.data.duplicate) {
          say(status, 'This wishlist is already saved. This was not an order.');
          button.disabled = true;
          return;
        }
        if (res.data && res.data.persisted) {
          say(status, 'Saved. The email did not go out. This was not an order.');
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
    dialog.appendChild(detail);
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
