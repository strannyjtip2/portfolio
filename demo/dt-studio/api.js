/* Слой данных: если есть сервер (/api) — работает с ним, иначе localStorage-режим (только это устройство). */
(function () {
  const S = window.Shared;
  const LS_CFG = 'bk_config', LS_BOOK = 'bk_bookings';
  let defaultCfg = null;

  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(5))).map((x) => x.toString(16).padStart(2, '0')).join('');
  const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const fail = (msg, extra) => Object.assign(new Error(msg), extra || {});

  async function loadDefault() {
    if (defaultCfg) return defaultCfg;
    const r = await fetch('config.default.json');
    defaultCfg = await r.json();
    return defaultCfg;
  }
  const localCfg = async () => lsGet(LS_CFG, null) || (await loadDefault());

  async function req(method, url, body, pin) {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(pin ? { 'x-admin-pin': pin } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(data.error || 'Ошибка ' + r.status, { status: r.status, canForce: data.canForce });
    return data;
  }

  const Api = {
    mode: 'server',
    async init() {
      try {
        const r = await fetch('api/config', { cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw 0;
        this.mode = 'server';
      } catch (e) { this.mode = 'local'; }
      return this.mode;
    },
    async config() {
      if (this.mode === 'server') return req('GET', 'api/config');
      const c = await localCfg();
      return { shop: c.shop, services: c.services, timezone: c.timezone };
    },
    async availability(serviceId) {
      if (this.mode === 'server') return (await req('GET', 'api/availability?service=' + encodeURIComponent(serviceId))).days;
      const c = await localCfg();
      return S.availability(c, lsGet(LS_BOOK, []), S.getService(c, serviceId));
    },
    async book(input) {
      if (this.mode === 'server') return (await req('POST', 'api/bookings', input)).booking;
      return localCreate(input, 'new', false);
    },
    admin: {
      pin: '',
      async login(pin) {
        if (Api.mode === 'server') { await req('GET', 'api/admin/ping', null, pin); }
        else { const c = await localCfg(); if (String(c.adminPin || '1234') !== String(pin)) throw fail('Неверный PIN'); }
        this.pin = pin;
      },
      async list() {
        if (Api.mode === 'server') return (await req('GET', 'api/admin/bookings', null, this.pin)).bookings;
        return lsGet(LS_BOOK, []).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      },
      async config() {
        if (Api.mode === 'server') return (await req('GET', 'api/admin/config', null, this.pin)).config;
        return localCfg();
      },
      async saveConfig(config) {
        const err = S.validateConfig(config); if (err) throw fail(err);
        if (Api.mode === 'server') return req('PUT', 'api/admin/config', { config }, this.pin);
        const old = await localCfg(); config.adminPin = config.adminPin || old.adminPin; lsSet(LS_CFG, config);
      },
      async create(input) {
        if (Api.mode === 'server') return (await req('POST', 'api/admin/bookings', input, this.pin)).booking;
        return localCreate(input, 'confirmed', !!input.force);
      },
      async update(id, patch) {
        if (Api.mode === 'server') return (await req('PATCH', 'api/admin/bookings/' + id, patch, this.pin)).booking;
        const c = await localCfg(); const all = lsGet(LS_BOOK, []);
        const b = all.find((x) => x.id === id); if (!b) throw fail('Запись не найдена');
        const next = { ...b };
        for (const k of ['name', 'phone', 'car', 'comment', 'ownerNote']) if (k in patch) next[k] = clean(patch[k], 500);
        if (['new', 'confirmed', 'done', 'cancelled'].includes(patch.status)) next.status = patch.status;
        if ((patch.date && patch.date !== b.date) || (patch.time && patch.time !== b.time)) {
          const svc = S.getService(c, b.serviceId) || { id: b.serviceId, mode: b.mode, durationMin: b.durationMin };
          if (!patch.force && next.status !== 'cancelled') {
            const e = S.checkSlot(c, all, svc, patch.date || b.date, patch.time || b.time, undefined, id);
            if (e) throw fail(e, { canForce: true });
          }
          Object.assign(next, S.snapshot(c, { ...svc, name: b.serviceName, price: b.price }, patch.date || b.date, patch.time || b.time));
        }
        lsSet(LS_BOOK, all.map((x) => (x.id === id ? next : x)));
        return next;
      },
      async remove(id) {
        if (Api.mode === 'server') return req('DELETE', 'api/admin/bookings/' + id, null, this.pin);
        lsSet(LS_BOOK, lsGet(LS_BOOK, []).filter((x) => x.id !== id));
      },
    },
  };

  async function localCreate(input, status, force) {
    const c = await localCfg(); const all = lsGet(LS_BOOK, []);
    const svc = S.getService(c, input.serviceId); if (!svc) throw fail('Услуга не найдена');
    const ce = S.validateContact(input); if (ce) throw fail(ce);
    if (!force) { const e = S.checkSlot(c, all, svc, input.date, input.time); if (e) throw fail(e, { status: 409, canForce: true }); }
    const b = { id: newId(), ...S.snapshot(c, svc, input.date, input.time), name: clean(input.name, 80), phone: clean(input.phone, 30), car: clean(input.car, 80), comment: clean(input.comment, 500), status, createdAt: new Date().toISOString() };
    all.push(b); lsSet(LS_BOOK, all);
    return b;
  }

  window.Api = Api;
})();
