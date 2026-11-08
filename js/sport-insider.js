/* Product Insider Access. The code is checked on the Calm Joints server. */
(function () {
  var gate = document.getElementById('insider-gate');
  var shop = document.getElementById('insider-shop');
  var gateStatus = document.getElementById('insider-gate-status');
  if (!gate || !shop) return;
  var accepted = '';

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

  function line(tag, text) {
    var el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  function showShop(data) {
    shop.replaceChildren();
    (data.offer || []).forEach(function (text) {
      shop.appendChild(line('p', text));
    });
    var form = document.createElement('form');
    form.className = 'insider-pick';
    form.noValidate = true;
    var list = document.createElement('ul');
    list.className = 'insider-list';
    (data.products || []).forEach(function (item) {
      var li = document.createElement('li');
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
      li.appendChild(label);
      list.appendChild(li);
    });
    form.appendChild(list);
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
    button.textContent = 'Send my interest';
    var status = line('p', '');
    status.className = 'insider-status';
    status.setAttribute('role', 'status');
    form.appendChild(emailLabel);
    form.appendChild(email);
    form.appendChild(button);
    form.appendChild(status);
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
          say(status, 'Sent. A reply will come to this email about the products you selected. This was not an order.');
          button.disabled = true;
          return;
        }
        if (res.data && res.data.delivery === 'unconfigured') {
          say(status, 'This site cannot deliver that note yet. Nothing was sent.');
          return;
        }
        say(status, 'The note did not go through. Nothing was sent.');
      }).catch(function () {
        button.disabled = false;
        say(status, 'The note did not go through. Nothing was sent.');
      });
    });
    shop.appendChild(form);
    shop.hidden = false;
    gate.hidden = true;
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
      showShop(res.data);
    }).catch(function () {
      say(gateStatus, 'The code could not be checked just now.');
    });
  });
})();
