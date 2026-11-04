(function () {
  const S = window.Shared, Api = window.Api;
  const $app = document.getElementById('app'), $bar = document.getElementById('bar');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { cfg: null, svc: null, days: [], date: null, time: null, error: '', done: null, step: 1, mode: 'server' };
  const saved = JSON.parse(localStorage.getItem('bk_client') || '{}');
  const money = (n) => `${n} ${st.cfg.shop.currency || ''}`.trim();

  function bar(html, onclick) {
    if (!html) { $bar.hidden = true; return; }
    $bar.hidden = false; $bar.firstElementChild.innerHTML = html;
    const b = $bar.querySelector('[data-go]'); if (b && onclick) b.onclick = onclick;
  }
  function header() {
    const sh = st.cfg.shop;
    return `<header class="top"><div class="brand"><img src="logo.png" alt="${esc(sh.name)}"><div><h1>${esc(sh.name)}</h1><p>${esc(sh.tagline || '')}</p></div></div>
      ${st.mode === 'local' ? '<span class="badge">демо-режим: данные только на этом устройстве</span>' : ''}</header>`;
  }

  function stepServices() {
    st.step = 1;
    $app.innerHTML = header() + '<h2>Выберите услугу</h2>' + st.cfg.services.map((s) => `
      <button class="card svc" data-id="${esc(s.id)}">
        <div class="row"><b>${esc(s.name)}</b><span class="price">${s.price ? esc(s.priceFrom ? 'от ' : '') + money(s.price) : ''}</span></div>
        ${s.desc ? `<div class="desc">${esc(s.desc)}</div>` : ''}
        <span class="meta">${esc(S.describeSchedule(s))}</span>
      </button>`).join('') +
      `<p class="muted small center">${esc(st.cfg.shop.address || '')}${st.cfg.shop.phone ? ' · <a style="color:inherit" href="tel:' + esc(st.cfg.shop.phone.replace(/[^+\d]/g, '')) + '">' + esc(st.cfg.shop.phone) + '</a>' : ''}</p>`;
    bar(null);
    $app.querySelectorAll('.svc').forEach((el) => el.onclick = () => pickService(el.dataset.id));
  }

  async function pickService(id) {
    st.svc = S.getService(st.cfg, id); st.date = st.time = null; st.error = '';
    $app.innerHTML = '<p class="empty">Загрузка свободного времени…</p>'; bar(null);
    try { st.days = await Api.availability(id); } catch (e) { st.days = []; st.error = e.message; }
    stepSlots();
  }

  function stepSlots() {
    st.step = 2;
    const s = st.svc, d = st.days.find((x) => x.date === st.date);
    const chips = st.days.map((x) => {
      const [, m, dd] = x.date.split('-');
      return `<button class="chip ${x.date === st.date ? 'sel' : ''}" data-d="${x.date}"><small>${S.DAY_SHORT[S.dow(x.date)]}</small><b>${Number(dd)}</b><small>${S.MONTHS[Number(m) - 1].slice(0, 3)}</small></button>`;
    }).join('');
    $app.innerHTML = `<button class="back" id="back">← Все услуги</button>
      <div class="card svc"><div class="row"><b>${esc(s.name)}</b><span class="price">${money(s.price)}</span></div><span class="meta">${esc(S.describeSchedule(s))}</span></div>
      ${st.error ? `<div class="err">${esc(st.error)}</div>` : ''}
      <h2>${s.mode === 'multiday' ? 'Дата заезда' : 'Дата'}</h2>
      ${st.days.length ? `<div class="days">${chips}</div>` : '<p class="empty">Свободных окон пока нет. Позвоните нам.</p>'}
      ${d ? `<h2>${s.mode === 'multiday' ? 'Время заезда' : 'Свободное время'}</h2><div class="times">${d.times.map((t) => `<button class="chip ${t === st.time ? 'sel' : ''}" data-t="${t}">${t}</button>`).join('')}</div>` : ''}
      ${d && s.mode === 'multiday' ? `<div class="info">🚗 Заезд: <b>${S.formatDate(d.date)}, ${d.times[0]}</b><br>🔑 Выдача: <b>${S.formatDate(d.pickupDate)}, ${esc(d.pickupLabel)}</b></div>` : ''}`;
    document.getElementById('back').onclick = stepServices;
    $app.querySelectorAll('[data-d]').forEach((el) => el.onclick = () => { st.date = el.dataset.d; st.time = st.svc.mode === 'multiday' ? st.days.find((x) => x.date === st.date).times[0] : null; st.error = ''; stepSlots(); });
    $app.querySelectorAll('[data-t]').forEach((el) => el.onclick = () => { st.time = el.dataset.t; stepSlots(); });
    bar(`<button class="btn" data-go ${st.date && st.time ? '' : 'disabled'}>Продолжить</button>`, () => { if (st.date && st.time) stepForm(); });
  }

  const whenText = (b) => b.mode === 'multiday'
    ? `Заезд ${S.formatDate(b.date)}, ${b.time}`
    : `${S.formatDate(b.date)}, ${b.time}–${b.endTime}`;

  function stepForm(vals) {
    st.step = 3;
    const v = vals || { name: saved.name || '', phone: saved.phone || '', car: saved.car || '', comment: '' };
    const preview = S.snapshot(st.cfg, st.svc, st.date, st.time);
    $app.innerHTML = `<button class="back" id="back">← Выбор времени</button><h2>Ваши данные</h2>
      <div class="card sum">
        <div><span>Услуга</span><span>${esc(st.svc.name)}</span></div>
        <div><span>${preview.mode === 'multiday' ? 'Заезд' : 'Время'}</span><span>${esc(preview.mode === 'multiday' ? S.formatDate(st.date) + ', ' + st.time : S.formatDate(st.date) + ', ' + st.time + '–' + preview.endTime)}</span></div>
        ${preview.mode === 'multiday' ? `<div><span>Выдача</span><span>${esc(S.formatDate(preview.pickupDate) + ', ' + preview.pickupLabel)}</span></div>` : ''}
        <div><span>Стоимость</span><span>${money(st.svc.price)}</span></div>
      </div>
      ${st.error ? `<div class="err">${esc(st.error)}</div>` : ''}
      <label for="f-name">Имя</label><input id="f-name" autocomplete="name" value="${esc(v.name)}">
      <label for="f-phone">Телефон</label><input id="f-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+971 …" value="${esc(v.phone)}">
      <label for="f-car">Автомобиль</label><input id="f-car" placeholder="Марка, модель, номер" value="${esc(v.car)}">
      <label for="f-comment">Комментарий (необязательно)</label><textarea id="f-comment">${esc(v.comment)}</textarea>`;
    document.getElementById('back').onclick = () => { st.error = ''; stepSlots(); };
    const read = () => ({ name: val('f-name'), phone: val('f-phone'), car: val('f-car'), comment: val('f-comment') });
    bar(`<button class="btn" data-go>Записаться</button>`, async () => {
      const f = read(); const btn = $bar.querySelector('[data-go]');
      const ce = S.validateContact(f); if (ce) { st.error = ce; return stepForm(f); }
      btn.disabled = true; btn.textContent = 'Отправляем…';
      try {
        const b = await Api.book({ serviceId: st.svc.id, date: st.date, time: st.time, ...f });
        localStorage.setItem('bk_client', JSON.stringify({ name: f.name, phone: f.phone, car: f.car }));
        st.done = b; stepDone();
      } catch (e) {
        if (e.status === 409 || /занят|недоступ|нет/.test(e.message)) {
          st.error = e.message + '. Выберите другое время.'; st.days = await Api.availability(st.svc.id).catch(() => []);
          st.date = st.time = null; return stepSlots();
        }
        st.error = e.message; stepForm(f);
      }
    });
  }
  const val = (id) => document.getElementById(id).value;

  function ics(b) {
    const z = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    const end = b.mode === 'multiday' ? z(b.pickupDate, '18:00') : z(b.date, b.endTime);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//booking//RU', 'BEGIN:VEVENT', 'UID:' + b.id + '@booking', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d+/g, ''),
      'DTSTART;TZID=' + st.cfg.timezone + ':' + z(b.date, b.time), 'DTEND;TZID=' + st.cfg.timezone + ':' + end,
      'SUMMARY:' + b.serviceName + ' — ' + st.cfg.shop.name, 'LOCATION:' + (st.cfg.shop.address || ''), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  function stepDone() {
    st.step = 4; const b = st.done;
    $app.innerHTML = `<div class="ok-ico">✅</div><h2 class="center" style="margin-top:0">Вы записаны!</h2>
      <p class="center muted">Мы свяжемся с вами для подтверждения.</p>
      <div class="card sum">
        <div><span>Услуга</span><span>${esc(b.serviceName)}</span></div>
        <div><span>${b.mode === 'multiday' ? 'Заезд' : 'Время'}</span><span>${esc(whenText(b).replace('Заезд ', ''))}</span></div>
        ${b.mode === 'multiday' ? `<div><span>Выдача</span><span>${esc(S.formatDate(b.pickupDate) + ', ' + b.pickupLabel)}</span></div>` : ''}
        <div><span>Авто</span><span>${esc(b.car)}</span></div>
        <div><span>Стоимость</span><span>${money(b.price)}</span></div>
        <div><span>Адрес</span><span>${esc(st.cfg.shop.address || '')}</span></div>
      </div>
      <button class="btn sec" id="ics">📅 Добавить в календарь</button>
      <p style="height:10px"></p><button class="btn sec" id="again">Записаться ещё</button>`;
    document.getElementById('again').onclick = stepServices;
    document.getElementById('ics').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics(b)], { type: 'text/calendar' })); a.download = 'zapis.ics'; a.click();
    };
    bar(null);
  }

  (async function init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    st.mode = await Api.init();
    st.cfg = await Api.config();
    document.title = st.cfg.shop.name + ' — запись';
    stepServices();
  })().catch((e) => { $app.innerHTML = '<p class="empty">Не удалось загрузить: ' + esc(e.message) + '</p>'; });
})();
