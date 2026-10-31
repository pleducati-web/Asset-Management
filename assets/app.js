/* PAMS v1.17.0 — สร้างจาก JavaScript.html (แก้ที่ JavaScript.html แล้วสร้างใหม่)
 * ไฟล์นี้ไม่มีรหัสผ่าน / API Key / Token — สิทธิ์ทุกอย่างตรวจที่ Google Apps Script */
window.APP_VERSION = window.APP_VERSION || '1.17.0';
/* ============================================================
   JavaScript.html — Property & Asset Management System (ตอนที่ 3)
   - ทุกการเรียกเซิร์ฟเวอร์ส่ง session token และเซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำทุกครั้ง
   - การซ่อน/แสดงปุ่มบนหน้านี้เป็นเพียงความสะดวก ไม่ใช่มาตรการความปลอดภัย
   - ไม่ใช้ innerHTML กับข้อมูลใด ๆ (สร้าง DOM ด้วย textContent เท่านั้น) เพื่อป้องกัน XSS
   ============================================================ */
(function () {
  'use strict';

  var S = { token: null, profile: null, config: null, info: null, view: 'dashboard', list: {}, idleTimer: null,
    cache: {}, versions: null, pollTimer: null, polling: false, lastRefresh: 0, pendingRefresh: false, dashYear: null,
    aiHistory: [], aiQuota: null, deepLink: null };
  var IDLE_MINUTES = 30;
  var POLL_MS = 30000;          // ตรวจเวอร์ชันข้อมูลทุก 30 วินาที (เบามาก)
  var FORCE_REFRESH_MS = 300000; // รีเฟรชเต็มอย่างน้อยทุก 5 นาที (กันกรณีแก้ข้อมูลตรงในชีต)
  var READ_FNS = ['getColumnStructure', 'listFieldDefs','analyzeImportColumns', 'getPublicInfo', 'getAppConfig', 'getDashboardData', 'getRecords', 'getRecordById', 'getDataVersion', 'searchAll',
    'listFiles', 'getRecordHistory', 'getLookupOptions', 'getAuditLogs', 'listUsers', 'getSettings', 'getSystemStatus', 'listBackups', 'getImportTemplate', 'healthCheck', 'getAIStatus', 'getFileChunk', 'getHelpGuide', 'getPropertyLinks', 'getComboOptions', 'getMeetingConfig', 'listMeetingRequests', 'getLineGroupSettings', 'getCustomerOverview', 'checkContractFiles', 'listContractFiles'];
  var COLS = {
    assets: ['seqNo', 'encumbrance', 'titleDeedNo', 'landNo', 'address', 'province', 'areaText', 'ownerName', 'assetType', 'buildingDesc', 'appraisalPrice', 'askingPrice', 'marketPrice', 'assetName'], // v1.15 ตามแบบตารางทรัพย์สิน
    land: ['landCode', 'titleDeedNo', 'documentType', 'province', 'district', 'status'],
    customers: ['customerCode', 'fullName', 'customerType', 'phone', 'status'],
    debts: ['debtorCode', 'contractNo', 'principal', 'outstandingBalance', 'status'],
    payments: ['paymentCode', 'paymentDate', 'amount', 'receiptNo', 'status'],
    legal: ['caseCode', 'caseTitle', 'blackCaseNo', 'court', 'status'],
    repairs: ['ticketNo', 'problem', 'urgency', 'actualCost', 'status'],
    sales: ['saleCode', 'assetId', 'offerPrice', 'negotiationDate', 'status'],
    tasks: ['taskCode', 'title', 'assignee', 'priority', 'status'],
    contracts: ['contractNo', 'contractType', 'usePurpose', 'startDate', 'endDate', 'status'],
    meetings: ['meetingCode', 'topicGroup', 'title', 'meetingDate', 'startTime', 'status']
  };
  var STATUS_CLASS = {
    'อยู่ระหว่างดำเนินการ': 'b-progress', 'กำหนดเวลา': 'b-scheduled', 'ขายแล้ว': 'b-sold',
    'เสร็จสิ้น': 'b-done', 'ยกเลิก': 'b-cancel', 'เกินกำหนด': 'b-overdue',
    'ร่าง': 'b-cancel', 'มีผลบังคับ': 'b-done', 'ต่อสัญญาแล้ว': 'b-scheduled', 'สิ้นสุด': 'b-cancel',
    'รอส่ง': 'b-soon', 'ส่งแล้ว': 'b-done', 'ส่งไม่สำเร็จ': 'b-overdue'
  };
  var STATUS_COLOR = {
    'อยู่ระหว่างดำเนินการ': '#2F6FE4', 'กำหนดเวลา': '#7C5CD6', 'ขายแล้ว': '#C79A2B',
    'เสร็จสิ้น': '#15803D', 'ยกเลิก': '#B7BFCC', 'เกินกำหนด': '#C62828',
    'ร่าง': '#8A8AA0', 'มีผลบังคับ': '#34D399', 'ต่อสัญญาแล้ว': '#4CC9F0', 'สิ้นสุด': '#64748B',
    'รอส่ง': '#F59E0B', 'ส่งแล้ว': '#22C55E', 'ส่งไม่สำเร็จ': '#EF4444'
  };
  /** ไฟล์ที่เซิร์ฟเวอร์บล็อกเสมอ (แจ้งผู้ใช้ทันทีโดยไม่ต้องส่ง) — ด่านจริงอยู่ที่เซิร์ฟเวอร์ */
  var BLOCKED_EXT = ['exe', 'bat', 'cmd', 'com', 'js', 'mjs', 'cjs', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash',
    'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'py', 'pyc', 'pl', 'rb', 'jar',
    'class', 'msi', 'msp', 'scr', 'dll', 'sys', 'cpl', 'apk', 'appx', 'dmg', 'pkg', 'deb', 'rpm', 'iso', 'img', 'vhd', 'lnk', 'url',
    'hta', 'reg', 'inf', 'gadget', 'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'chm', 'swf'];
  var SMALL_UPLOAD = 4 * 1024 * 1024; // เกินนี้ส่งเป็นช่วง ๆ

  /* ============================== DOM helpers ============================== */

  var BLOCKED_PROPS = /html|^on|srcdoc/i;
  function el(tag, props) {
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = String(v);
      else if (k === 'on') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
      else if (k === 'attrs') Object.keys(v).forEach(function (a) { if (!/^on/i.test(a) && v[a] !== null && v[a] !== undefined) n.setAttribute(a, String(v[a])); });
      else if (k === 'style') Object.keys(v).forEach(function (s) { n.style[s] = v[s]; });
      else if (!BLOCKED_PROPS.test(k)) n[k] = v;
    });
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(n, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(n, x); }); return; }
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function $(id) { return document.getElementById(id); }
  function svg(path, size) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 20); s.setAttribute('height', size || 20);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    path.split('|').forEach(function (d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  }
  var ICON = {
    brand: 'M3 21h18|M5 21V8l7-5 7 5v13|M9 21v-6h6v6|M9 11h.01M15 11h.01',
    menu: 'M3 6h18M3 12h18M3 18h18', close: 'M18 6 6 18M6 6l12 12', logout: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3',
    plus: 'M12 5v14M5 12h14', refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5', lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.35-4.35',
    dashboard: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2',
    land: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z|M8 2v16|M16 6v16',
    customers: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
    debts: 'M20 12V8H6a2 2 0 0 1 0-4h12v4|M4 6v12a2 2 0 0 0 2 2h14v-4|M18 12a2 2 0 0 0 0 4h4v-4z',
    payments: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z|M8 7h8|M8 11h8|M8 15h5',
    legal: 'M12 3v18|M5 7h14|M5 7l-3 7a3 3 0 0 0 6 0z|M19 7l-3 7a3 3 0 0 0 6 0z|M8 21h8',
    repairs: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    sales: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z|M7 7h.01',
    tasks: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    audit: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
    ai: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z|M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
    send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4z',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01',
    contracts: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M8 13h8|M8 17h5'
  };
  ICON.assets = ICON.brand;
  ICON.meetings = 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z|M16 8.5a4.5 4.5 0 0 1 0 7|M19 5.5a9 9 0 0 1 0 13';
  var CHART_COLORS = ['#7C6CF6', '#4CC9F0', '#F5B82E', '#F06BAA', '#34D399', '#FB923C', '#A5B4FC', '#94A3B8'];
  function brandMark() { return el('div', { class: 'brand-mark' }, svg(ICON.brand, 24)); }

  /* ============================== เรียกเซิร์ฟเวอร์ ============================== */

  /** เวลารอสูงสุดต่อคำขอ (มิลลิวินาที) — เกินแล้วแจ้งผู้ใช้ ไม่ปล่อยให้หน้าเว็บค้าง */
  var TIMEOUTS = { uploadFile: 180000, beginUpload: 60000, uploadChunk: 150000, getFileChunk: 120000, askAI: 60000, importRecords: 150000, backupData: 300000, testRestoreBackup: 150000, setupSystem: 300000,
    generateAISummary: 90000, getAuthorizedFile: 120000, createRequiredFolders: 120000, healthCheck: 120000,
    sendWeeklyReport: 60000, sendMonthlyReport: 60000, testLine: 60000, sendLineNotification: 60000, requestOtp: 60000 };
  var DEFAULT_TIMEOUT = 45000;

  /** แปลงข้อผิดพลาดระดับ google.script.run ให้เป็นข้อความที่ผู้ใช้เข้าใจ */
  function failureInfo(err) {
    var m = String((err && (err.message || err)) || '');
    if (/function not found|ไม่พบฟังก์ชัน|Script function/i.test(m)) return { code: 'OUTDATED', retry: false, message: 'ระบบเพิ่งได้รับการอัปเดต กรุณารีเฟรชหน้าเว็บ (กด F5)' };
    if (/authoriz|permission|สิทธิ์/i.test(m)) return { code: 'AUTH_SCRIPT', retry: false, message: 'สคริปต์ต้องได้รับอนุญาตสิทธิ์ใหม่ กรุณาแจ้งผู้ดูแลให้รันฟังก์ชันใน Apps Script Editor 1 ครั้ง' };
    if (/too many|quota|exceeded|limit/i.test(m)) return { code: 'QUOTA', retry: false, message: 'ระบบใช้งานถึงโควตาของ Google ชั่วคราว กรุณาลองใหม่ในอีกสักครู่' };
    if (/timed? ?out|deadline|maximum execution/i.test(m)) return { code: 'TIMEOUT', retry: true, message: 'เซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาลองใหม่' };
    return { code: 'NETWORK', retry: true, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' };
  }

  /**
   * เรียกฟังก์ชันฝั่งเซิร์ฟเวอร์
   * - คำขออ่านข้อมูลลองใหม่อัตโนมัติสูงสุด 2 ครั้งเมื่อเครือข่ายขัดข้องหรือหมดเวลา (คำขอเขียนไม่ลองซ้ำเอง)
   * - ทุกคำขอมีเวลารอสูงสุด ถ้าเกินจะแจ้งเตือนแทนการค้าง
   */
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    var isRead = READ_FNS.indexOf(fn) !== -1;
    var retries = isRead ? 2 : 0;
    var limit = TIMEOUTS[fn] || DEFAULT_TIMEOUT;
    // v1.13 ช่องทางเชื่อมต่อ: เปิดจาก Apps Script → google.script.run · เปิดจาก GitHub Pages → fetch ไปที่ลิงก์ /exec ใน config.js
    var gas = !!(window.google && google.script && google.script.run);
    var api = apiUrl();
    return new Promise(function (resolve, reject) {
      if (!gas && !api) {
        reject({ code: 'NETWORK', message: 'ไม่พบการเชื่อมต่อกับ Apps Script — ผู้ดูแลต้องใส่ลิงก์ Web App (/exec) ในไฟล์ config.js' });
        return;
      }
      var finished = false;
      function finish(ok, v) { if (finished) return; finished = true; (ok ? resolve : reject)(v); }
      (function attempt(n) {
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          if (n < retries) { attempt(n + 1); return; }
          finish(false, { code: 'TIMEOUT', message: isRead ? 'เซิร์ฟเวอร์ตอบช้าผิดปกติ กรุณาลองใหม่อีกครั้ง'
            : 'การดำเนินการใช้เวลานานผิดปกติ ระบบอาจบันทึกไปแล้ว กรุณากดรีเฟรชเพื่อตรวจสอบก่อนทำซ้ำ' });
        }, limit);
        var onOk = function (out) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (out && out.ok) { finish(true, out.data); return; }
          var e = (out && out.error) || { code: 'INTERNAL', message: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองใหม่' };
          e.requestId = out && out.requestId;
          finish(false, e);
        };
        if (!gas) { // GitHub Pages: ไม่มีรหัสลับในหน้าเว็บ — ส่งเฉพาะ Token ของผู้ใช้ที่เข้าสู่ระบบแล้ว
          var ctl = window.AbortController ? new AbortController() : null;
          var t0 = setTimeout(function () { if (ctl) ctl.abort(); }, limit + 200);
          fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', cache: 'no-store', redirect: 'follow',
            body: JSON.stringify({ pams: 1, fn: fn, args: args, origin: location.origin }), signal: ctl ? ctl.signal : undefined })
            .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
            .then(function (out) { clearTimeout(t0); onOk(out); }, function (err) {
              clearTimeout(t0);
              if (settled) return;
              settled = true; clearTimeout(timer);
              var info = err && err.status === 429 ? { code: 'QUOTA', retry: false, message: 'ระบบใช้งานถึงโควตาของ Google ชั่วคราว กรุณาลองใหม่ในอีกสักครู่' }
                : err && err.status >= 400 && err.status < 500 ? { code: 'NETWORK', retry: false, message: 'เชื่อมต่อ Web App ไม่ได้ (HTTP ' + err.status + ') — ตรวจลิงก์ใน config.js และการ Deploy ให้ "ทุกคน" เข้าถึงได้' }
                : failureInfo(err);
              if (info.retry && n < retries) { setTimeout(function () { attempt(n + 1); }, 800 * (n + 1)); return; }
              finish(false, { code: info.code, message: info.message });
            });
          return;
        }
        var runner = google.script.run
          .withSuccessHandler(function (out) {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (out && out.ok) { finish(true, out.data); return; }
            var e = (out && out.error) || { code: 'INTERNAL', message: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองใหม่' };
            e.requestId = out && out.requestId;
            finish(false, e);
          })
          .withFailureHandler(function (err) {
            if (settled) return;
            settled = true; clearTimeout(timer);
            var info = failureInfo(err);
            if (info.retry && n < retries) { setTimeout(function () { attempt(n + 1); }, 800 * (n + 1)); return; }
            finish(false, { code: info.code, message: info.message });
          });
        try { runner[fn].apply(runner, args); }
        catch (ex) { settled = true; clearTimeout(timer); finish(false, { code: 'OUTDATED', message: 'ระบบเพิ่งได้รับการอัปเดต กรุณารีเฟรชหน้าเว็บ (กด F5)' }); }
      })(0);
    });
  }
  /** ลิงก์ Web App จาก config.js (เฉพาะ https://script.google.com/.../exec — กันส่ง Token ไปที่อื่น) */
  function apiUrl() {
    var u = String((window.PAMS_CONFIG && window.PAMS_CONFIG.apiUrl) || '').trim();
    return /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.\-]+\/)?macros\/s\/[A-Za-z0-9_\-]+\/exec$/.test(u) ? u : '';
  }
  function authed(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    touchIdle();
    return call.apply(null, [fn, S.token].concat(args)).catch(function (e) {
      if (e && (e.code === 'SESSION_EXPIRED' || e.code === 'AUTH_REQUIRED')) forceLogout(e.message);
      throw e;
    });
  }
  /** เก็บผลลัพธ์ล่าสุดไว้แสดงทันที (จำกัด 40 ชุด กันหน่วยความจำโต) */
  function cacheSet(key, val) {
    if (S.cache[key]) delete S.cache[key];
    S.cache[key] = val;
    var keys = Object.keys(S.cache);
    while (keys.length > 40) { delete S.cache[keys.shift()]; }
  }
  function newRid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'r' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var store = {
    get: function () { try { return sessionStorage.getItem('pams_t'); } catch (e) { return null; } },
    set: function (v) { try { sessionStorage.setItem('pams_t', v); } catch (e) { /* ไม่มี storage ก็ทำงานต่อได้ */ } },
    clear: function () { try { sessionStorage.removeItem('pams_t'); } catch (e) { /* ignore */ } }
  };

  /* ============================== Toast / Modal / Busy ============================== */

  function toast(msg, type, ref) {
    var box = el('div', { class: 'toast ' + (type || ''), attrs: { role: type === 'err' ? 'alert' : 'status' } },
      el('div', { class: 'msg' }, msg, ref ? el('span', { class: 'ref mono', text: 'รหัสอ้างอิง: ' + ref }) : null),
      el('button', { attrs: { 'aria-label': 'ปิด' }, text: '×', on: { click: function () { box.remove(); } } }));
    $('toasts').appendChild(box);
    setTimeout(function () { if (box.parentNode) box.remove(); }, type === 'err' ? 9000 : 4500);
  }
  function showError(e) {
    e = e || {};
    var msg = e.message || 'เกิดข้อผิดพลาด';
    if (Array.isArray(e.details) && e.details.length) msg += ' — ' + e.details.slice(0, 4).join(' · ');
    toast(msg, 'err', e.code === 'INTERNAL' ? e.requestId : null);
  }
  function busy(btn, promiseFn) {
    if (btn.disabled) return Promise.resolve();
    var label = btn.textContent;
    btn.disabled = true;
    clear(btn); btn.appendChild(el('span', { class: 'spin' })); btn.appendChild(document.createTextNode(' กำลังดำเนินการ…'));
    return Promise.resolve().then(promiseFn).finally(function () { btn.disabled = false; clear(btn); btn.textContent = label; });
  }

  var modals = [];
  function openModal(opt) {
    var back = el('div', { class: 'modal-back', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    var title = el('h3', { text: opt.title || '' });
    var body = el('div', { class: 'modal-body' });
    var foot = el('div', { class: 'modal-foot' });
    var box = el('div', { class: 'modal' + (opt.size === 'sm' ? ' sm' : '') },
      el('div', { class: 'modal-head' }, title,
        el('button', { class: 'btn btn-ghost btn-sm', attrs: { 'aria-label': 'ปิดหน้าต่าง' }, on: { click: function () { m.close(); } } }, svg(ICON.close, 18))),
      body, foot);
    back.appendChild(box);
    var m = {
      back: back, body: body, foot: foot, title: title, onClose: opt.onClose,
      close: function () {
        if (!back.parentNode) return;
        back.remove();
        modals = modals.filter(function (x) { return x !== m; });
        if (m.onClose) m.onClose();
        if (!modals.length && S.pendingRefresh) { S.pendingRefresh = false; setTimeout(silentRefresh, 50); }
      },
      setBody: function (n) { clear(body); append(body, n); },
      setFoot: function (n) { clear(foot); append(foot, n); foot.classList.toggle('hidden', !n || (Array.isArray(n) && !n.length)); }
    };
    back.addEventListener('mousedown', function (ev) { if (ev.target === back && !opt.sticky) m.close(); });
    if (opt.body) m.setBody(opt.body);
    m.setFoot(opt.foot || null);
    $('modalRoot').appendChild(back);
    modals.push(m);
    // โฟกัสช่องแรกทันทีที่เปิด (ไม่ใช้ตัวหน่วงเวลา เพื่อไม่ให้แย่งโฟกัสขณะผู้ใช้เริ่มพิมพ์)
    var first = box.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea');
    if (first && !box.contains(document.activeElement)) first.focus({ preventScroll: true });
    return m;
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && modals.length) modals[modals.length - 1].close(); });

  function confirmBox(opt) {
    return new Promise(function (resolve) {
      var reason = opt.reasonLabel ? el('textarea', { class: 'input', maxLength: 500, placeholder: opt.reasonLabel }) : null;
      var typed = opt.requireText ? el('input', { class: 'input mono', placeholder: opt.requireText }) : null;
      var done = false;
      var ok = el('button', { class: 'btn ' + (opt.danger ? 'btn-danger solid' : 'btn-primary'), text: opt.okText || 'ยืนยัน' });
      var m = openModal({
        title: opt.title || 'ยืนยัน', size: 'sm', sticky: true,
        body: el('div', { class: 'stack' }, el('p', { class: 'pre', style: { margin: 0 }, text: opt.message || '' }),
          reason ? el('div', { class: 'field' }, el('label', { text: opt.reasonLabel }), reason) : null,
          typed ? el('div', { class: 'field' }, el('label', { text: 'พิมพ์ข้อความนี้เพื่อยืนยัน: ' + opt.requireText }), typed) : null),
        foot: [el('button', { class: 'btn', text: opt.cancelText || 'ยกเลิก', on: { click: function () { m.close(); } } }), ok],
        onClose: function () { if (!done) resolve({ ok: false }); }
      });
      ok.addEventListener('click', function () {
        if (typed && typed.value.trim() !== opt.requireText) { typed.classList.add('invalid'); return; }
        done = true; m.close();
        resolve({ ok: true, reason: reason ? reason.value.trim() : '', text: typed ? typed.value.trim() : '' });
      });
    });
  }

  /* ============================== รูปแบบการแสดงผล ============================== */

  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function fmtDate(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(ymd || ''))) return ymd ? String(ymd) : '–';
    var s = String(ymd);
    return Number(s.slice(8, 10)) + ' ' + TH_MONTHS[Number(s.slice(5, 7)) - 1] + ' ' + (Number(s.slice(0, 4)) + 543);
  }
  function fmtTs(ts) { var s = String(ts || ''); return s ? fmtDate(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) + ' น.' : '') : '–'; }
  function fmtNum(n, d) { if (n === '' || n === null || n === undefined || isNaN(Number(n))) return '–'; return Number(n).toLocaleString('th-TH', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 4 : d }); }
  function fmtMoney(n) { return n === '' || n === null || n === undefined ? '–' : fmtNum(n, 2) + ' ฿'; }
  function fmtSize(b) { b = Number(b) || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function statusBadge(s) { return s ? el('span', { class: 'badge ' + (STATUS_CLASS[s] || 'b-cancel'), text: s }) : el('span', { class: 'muted', text: '–' }); }
  function dueBadge(d) {
    if (!d) return null;
    if (d.overdue) return el('span', { class: 'badge b-overdue', text: 'เกินกำหนด' + (d.lastDue ? ' · ' + fmtDate(d.nextDue || d.lastDue) : '') });
    if (d.dueSoon) return el('span', { class: 'badge b-soon', text: 'อีก ' + d.daysLeft + ' วัน · ' + fmtDate(d.nextDue) });
    return null;
  }
  function lockBadge() { return el('span', { class: 'badge b-lock', attrs: { title: 'ซ่อนตามสิทธิ์ของคุณ' } }, svg(ICON.lock, 12), 'ซ่อนตามสิทธิ์'); }
  function fieldValue(f, rec) {
    if (rec._masked && rec._masked.indexOf(f.k) !== -1) return lockBadge();
    var v = rec[f.k];
    if (v === '' || v === null || v === undefined) return el('span', { class: 'muted', text: '–' });
    if (f.t === 'status') return statusBadge(v);
    if (f.t === 'money') return fmtMoney(v);
    if (f.t === 'number') return fmtNum(v);
    if (f.t === 'date') return fmtDate(v);
    if (f.t === 'time') return String(v) + ' น.';
    if (f.t === 'url') return /^https?:\/\/\S+$/i.test(String(v)) ? el('a', { href: String(v), target: '_blank', rel: 'noopener noreferrer', class: 'break', text: String(v) }) : String(v);
    if (f.t === 'select' && f.k === 'relatedCategory' && S.config.schemas[v]) return S.config.schemas[v].label;
    if (f.t === 'select' && f.k === 'relatedCategory') return String(v);
    return String(v);
  }

  /* ============================== สิทธิ์ (ใช้แสดงปุ่มเท่านั้น) ============================== */

  function can(cat, action) { var c = S.profile && S.profile.categories[cat]; return !!c && c.indexOf(action) !== -1; }
  function canG(p) { return !!S.profile && S.profile.global.indexOf(p) !== -1; }

  /* ============================== Idle logout ============================== */

  function touchIdle() {
    if (!S.token) return;
    clearTimeout(S.idleTimer);
    S.idleTimer = setTimeout(function () { logout('ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งาน ' + IDLE_MINUTES + ' นาที'); }, IDLE_MINUTES * 60000);
  }
  ['click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (S.token) touchIdle(); }, { passive: true }); });

  /* ============================== เริ่มระบบ / เข้าสู่ระบบ ============================== */

  /** เริ่มระบบ: โหลดข้อมูลหน้าเข้าสู่ระบบและตรวจเซสชันเดิมพร้อมกัน (เร็วขึ้น) */
  /** ลิงก์จาก LINE (?c=หมวด&id=รหัส) — จำไว้ แล้วเปิดรายการหลังเข้าสู่ระบบ */
  function readDeepLink() {
    var apply = function (p) {
      if (/^[a-z]{2,20}$/.test(p.c || '')) S.deepLink = { c: p.c, id: /^[A-Z]{3}-\d{6}-[A-F0-9]{8}$/.test(p.id || '') ? p.id : null };
      else if (['dashboard', 'ai', 'help'].indexOf(p.v) !== -1) S.deepLink = { v: p.v };
      if (S.deepLink && S.config) openDeepLink();
    };
    if (!(window.google && google.script && google.script.url)) { // v1.13 GitHub Pages: อ่านจากลิงก์ของหน้าเว็บ
      try { var sp = new URLSearchParams(location.search); apply({ c: sp.get('c') || '', id: sp.get('id') || '', v: sp.get('v') || '' }); } catch (e) { /* ignore */ }
      return;
    }
    try {
      google.script.url.getLocation(function (loc) {
        var p = (loc && loc.parameter) || {};
        if (/^[a-z]{2,20}$/.test(p.c || '')) S.deepLink = { c: p.c, id: /^[A-Z]{3}-\d{6}-[A-F0-9]{8}$/.test(p.id || '') ? p.id : null };
        else if (['dashboard', 'ai', 'help'].indexOf(p.v) !== -1) S.deepLink = { v: p.v }; // ปุ่ม "เปิด Dashboard" จาก LINE
        if (S.deepLink && S.config) openDeepLink();
      });
    } catch (e) { /* เปิดนอก Apps Script */ }
  }
  function openDeepLink() {
    var d = S.deepLink; S.deepLink = null;
    if (!d || !S.config) return;
    if (d.v) { if (d.v !== 'ai' || S.config.aiAvailable) navigate(d.v); return; }
    if (!S.config.schemas[d.c]) { toast('คุณไม่มีสิทธิ์ดูหมวดที่ลิงก์ส่งมา', 'warn'); return; }
    navigate('cat:' + d.c);
    if (d.id) openDetail(d.c, d.id);
  }

  function boot() {
    readDeepLink();
    var t = store.get();
    var hasToken = !!t && /^[a-f0-9]{64}$/.test(t);
    var infoP = call('getPublicInfo').then(function (info) { S.info = info; })
      .catch(function (e) {
        S.info = { appName: 'ระบบบริหารจัดการทรัพย์สินและอสังหาริมทรัพย์', orgName: '', env: 'TEST' };
        if (!(window.google && google.script && google.script.run)) S.connErr = (e && e.message) || 'เชื่อมต่อ Apps Script ไม่ได้ — ตรวจลิงก์ /exec ในไฟล์ config.js'; // v1.13 หน้าเว็บ GitHub Pages
      });
    if (!hasToken) { infoP.then(function () { if (!S.token) renderLogin(S.connErr || null); }); return; }
    S.token = t;
    call('getAppConfig', t).then(function (cfg) { startApp(cfg); infoP.catch(function () {}); })
      .catch(function (e) {
        S.token = null; store.clear();
        infoP.then(function () { if (!S.token) renderLogin(e && e.code !== 'SESSION_EXPIRED' && e.code !== 'AUTH_REQUIRED' ? e.message : null); });
      });
  }

  /* ----- หน้าเข้าสู่ระบบแบบ "ตู้นิรภัย 4 ชั้น": แถบสีบอกความคืบหน้าการยืนยันตัวตน ----- */
  var LOCKS = [
    { color: '#EE6B4D', title: 'ชั้นที่ 1 · อีเมลถูกต้อง' },
    { color: '#F2A23A', title: 'ชั้นที่ 2 · ส่งรหัสแล้ว' },
    { color: '#F2D24B', title: 'ชั้นที่ 3 · กรอกรหัสครบ' },
    { color: '#5CC97B', title: 'ชั้นที่ 4 · ยืนยันตัวตน' }
  ];

  /** ภาพตู้นิรภัย (SVG วาดเอง ไม่โหลดรูปภายนอก) */
  function vaultArt() {
    var s = sv('svg', { viewBox: '0 0 120 120', class: 'vault-svg', 'aria-hidden': 'true' });
    var defs = sv('defs');
    var g1 = sv('linearGradient', { id: 'vBody', x1: 0, y1: 0, x2: 1, y2: 1 });
    g1.appendChild(sv('stop', { offset: '0%', 'stop-color': '#5A5D66' })); g1.appendChild(sv('stop', { offset: '100%', 'stop-color': '#2B2D33' }));
    var g2 = sv('radialGradient', { id: 'vDoor', cx: '40%', cy: '35%', r: '70%' });
    g2.appendChild(sv('stop', { offset: '0%', 'stop-color': '#8D9099' })); g2.appendChild(sv('stop', { offset: '100%', 'stop-color': '#3A3C43' }));
    defs.appendChild(g1); defs.appendChild(g2); s.appendChild(defs);
    s.appendChild(sv('rect', { x: 4, y: 4, width: 112, height: 112, rx: 18, fill: 'url(#vBody)' }));
    s.appendChild(sv('rect', { x: 57, y: 4, width: 6, height: 112, class: 'vault-seam' }));
    s.appendChild(sv('rect', { x: 10, y: 44, width: 8, height: 32, rx: 3, fill: '#6E717A' }));
    s.appendChild(sv('circle', { cx: 60, cy: 60, r: 42, fill: '#1E2026', stroke: '#16171B', 'stroke-width': 3 }));
    s.appendChild(sv('circle', { cx: 60, cy: 60, r: 36, fill: 'url(#vDoor)' }));
    s.appendChild(sv('circle', { cx: 60, cy: 60, r: 36, fill: 'none', stroke: '#9EA1AA', 'stroke-opacity': .35, 'stroke-dasharray': '2 4' }));
    var wheel = sv('g', { class: 'vault-wheel' });
    wheel.appendChild(sv('circle', { cx: 60, cy: 60, r: 17, fill: 'none', stroke: '#C9CCD3', 'stroke-width': 4 }));
    [0, 60, 120].forEach(function (a) { wheel.appendChild(sv('rect', { x: 58, y: 40, width: 4, height: 40, rx: 2, fill: '#C9CCD3', transform: 'rotate(' + a + ' 60 60)' })); });
    wheel.appendChild(sv('circle', { cx: 60, cy: 60, r: 6, fill: '#E4E6EB' }));
    s.appendChild(wheel);
    return el('div', { class: 'vault' }, s);
  }

  /** การ์ดสถานะ: level 0–4 (จำนวนชั้นที่ปลดแล้ว) · tone: ok | busy | err */
  function lockMeter() {
    var bars = LOCKS.map(function (l) { return el('i', { attrs: { title: l.title } }); });
    var title = el('div', { class: 'lm-title' }), desc = el('div', { class: 'lm-desc' }), meta = el('div', { class: 'lm-meta' });
    var art = vaultArt();
    var box = el('div', { class: 'lock-meter', attrs: { role: 'status', 'aria-live': 'polite' } }, art,
      el('div', { class: 'lm-body' }, el('div', { class: 'lm-bars' }, bars), title, desc, meta));
    return {
      el: box,
      set: function (level, t, d, m, tone) {
        bars.forEach(function (b, i) { b.style.background = i < level ? LOCKS[i].color : ''; b.classList.toggle('on', i < level); b.classList.toggle('pulse', tone === 'busy' && i === level); });
        var c = tone === 'err' ? '#F25F6B' : (level ? LOCKS[Math.min(level, 4) - 1].color : '#9A9AB0');
        title.textContent = t; title.style.color = c;
        desc.textContent = d || ''; meta.textContent = m || '';
        box.style.borderColor = tone === 'err' ? 'rgba(242,95,107,.55)' : (level ? c + '99' : '');
        box.classList.toggle('shake', tone === 'err'); if (tone === 'err') setTimeout(function () { box.classList.remove('shake'); }, 500);
        var wheel = art.querySelector('.vault-wheel'); if (wheel) wheel.style.transform = 'rotate(' + (level >= 4 ? 300 : level * 45) + 'deg)';
        box.classList.toggle('open', level >= 4);
      },
      meta: function (m) { meta.textContent = m; }
    };
  }

  var otpTimer = null;
  function renderLogin(notice) {
    S.token = null; S.profile = null; S.config = null;
    clearInterval(otpTimer);
    var app = clear($('app'));
    var info = S.info || {};
    var body = el('div');
    var meter = lockMeter();
    var card = el('div', { class: 'login-card' },
      el('div', { class: 'row' }, brandMark(), el('div', { class: 'spacer' }), info.env !== 'PRODUCTION' ? el('span', { class: 'env-badge', text: 'โหมดทดสอบ' }) : null),
      el('h1', { text: info.appName || 'ระบบบริหารจัดการทรัพย์สิน' }),
      el('p', { class: 'org', text: info.orgName || 'Property & Asset Management System' }),
      notice ? el('div', { class: 'notice gold', style: { marginBottom: '14px' }, text: notice }) : null,
      body,
      el('div', { class: 'foot', text: 'เข้าสู่ระบบด้วยอีเมลที่ผู้ดูแลลงทะเบียนไว้ ระบบจะส่งรหัส 6 หลักไปทางอีเมล ห้ามแจ้งรหัสแก่ผู้อื่น' }));
    app.appendChild(el('div', { class: 'login-wrap' }, card));
    S.loginMeter = meter;
    stepEmail(body);
  }

  /** ช่องกรอกแบบมีเส้นเรืองแสง + ลิงก์ด้านขวาของหัวข้อ + ปุ่มรูปตา (ถ้ามี) */
  function lockField(label, input, link, eye) {
    return el('div', { class: 'lk-field' },
      el('div', { class: 'lk-label' }, el('label', { text: label }), link || null),
      el('div', { class: 'lk-input' }, input, eye || null));
  }

  function stepEmail(body, preset) {
    clearInterval(otpTimer);
    var meter = S.loginMeter;
    var email = el('input', { class: 'lk-control', type: 'email', autocomplete: 'email', placeholder: 'name@example.com', value: preset || '', attrs: { inputmode: 'email', 'aria-label': 'อีเมล', spellcheck: 'false' } });
    var btn = el('button', { class: 'btn btn-primary lk-btn', type: 'submit', text: 'ส่งรหัสเข้าสู่ระบบ' });
    var help = el('a', { href: '#', class: 'lk-link', text: 'ยังไม่มีสิทธิ์ใช้งาน?', on: { click: function (ev) { ev.preventDefault(); toast('ติดต่อผู้ดูแลระบบเพื่อลงทะเบียนอีเมลของคุณ ระบบไม่เปิดให้สมัครเอง', 'warn'); } } });
    var ok = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
    function paint() {
      var v = email.value.trim();
      if (!v) meter.set(0, 'ตู้นิรภัยล็อกอยู่ 4 ชั้น', 'กรอกอีเมลที่ลงทะเบียนไว้เพื่อเริ่มปลดล็อก', 'ยืนยันตัวตน 2 ขั้น: อีเมล + รหัสใช้ครั้งเดียว');
      else if (!ok(v)) meter.set(0, 'อีเมลยังไม่ครบ', 'ตัวอย่าง: name@example.com', 'ยืนยันตัวตน 2 ขั้น: อีเมล + รหัสใช้ครั้งเดียว');
      else meter.set(1, 'ปลดล็อกชั้นที่ 1 แล้ว', 'กด "ส่งรหัสเข้าสู่ระบบ" เพื่อรับรหัส 6 หลักทางอีเมล', 'เหลืออีก 3 ชั้น');
    }
    email.addEventListener('input', function () { email.parentNode.classList.remove('invalid'); paint(); });
    var form = el('form', { class: 'stack', on: { submit: function (ev) {
      ev.preventDefault();
      var v = email.value.trim();
      if (!ok(v)) { email.parentNode.classList.add('invalid'); meter.set(0, 'อีเมลไม่ถูกต้อง', 'ตรวจตัวสะกดอีเมลอีกครั้ง', '', 'err'); email.focus(); return; }
      meter.set(1, 'กำลังส่งรหัส…', 'ระบบกำลังส่งรหัส 6 หลักไปที่ ' + v, '', 'busy');
      busy(btn, function () {
        return call('requestOtp', v).then(function (r) { toast(r.message, 'ok'); stepCode(body, v); })
          .catch(function (e) { meter.set(1, 'ส่งรหัสไม่สำเร็จ', e.message || 'ลองใหม่อีกครั้ง', '', 'err'); showError(e); });
      });
    } } }, lockField('อีเมล', email, help), meter.el, btn);
    clear(body).appendChild(form);
    paint();
    email.focus();
  }

  function stepCode(body, email) {
    var meter = S.loginMeter;
    var mins = Number((S.info && S.info.otpMinutes) || 5);
    var expires = Date.now() + mins * 60000;
    var code = el('input', { class: 'lk-control otp-input', type: 'text', maxLength: 6, autocomplete: 'one-time-code', placeholder: '••••••', attrs: { inputmode: 'numeric', pattern: '[0-9]*', 'aria-label': 'รหัสยืนยัน 6 หลัก' } });
    var eyeBtn = el('button', { class: 'lk-eye', type: 'button', attrs: { 'aria-label': 'ซ่อน/แสดงรหัส', title: 'ซ่อน/แสดงรหัส' } }, svg('M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 22));
    eyeBtn.addEventListener('click', function () {
      var hidden = code.type === 'password';
      code.type = hidden ? 'text' : 'password';
      eyeBtn.classList.toggle('off', !hidden);
      code.focus();
    });
    var again = el('a', { href: '#', class: 'lk-link', text: 'เปลี่ยนอีเมล / ขอรหัสใหม่', on: { click: function (ev) { ev.preventDefault(); stepEmail(body, email); } } });
    var btn = el('button', { class: 'btn btn-primary lk-btn', type: 'submit', text: 'เข้าสู่ระบบ' });
    function left() {
      var ms = expires - Date.now();
      if (ms <= 0) return 'รหัสหมดอายุแล้ว — กด "เปลี่ยนอีเมล / ขอรหัสใหม่"';
      var s = Math.ceil(ms / 1000);
      return 'รหัสหมดอายุใน ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) + ' นาที · ใช้ได้ครั้งเดียว';
    }
    function paint() {
      var n = code.value.length;
      if (n === 6) meter.set(3, 'ปลดล็อกชั้นที่ 3 แล้ว', 'กด "เข้าสู่ระบบ" เพื่อปลดล็อกชั้นสุดท้าย', left());
      else meter.set(2, n ? 'กรอกรหัสแล้ว ' + n + '/6 หลัก' : 'ส่งรหัสไปที่อีเมลแล้ว', 'เปิดอีเมล ' + email + ' แล้วกรอกรหัส 6 หลัก (ดูในจดหมายขยะด้วย)', left());
    }
    code.addEventListener('input', function () { code.value = code.value.replace(/\D/g, '').slice(0, 6); code.parentNode.classList.remove('invalid'); paint(); });
    clearInterval(otpTimer);
    otpTimer = setInterval(function () { if (!document.body.contains(code)) { clearInterval(otpTimer); return; } meter.meta(left()); }, 1000);
    var form = el('form', { class: 'stack', on: { submit: function (ev) {
      ev.preventDefault();
      if (!/^\d{6}$/.test(code.value)) { code.parentNode.classList.add('invalid'); meter.set(2, 'รหัสต้องมี 6 หลัก', 'กรอกตัวเลขให้ครบ 6 หลัก', left(), 'err'); return; }
      meter.set(3, 'กำลังตรวจรหัส…', 'รอสักครู่ ระบบกำลังยืนยันตัวตน', left(), 'busy');
      busy(btn, function () {
        return call('verifyOtp', email, code.value).then(function (r) {
          clearInterval(otpTimer);
          meter.set(4, 'ปลดล็อกครบ 4 ชั้น', 'ยืนยันตัวตนสำเร็จ กำลังเปิดระบบ…', 'เซสชันนี้ถูกเข้ารหัสและหมดอายุอัตโนมัติ');
          S.token = r.token; store.set(r.token);
          return call('getAppConfig', r.token).then(startApp);
        }).catch(function (e) {
          code.value = ''; code.parentNode.classList.add('invalid');
          meter.set(2, 'รหัสไม่ถูกต้อง', e.message || 'ลองกรอกใหม่อีกครั้ง', left(), 'err');
          showError(e);
        });
      });
    } } },
      lockField('รหัสยืนยัน 6 หลัก', code, again, eyeBtn), meter.el, btn);
    clear(body).appendChild(form);
    paint();
    code.focus();
  }

  function logout(msg) {
    var t = S.token;
    S.token = null; store.clear(); clearTimeout(S.idleTimer); stopPoller();
    S.cache = {}; S.versions = null; S.pendingRefresh = false;
    // ไม่ให้ผู้ใช้คนถัดไปบนเครื่องเดียวกันเห็นคำค้น/ประวัติถาม AI/ค่าหน้าจอของคนก่อน
    S.list = {}; S.aiHistory = []; S.aiQuota = null; S.meetingCfg = null;
    modals.slice().forEach(function (m) { m.close(); });
    clear($('toasts'));
    if (t) call('logout', t).catch(function () { /* ignore */ });
    renderLogin(msg);
  }
  function forceLogout(msg) { if (!S.token) return; logout(msg || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }

  function startApp(config) {
    S.config = config; S.profile = config.profile;
    touchIdle();
    renderShell();
    startPoller();
    var adminView = { users: 'manageUsers', settings: 'manageSettings', audit: 'viewAudit' };
    navigate(S.view && (S.view === 'dashboard' || config.schemas[S.view.replace('cat:', '')] || S.view === 'help' || (adminView[S.view] && canG(adminView[S.view])) || (S.view === 'ai' && config.aiAvailable)) ? S.view : 'dashboard');
    if (S.deepLink) openDeepLink();
  }

  function reloadConfig() { return authed('getAppConfig').then(function (c) { S.config = c; S.profile = c.profile; renderSidebar(); renderAiTopBtn(); }); }

  /* ============================== โครงหน้า ============================== */

  function todayText() {
    var d = new Date(), days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    return 'วันนี้ ' + days[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  function renderShell() {
    var app = clear($('app'));
    var env = S.config.settings.DATA_ENV;
    var initials = (S.profile.displayName || S.profile.email || '?').trim().charAt(0).toUpperCase();
    var shell = el('div', { class: 'shell', id: 'shell' },
      el('nav', { class: 'sidebar', id: 'sidebar', attrs: { 'aria-label': 'เมนูหลัก' } }),
      el('div', { class: 'backdrop', on: { click: function () { $('shell').classList.remove('nav-open'); } } }),
      el('header', { class: 'topbar' },
        el('button', { class: 'btn btn-ghost menu-btn', attrs: { 'aria-label': 'เปิดเมนู' }, on: { click: function () { $('shell').classList.toggle('nav-open'); } } }, svg(ICON.menu)),
        searchBox(),
        el('span', { id: 'aiTopSlot' }),
        el('span', { class: 'today', id: 'todayText', text: todayText() }),
        el('span', { class: 'env-badge' + (env === 'PRODUCTION' ? ' prod' : ''), text: env === 'PRODUCTION' ? 'ใช้งานจริง' : 'ทดสอบ' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'live', id: 'live', attrs: { title: 'ระบบตรวจข้อมูลใหม่อัตโนมัติทุก 30 วินาที และอัปเดตหน้าจอเมื่อข้อมูลเปลี่ยน' } },
          el('i'), el('span', { class: 'txt', text: 'อัปเดตอัตโนมัติ' })),
        el('button', { class: 'btn btn-ghost btn-icon', attrs: { title: 'รีเฟรชข้อมูล', 'aria-label': 'รีเฟรชข้อมูล' }, on: { click: manualRefresh } }, svg(ICON.refresh, 18)),
        el('div', { class: 'user-chip' },
          el('div', { class: 'who' }, S.profile.displayName, el('small', { text: S.profile.roleLabel })),
          el('div', { class: 'avatar', text: initials })),
        el('button', { class: 'btn btn-ghost btn-sm', attrs: { title: 'ออกจากระบบ' }, on: { click: function () { logout('ออกจากระบบแล้ว'); } } }, svg(ICON.logout, 18), el('span', { class: 'sr-only', text: 'ออกจากระบบ' }))),
      el('main', { class: 'main', id: 'main' }));
    try { if (localStorage.getItem('pams_rail') === '1' && window.innerWidth > 1024) shell.classList.add('rail-open'); } catch (e) { /* ignore */ }
    app.appendChild(shell);
    renderSidebar();
    renderAiTopBtn();
  }
  function renderAiTopBtn() {
    var slot = $('aiTopSlot'); if (!slot) return;
    clear(slot);
    if (S.config && S.config.aiAvailable) slot.appendChild(el('button', { class: 'btn btn-sm ai-top', attrs: { title: 'ถามคำถามเกี่ยวกับข้อมูลด้วยภาษาธรรมดา' }, on: { click: function () { navigate('ai'); } } }, svg(ICON.ai, 16), el('span', { class: 'txt', text: 'ถาม AI' })));
  }

  function navItem(label, view, icon) {
    return el('button', { class: 'nav-item' + (S.view === view ? ' active' : ''), attrs: { 'data-view': view, title: label }, on: { click: function () { navigate(view); } } },
      svg(ICON[icon] || ICON.dashboard, 20), el('span', { class: 'label', text: label }));
  }
  function renderSidebar() {
    var nav = $('sidebar'); if (!nav) return;
    clear(nav);
    nav.appendChild(el('div', { class: 'rail-brand' }, brandMark(),
      el('div', { class: 'name' }, S.config.settings.APP_DISPLAY_NAME || S.config.app.name,
        el('div', { class: 'muted small', text: S.config.settings.ORG_NAME || 'Property & Asset Management' }))));
    nav.appendChild(navItem('ภาพรวม (Dashboard)', 'dashboard', 'dashboard'));
    if (S.config.aiAvailable) nav.appendChild(navItem('ถาม AI', 'ai', 'ai'));
    // v1.9 เมนูหลัก 7 หมวด (+ แจ้งนัดแยก) — หมวดย่อยแสดงเป็นแท็บในหน้ารายการ
    var mainItems = [];
    S.config.groups.forEach(function (g) {
      var tabs = groupTabs(g);
      if (!tabs.length) return;
      var first = g.categories.filter(function (c) { return S.config.schemas[c]; })[0] || tabs[0];
      var b = navItem(g.label, 'cat:' + first, first);
      b.setAttribute('data-tabs', tabs.join(','));
      if (S.view && S.view.indexOf('cat:') === 0 && tabs.indexOf(S.view.slice(4)) !== -1) b.classList.add('active');
      mainItems.push(b);
    });
    if (mainItems.length) nav.appendChild(el('div', { class: 'nav-group' }, el('div', { class: 'nav-group-title', text: 'เมนูหลัก' }), mainItems));
    var admin = [];
    if (canG('manageUsers')) admin.push(navItem('ผู้ใช้งานและสิทธิ์', 'users', 'users'));
    if (canG('manageSettings')) admin.push(navItem('ตั้งค่าระบบ', 'settings', 'settings'));
    if (canG('viewAudit')) admin.push(navItem('ประวัติการใช้งาน', 'audit', 'audit'));
    if (admin.length) nav.appendChild(el('div', { class: 'nav-group' }, el('div', { class: 'nav-group-title', text: 'ผู้ดูแลระบบ' }), admin));
    nav.appendChild(el('div', { class: 'nav-group' }, navItem('วิธีใช้งาน', 'help', 'help')));
    var open = $('shell') && $('shell').classList.contains('rail-open');
    nav.appendChild(el('button', { class: 'nav-item rail-toggle', attrs: { title: open ? 'ย่อเมนู' : 'ขยายเมนู', 'aria-label': open ? 'ย่อเมนู' : 'ขยายเมนู' },
      on: { click: function () { var sh = $('shell'); var o = sh.classList.toggle('rail-open'); try { localStorage.setItem('pams_rail', o ? '1' : '0'); } catch (e) { /* ignore */ } renderSidebar(); } } },
      svg(open ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6', 20), el('span', { class: 'label', text: open ? 'ย่อเมนู' : 'ขยายเมนู' })));
    nav.appendChild(el('div', { class: 'rail-foot', text: 'เวอร์ชัน ' + (S.config.app.version || '') }));
  }

  /** หมวดที่เปิดได้ในกลุ่มเมนู (เรียงตามแท็บ) */
  function groupTabs(g) {
    return (g.tabs && g.tabs.length ? g.tabs : g.categories).filter(function (c) { return !!S.config.schemas[c]; });
  }
  function groupOfCat(cat) {
    return (S.config.groups || []).filter(function (g) { return groupTabs(g).indexOf(cat) !== -1; })[0] || null;
  }
  function navigate(view) {
    S.view = view;
    closeSearch();
    var shell = $('shell'); if (shell) shell.classList.remove('nav-open');
    var vcat = view.indexOf('cat:') === 0 ? view.slice(4) : null;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (n) {
      var tabs = (n.getAttribute('data-tabs') || '').split(',');
      n.classList.toggle('active', n.getAttribute('data-view') === view || (!!vcat && tabs.indexOf(vcat) !== -1));
    });
    var main = clear($('main'));
    if (!(view === 'dashboard' && S.cache['dash:' + dashYear()])) {
      main.appendChild(el('div', { class: 'page-loading' }, el('div', { class: 'loader' }), el('div', { text: 'กำลังโหลด…' })));
    }
    window.scrollTo(0, 0);
    if (view === 'dashboard') renderDashboard(main);
    else if (view.indexOf('cat:') === 0) renderList(main, view.slice(4));
    else if (view === 'users') renderUsers(main);
    else if (view === 'settings') renderSettings(main);
    else if (view === 'audit') renderAudit(main);
    else if (view === 'ai') renderAsk(main);
    else if (view === 'help') renderHelp(main);
  }

  function pageHead(title, sub, actions) {
    return el('div', { class: 'page-head' }, el('div', null, el('h2', { text: title }), sub ? el('div', { class: 'sub', text: sub }) : null),
      el('div', { class: 'spacer' }), actions || null);
  }
  function errorState(main, e, retry) {
    clear(main).appendChild(el('div', { class: 'card empty' }, el('div', { class: 'big', text: '⚠️' }),
      el('div', { text: (e && e.message) || 'โหลดข้อมูลไม่สำเร็จ' }),
      e && e.requestId && e.code === 'INTERNAL' ? el('div', { class: 'mono small', text: 'รหัสอ้างอิง ' + e.requestId }) : null,
      retry ? el('button', { class: 'btn', style: { marginTop: '12px' }, text: 'ลองใหม่', on: { click: retry } }) : null));
  }

  /* ============================== ค้นหาทั้งระบบ ============================== */

  function searchBox() {
    var input = el('input', { class: 'input', type: 'search', placeholder: 'ค้นหา รหัส ชื่อ เลขที่สัญญา โฉนด…', attrs: { 'aria-label': 'ค้นหาทั้งระบบ', autocomplete: 'off' } });
    var panel = el('div', { class: 'search-panel hidden', id: 'searchPanel', attrs: { role: 'listbox' } });
    var timer, seq = 0;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { panel.classList.add('hidden'); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        clear(panel).appendChild(el('div', { class: 'muted small', style: { padding: '10px' }, text: 'กำลังค้นหา…' }));
        panel.classList.remove('hidden');
        authed('searchAll', q).then(function (r) {
          if (my !== seq) return;
          clear(panel);
          if (!r.results.length) { panel.appendChild(el('div', { class: 'empty', style: { padding: '16px' }, text: 'ไม่พบรายการที่ตรงกับ "' + q + '"' })); return; }
          r.results.forEach(function (it) {
            panel.appendChild(el('button', { class: 'search-item', attrs: { role: 'option' }, on: { click: function () { closeSearch(); input.value = ''; openDetail(it.category, it.id); } } },
              el('span', { class: 'cat', text: it.label }), el('span', { class: 'ttl', text: it.title }), statusBadge(it.status)));
          });
          if (r.total > r.results.length) panel.appendChild(el('div', { class: 'muted small', style: { padding: '8px 10px' }, text: 'พบทั้งหมด ' + r.total + ' รายการ · แสดงสูงสุด 5 รายการต่อหมวด' }));
        }).catch(function (e) { if (my === seq) clear(panel).appendChild(el('div', { class: 'muted small', style: { padding: '10px' }, text: e.message || 'ค้นหาไม่สำเร็จ' })); });
      }, 300);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeSearch(); input.blur(); }
      if (ev.key === 'Enter') { var f = panel.querySelector('.search-item'); if (f) f.click(); }
    });
    return el('div', { class: 'search-wrap', id: 'searchWrap' }, svg(ICON.search, 16), input, panel);
  }
  function closeSearch() { var p = $('searchPanel'); if (p) p.classList.add('hidden'); }
  document.addEventListener('click', function (ev) { var w = $('searchWrap'); if (w && !w.contains(ev.target)) closeSearch(); });

  /* ============================== อัปเดตอัตโนมัติ ============================== */
  /*
   * ทุก 30 วินาที เรียก getDataVersion (เบามาก) → ถ้าเลขเวอร์ชันของหมวดที่เปิดอยู่เปลี่ยน จึงโหลดข้อมูลใหม่แบบเงียบ
   * ไม่รีเฟรชระหว่างเปิดฟอร์ม/หน้าต่าง (รอจนปิด) · หยุดเมื่อแท็บถูกซ่อน · รีเฟรชเต็มอย่างน้อยทุก 5 นาที
   */
  function startPoller() {
    stopPoller(); S.lastRefresh = Date.now(); S.versions = null; setLive('on');
    S.pollTimer = setInterval(function () { pollTick(false); }, POLL_MS);
    setTimeout(function () { pollTick(false); }, 1500); // เก็บเวอร์ชันตั้งต้นไว้เทียบรอบถัดไป
  }
  function stopPoller() { clearInterval(S.pollTimer); S.pollTimer = null; }
  function pollTick(force) {
    if (!S.token || S.polling) return;
    if (document.hidden && !force) return;
    S.polling = true; setLive('busy');
    var failed = false;
    authed('getDataVersion').then(function (v) {
      var prev = S.versions; S.versions = v.versions;
      var changed = [], cfgChanged = false, structChanged = false;
      if (prev) Object.keys(v.versions).forEach(function (k) {
        if (prev[k] === v.versions[k]) return;
        if (k === '_struct') { cfgChanged = true; structChanged = true; } // v1.14 หัวคอลัมน์ในชีตเปลี่ยน → โหลดฟอร์ม/ตารางใหม่
        else if (k === '_users' || k === '_settings') cfgChanged = true; else changed.push(k);
      });
      var stale = Date.now() - S.lastRefresh > FORCE_REFRESH_MS || structChanged;
      if (structChanged && modals.length) toast('โครงสร้างคอลัมน์ในชีตมีการเปลี่ยนแปลง — หากกำลังกรอกฟอร์ม ให้บันทึกหรือคัดลอกข้อมูลไว้ แล้วเปิดฟอร์มใหม่เพื่อใช้ช่องล่าสุด', 'warn');
      var step = cfgChanged ? reloadConfig().then(function () {
        var cat = S.view.indexOf('cat:') === 0 ? S.view.slice(4) : null;
        var adminView = { users: 'manageUsers', settings: 'manageSettings', audit: 'viewAudit' }[S.view];
        if ((cat && !S.config.schemas[cat]) || (adminView && !canG(adminView)) || (S.view === 'ai' && !S.config.aiAvailable)) { toast('สิทธิ์ของคุณมีการเปลี่ยนแปลง', 'warn'); navigate('dashboard'); }
        else if (structChanged && cat && !modals.length) navigate(S.view); // v1.16 โครงสร้างคอลัมน์เปลี่ยน → วาดหัวตารางใหม่
      }) : Promise.resolve();
      return step.then(function () { if (changed.length || stale || force) silentRefresh(changed, stale || force); });
    }).catch(function () { failed = true; setLive('off'); })
      .then(function () { S.polling = false; if (S.token && !failed) setLive('on'); });
  }
  function silentRefresh(changed, all) {
    if (!S.token || !$('main')) return;
    if (modals.length) { S.pendingRefresh = true; return; }
    var v = S.view;
    if (v === 'dashboard') renderDashboard($('main'), { silent: true });
    else if (v.indexOf('cat:') === 0 && S.reloadList) {
      var cat = v.slice(4);
      if (all || !changed || changed.indexOf(cat) !== -1 || (cat === 'debts' && changed.indexOf('payments') !== -1)) S.reloadList(true);
    }
  }
  function manualRefresh() {
    S.cache = {};
    if (['users', 'settings', 'audit', 'help'].indexOf(S.view) !== -1) { navigate(S.view); return; }
    if (S.view === 'ai') { S.aiQuota = null; navigate('ai'); return; }
    S.polling = false;
    pollTick(true);
  }
  function markRefreshed() {
    S.lastRefresh = Date.now();
    var t = document.querySelector('#live .txt');
    if (t) { var d = new Date(); t.textContent = 'อัปเดตอัตโนมัติ · ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    var td = $('todayText'); if (td) td.textContent = todayText();
  }
  function setLive(state) {
    var n = $('live'); if (!n) return;
    n.classList.toggle('off', state === 'off');
    n.classList.toggle('busy', state === 'busy');
    if (state === 'off') { var t = n.querySelector('.txt'); if (t) t.textContent = 'ออฟไลน์ · กำลังลองใหม่'; }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.token) pollTick(false); });

  /* ============================== กราฟ (SVG ไม่ใช้ไลบรารีภายนอก) ============================== */

  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (!/^on/i.test(k)) n.setAttribute(k, String(attrs[k])); });
    if (text !== undefined && text !== null) {
      if (typeof text === 'string' || typeof text === 'number') n.textContent = String(text);
      else append(n, text);
    }
    return n;
  }
  function niceStep(x) {
    if (!(x > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function fmtShort(v, unit) {
    var s = Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M'
      : Math.abs(v) >= 1e3 ? (v / 1e3).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v * 100) / 100);
    return unit === 'money' ? '฿' + s : s;
  }
  function lineChart(values, unit) {
    var W = 760, H = 270, L = 62, R = 18, T = 14, B = 30;
    var max = Math.max.apply(null, values.concat([0]));
    var step = niceStep((max || (unit === 'money' ? 1000 : 4)) / 4), top = step * 4;
    var X = function (i) { return L + i * (W - L - R) / 11; };
    var Y = function (v) { return T + (1 - v / top) * (H - T - B); };
    var base = Y(0);
    var svgEl = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'กราฟรายเดือน' });
    var defs = sv('defs');
    var grad = sv('linearGradient', { id: 'lineFill', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(sv('stop', { offset: '0%', 'stop-color': '#4CC9F0', 'stop-opacity': 0.28 }));
    grad.appendChild(sv('stop', { offset: '100%', 'stop-color': '#4CC9F0', 'stop-opacity': 0 }));
    defs.appendChild(grad); svgEl.appendChild(defs);
    for (var g = 0; g <= 4; g++) {
      var gv = step * g, gy = Y(gv);
      svgEl.appendChild(sv('line', { x1: L, x2: W - R, y1: gy, y2: gy, stroke: 'rgba(255,255,255,0.07)' }));
      svgEl.appendChild(sv('text', { x: L - 10, y: gy + 4, 'text-anchor': 'end', class: 'tick' }, fmtShort(gv, unit)));
    }
    TH_MONTHS.forEach(function (m, i) { svgEl.appendChild(sv('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, m)); });
    var pts = values.map(function (v, i) { return [X(i), Y(v)]; });
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = Math.min(p1[1] + (p2[1] - p0[1]) / 6, base);
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = Math.min(p2[1] - (p3[1] - p1[1]) / 6, base);
      d += ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + p2[0] + ' ' + p2[1];
    }
    svgEl.appendChild(sv('path', { d: d + ' L' + pts[pts.length - 1][0] + ' ' + base + ' L' + pts[0][0] + ' ' + base + ' Z', fill: 'url(#lineFill)' }));
    svgEl.appendChild(sv('path', { d: d, fill: 'none', stroke: '#4CC9F0', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    pts.forEach(function (p, i) {
      var c = sv('circle', { cx: p[0], cy: p[1], r: 4, fill: '#0A0A0F', stroke: '#4CC9F0', 'stroke-width': 2 });
      c.appendChild(sv('title', {}, TH_MONTHS[i] + ': ' + (unit === 'money' ? fmtMoney(values[i]) : fmtNum(values[i]) + ' รายการ')));
      svgEl.appendChild(c);
    });
    return el('div', { class: 'chart-box' }, svgEl);
  }
  function donutChart(items) {
    var list = items.slice(0, 7);
    if (items.length > 7) list.push({ label: 'อื่น ๆ', value: items.slice(7).reduce(function (a, x) { return a + x.value; }, 0) });
    var total = list.reduce(function (a, x) { return a + x.value; }, 0);
    var size = 240, cx = 120, r = 84, sw = 34, C = 2 * Math.PI * r, off = 0;
    var svgEl = sv('svg', { viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': 'สัดส่วน ' + list.map(function (x) { return x.label + ' ' + x.value; }).join(', ') });
    svgEl.appendChild(sv('circle', { cx: cx, cy: cx, r: r, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': sw }));
    list.forEach(function (x, i) {
      if (!total || !x.value) return;
      var len = x.value / total * C, gap = list.length > 1 ? 2 : 0;
      var seg = sv('circle', { cx: cx, cy: cx, r: r, fill: 'none', stroke: CHART_COLORS[i % CHART_COLORS.length], 'stroke-width': sw,
        'stroke-dasharray': Math.max(len - gap, 0.5) + ' ' + C, 'stroke-dashoffset': -off, transform: 'rotate(-90 ' + cx + ' ' + cx + ')' });
      seg.appendChild(sv('title', {}, x.label + ': ' + fmtNum(x.value) + ' (' + Math.round(x.value / total * 100) + '%)'));
      svgEl.appendChild(seg);
      off += len;
    });
    svgEl.appendChild(sv('text', { x: cx, y: cx + 4, 'text-anchor': 'middle', fill: '#ECECF4', 'font-size': 30, 'font-weight': 700, 'font-family': 'Sarabun, sans-serif' }, fmtNum(total)));
    svgEl.appendChild(sv('text', { x: cx, y: cx + 26, 'text-anchor': 'middle', fill: '#8A8AA0', 'font-size': 12, 'font-family': 'Sarabun, sans-serif' }, 'รายการ'));
    return el('div', { class: 'donut-wrap' }, svgEl,
      el('div', { class: 'legend' }, list.map(function (x, i) { return el('span', null, el('i', { style: { background: CHART_COLORS[i % CHART_COLORS.length] } }), x.label + ' (' + fmtNum(x.value) + ')'); })));
  }

  /* ============================== Dashboard ============================== */

  var dashSeq = 0;
  function dashYear() { return S.dashYear || String(new Date().getFullYear()); }
  function sigOf(d, volatile) { var c = Object.assign({}, d); volatile.forEach(function (k) { c[k] = 0; }); return JSON.stringify(c); }

  /** แสดงข้อมูลล่าสุดที่มีทันที แล้วดึงข้อมูลใหม่เบื้องหลัง (วาดใหม่เฉพาะเมื่อข้อมูลเปลี่ยนจริง) */
  function renderDashboard(main, opts) {
    var silent = !!(opts && opts.silent), year = dashYear(), key = 'dash:' + year, seq = ++dashSeq;
    var cached = S.cache[key];
    if (cached && !silent) drawDashboard(main, cached.data);
    authed('getDashboardData', { year: year }).then(function (d) {
      if (seq !== dashSeq || S.view !== 'dashboard') return;
      var sig = sigOf(d, ['generatedAt', 'dataAsOf']);
      var showing = main.querySelector('.stats, .kpis, .empty');
      if (cached && cached.sig === sig && showing) {
        var a = $('dashAsOf'); if (a) a.textContent = asOfText(d);
        markRefreshed(); return;
      }
      cacheSet(key, { data: d, sig: sig });
      var y = window.scrollY;
      drawDashboard(main, d);
      if (silent) window.scrollTo(0, y);
      markRefreshed();
    }).catch(function (e) {
      if (seq !== dashSeq) return;
      if (main.querySelector('.stats, .kpis')) { if (!silent) showError(e); return; }
      errorState(main, e, function () { navigate('dashboard'); });
    });
  }
  function asOfText(d) { return 'ข้อมูล ณ ' + fmtTs(d.dataAsOf) + ' · แสดงปี พ.ศ. ' + (Number(d.year) + 543) + ' · เฉพาะหมวดที่คุณมีสิทธิ์'; }

  function drawDashboard(main, d) {
    clear(main);
    var nowY = new Date().getFullYear();
    var yearSel = el('select', { class: 'input', style: { width: 'auto', minHeight: '36px' }, attrs: { 'aria-label': 'เลือกปี' } },
      [0, 1, 2, 3].map(function (k) { var y = String(nowY - k); return el('option', { value: y, text: 'ปี ' + (nowY - k + 543), selected: y === String(d.year) }); }));
    yearSel.addEventListener('change', function () { S.dashYear = yearSel.value; renderDashboard(main); });
    var head = pageHead('ภาพรวม', null, yearSel);
    head.querySelector('div').appendChild(el('div', { class: 'sub', id: 'dashAsOf', text: asOfText(d) }));
    main.appendChild(head);
    if (!d.cards.length) { main.appendChild(el('div', { class: 'card empty' }, el('div', { class: 'big', text: '🔒' }), 'บัญชีของคุณยังไม่ได้รับสิทธิ์หมวดข้อมูลใด กรุณาติดต่อผู้ดูแล', S.profile && S.profile.permIssue ? el('div', { class: 'muted small', style: { marginTop: '8px' }, text: 'สาเหตุ: ' + S.profile.permIssue + ' · ผู้ดูแลแก้ที่ ผู้ใช้งานและสิทธิ์ → กดชื่อผู้ใช้ → เลือกหมวด → บันทึก แล้วกด F5' }) : null)); return; }

    var sum = function (k) { return d.cards.reduce(function (a, c) { return a + (c[k] || 0); }, 0); };
    var total = sum('total');
    var closed = d.cards.reduce(function (a, c) { return a + S.config.statusClosed.reduce(function (b, s) { return b + (c.byStatus[s] || 0); }, 0); }, 0);
    var hero;
    if (d.trend && d.trend.unit === 'money') {
      var yearSum = d.trend.values.reduce(function (a, v) { return a + v; }, 0);
      var thisMonth = String(d.year) === String(nowY) ? d.trend.values[new Date().getMonth()] : null;
      hero = el('div', { class: 'card stat hero' }, el('div', { class: 'label', text: 'รับชำระปี ' + (Number(d.year) + 543) }),
        el('div', { class: 'value', text: fmtMoney(yearSum) }),
        el('div', { class: 'note', text: thisMonth !== null ? 'เดือนนี้ ' + fmtMoney(thisMonth) : 'รวมทั้งปี' }));
    } else {
      var pct = total ? Math.round(closed / total * 100) : 0;
      hero = el('div', { class: 'card stat hero' }, el('div', { class: 'label', text: 'รายการทั้งหมด' }),
        el('div', { class: 'value', text: fmtNum(total) }),
        el('div', { class: 'bar' }, el('span', { style: { width: pct + '%' } })),
        el('div', { class: 'note', style: { marginTop: '6px' }, text: 'ปิดงานแล้ว ' + pct + '% · ' + d.cards.length + ' หมวดที่เข้าถึงได้' }));
    }
    var toUpcoming = function () { var u = $('upcomingCard'); if (u) u.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    main.appendChild(el('div', { class: 'stats' }, hero,
      el('div', { class: 'card stat red', style: { cursor: 'pointer' }, on: { click: toUpcoming } }, el('div', { class: 'label', text: 'เกินกำหนด' }),
        el('div', { class: 'value', text: fmtNum(sum('overdue')) }), el('div', { class: 'note', text: 'ต้องติดตามด่วน' })),
      el('div', { class: 'card stat orange', style: { cursor: 'pointer' }, on: { click: toUpcoming } }, el('div', { class: 'label', text: 'ใกล้ครบกำหนด' }),
        el('div', { class: 'value', text: fmtNum(sum('dueSoon')) }), el('div', { class: 'note', text: 'ภายใน ' + (S.config.settings.DUE_SOON_DAYS || 7) + ' วัน' })),
      el('div', { class: 'card stat green' }, el('div', { class: 'label', text: 'ใหม่เดือนนี้' }),
        el('div', { class: 'value', text: fmtNum(sum('newThisMonth')) }), el('div', { class: 'note', text: 'รายการที่สร้างในเดือนปัจจุบัน' }))));

    if (d.meetings) main.appendChild(meetingDashCard(d.meetings));

    if (d.trend && d.trend.values && d.mix && d.mix.items) {
      main.appendChild(el('div', { class: 'charts section' },
        el('div', { class: 'card card-pad' }, el('h3', null, d.trend.title, el('span', { class: 'sub', text: 'ปี ' + (Number(d.year) + 543) + ' · ' + (d.trend.unit === 'money' ? 'บาท' : 'รายการ') })),
          lineChart(d.trend.values, d.trend.unit)),
        el('div', { class: 'card card-pad' }, el('h3', { text: d.mix.title }),
          d.mix.items.length ? donutChart(d.mix.items) : el('div', { class: 'empty', text: 'ยังไม่มีข้อมูล' }))));
    }

    main.appendChild(el('div', { class: 'kpis section' }, d.cards.map(function (c) {
      return el('button', { class: 'card kpi', on: { click: function () { navigate('cat:' + c.category); } } },
        el('div', { class: 'label', text: c.label }), el('div', { class: 'value', text: fmtNum(c.total) }),
        el('div', { class: 'flags' },
          c.overdue ? el('span', { class: 'badge b-overdue', text: 'เกินกำหนด ' + c.overdue }) : null,
          c.dueSoon ? el('span', { class: 'badge b-soon', text: 'ใกล้ครบ ' + c.dueSoon }) : null,
          c.newThisMonth ? el('span', { class: 'badge b-progress', text: 'ใหม่เดือนนี้ ' + c.newThisMonth }) : null,
          !c.overdue && !c.dueSoon && !c.newThisMonth ? el('span', { class: 'muted small', text: 'ไม่มีรายการเร่งด่วน' }) : null));
    })));

    var statuses = {};
    d.cards.forEach(function (c) { Object.keys(c.byStatus).forEach(function (s) { statuses[s] = true; }); });
    var bars = el('div', { class: 'card card-pad bars' }, el('h3', { text: 'สถานะงานแต่ละหมวด' }),
      d.cards.map(function (c) {
        var track = el('div', { class: 'bar-track', attrs: { role: 'img', 'aria-label': c.label + ' ' + Object.keys(c.byStatus).map(function (s) { return s + ' ' + c.byStatus[s]; }).join(', ') } });
        Object.keys(c.byStatus).forEach(function (s) {
          if (!c.byStatus[s] || !c.total) return;
          track.appendChild(el('div', { class: 'bar-seg', attrs: { title: s + ': ' + c.byStatus[s] }, style: { width: (c.byStatus[s] / c.total * 100) + '%', background: STATUS_COLOR[s] || '#999' } }));
        });
        return el('div', { class: 'bar-row' }, el('span', { text: c.label }), track, el('span', { class: 'muted', style: { textAlign: 'right' }, text: c.total }));
      }),
      el('div', { class: 'legend' }, Object.keys(statuses).map(function (s) { return el('span', null, el('i', { style: { background: STATUS_COLOR[s] || '#999' } }), s); })));

    var fin = el('div', { class: 'card card-pad' }, el('h3', { text: 'ภาพรวมการเงิน' }));
    if (d.finance && d.finance.items.length) {
      fin.appendChild(el('div', { class: 'fin-list' }, d.finance.items.map(function (x) {
        return el('div', { class: 'fin-row' }, el('span', { text: x.label }), el('span', { class: 'amt', text: fmtMoney(x.value) }));
      })));
      if (d.finance.topRepairs.length) {
        fin.appendChild(el('div', { class: 'muted small', style: { marginTop: '12px', fontWeight: 600 }, text: 'งานซ่อมที่มีค่าใช้จ่ายสูง' }));
        fin.appendChild(el('div', { class: 'fin-list' }, d.finance.topRepairs.map(function (x) {
          return el('div', { class: 'fin-row', style: { cursor: 'pointer' }, on: { click: function () { openDetail('repairs', x.id); } } },
            el('span', null, x.code + ' ', statusBadge(x.status)), el('span', { class: 'amt', text: fmtMoney(x.amount) }));
        })));
      }
    } else {
      fin.appendChild(el('div', { class: 'notice', text: d.finance ? 'ยังไม่มีข้อมูลการเงินในหมวดที่คุณเข้าถึงได้' : 'บัญชีของคุณไม่มีสิทธิ์ดูข้อมูลการเงิน' }));
    }

    var up = el('div', { class: 'card card-pad', id: 'upcomingCard' },
      el('h3', null, 'ใกล้ครบกำหนด / เกินกำหนด', el('span', { class: 'sub', text: d.upcomingTotal > d.upcoming.length ? 'แสดง ' + d.upcoming.length + ' จาก ' + d.upcomingTotal : d.upcoming.length + ' รายการ' })));
    if (!d.upcoming.length) up.appendChild(el('div', { class: 'empty' }, el('div', { class: 'big', text: '✅' }), 'ไม่มีรายการเกินกำหนดหรือใกล้ครบกำหนด'));
    else {
      up.appendChild(el('div', { class: 'list-rows scroll-y' }, d.upcoming.map(function (i) {
        return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: function () { openDetail(i.category, i.id); }, keydown: function (ev) { if (ev.key === 'Enter') openDetail(i.category, i.id); } } },
          el('div', { class: 'main-t' }, el('div', { class: 't1', text: i.title }),
            el('div', { class: 't2', text: i.label + ' · กำหนด ' + fmtDate(i.nextDue) + (i.overdue ? (i.daysLeft !== null ? ' · เกินมา ' + Math.abs(i.daysLeft) + ' วัน' : '') : ' · อีก ' + i.daysLeft + ' วัน') })),
          i.overdue ? el('span', { class: 'badge b-overdue', text: 'เกินกำหนด' }) : el('span', { class: 'badge b-soon', text: 'ใกล้ครบ ≤' + (S.config.settings.DUE_SOON_DAYS || 7) + ' วัน' }));
      })));
    }
    main.appendChild(el('div', { class: 'grid-2 section' }, up, el('div', null, fin, el('div', { class: 'section' }, bars))));
    if (d.aiAvailable) main.appendChild(aiPanel());
  }

  function aiPanel() {
    var out = el('div');
    var btn = el('button', { class: 'btn btn-gold', text: 'สร้างสรุปด้วย AI' });
    btn.addEventListener('click', function () {
      busy(btn, function () {
        return authed('generateAISummary', newRid()).then(function (r) {
          clear(out);
          if (r.quota) S.aiQuota = r.quota;
          out.appendChild(el('div', { class: 'notice', style: { margin: '12px 0' } },
            'ข้อเท็จจริงจากระบบ (ณ ' + fmtDate(r.facts.referenceDate) + '): ',
            r.facts.categories.map(function (c) { return c.category + ' ' + c.total + ' รายการ (เกินกำหนด ' + c.overdue + ')'; }).join(' · ')));
          out.appendChild(el('div', { class: 'ai-text pre', text: r.aiText }));
          out.appendChild(el('p', { class: 'muted small', text: r.disclaimer + ' · โมเดล ' + r.model + ' · สร้างเมื่อ ' + fmtTs(r.generatedAt) +
            (r.fromCache ? ' (ผลเดิม ข้อมูลไม่เปลี่ยน ไม่เสียโควตา)' : '') + (r.quota ? ' · วันนี้คุณใช้ AI ' + r.quota.usedMe + '/' + r.quota.limitMe + ' ครั้ง' : '') }));
        }).catch(showError);
      });
    });
    var q = el('input', { class: 'input', placeholder: 'ถามเรื่องข้อมูลได้เลย เช่น "เดือนนี้มีหนี้ค้างกี่ราย"', maxLength: 300, attrs: { 'aria-label': 'ถาม AI' } });
    var go = function () { var v = q.value.trim(); if (v.length < 2) { q.focus(); return; } S.aiPending = v; navigate('ai'); };
    q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    return el('div', { class: 'card card-pad section ai-box' }, el('div', { class: 'row' },
      el('div', null, el('h3', { style: { margin: 0 }, text: 'AI ผู้ช่วย' }),
        el('div', { class: 'muted small', text: 'ส่งเฉพาะตัวเลขรวม/คำถาม ไม่ส่งชื่อบุคคลหรือเอกสาร · ใช้ประกอบการตัดสินใจเท่านั้น' })),
      el('div', { class: 'spacer' }), btn),
      el('div', { class: 'row', style: { marginTop: '12px' } }, el('div', { style: { flex: '1 1 260px' } }, q),
        el('button', { class: 'btn btn-primary', on: { click: go } }, svg(ICON.ai, 16), 'ถาม AI')), out);
  }

  /* ============================== ถาม AI ============================== */

  var AI_EXAMPLES = [
    { q: 'เดือนนี้มีหนี้ค้างกี่ราย', cat: 'debts' }, { q: 'สรุปงานซ่อมที่ค้างอยู่', cat: 'repairs' },
    { q: 'ที่ดินที่เกินกำหนดมีแปลงไหนบ้าง', cat: 'land' }, { q: 'เดือนนี้เพิ่มทรัพย์สินใหม่กี่รายการ', cat: 'assets' },
    { q: 'คดีที่มีนัดศาลเดือนหน้า', cat: 'legal' }, { q: 'ยอดรับชำระเดือนนี้รวมเท่าไร', cat: 'payments' },
    { q: 'งานติดตามที่ใกล้ครบกำหนด', cat: 'tasks' }, { q: 'รายการขายที่กำลังเจรจาอยู่', cat: 'sales' }
  ];

  function renderAsk(main) {
    clear(main);
    if (!S.config.aiAvailable) { errorState(main, { message: 'AI ยังไม่พร้อมใช้งาน หรือบัญชีของคุณไม่มีสิทธิ์ใช้ AI' }); return; }
    main.appendChild(pageHead('ถาม AI', 'พิมพ์คำถามภาษาธรรมดา — AI แปลคำถามเป็นเงื่อนไข แล้วระบบดึงตัวเลขจริงตามสิทธิ์ของคุณ'));
    var input = el('textarea', { class: 'input ask-input', rows: 2, maxLength: 300, placeholder: 'เช่น เดือนนี้มีหนี้ค้างกี่ราย · สรุปงานซ่อมที่ค้างอยู่ · ที่ดินจังหวัดชลบุรีมีกี่แปลง', attrs: { 'aria-label': 'คำถาม' } });
    var counter = el('span', { class: 'muted small', text: '0/300' });
    var askBtn = el('button', { class: 'btn btn-primary' }, svg(ICON.ai, 16), 'ถาม AI');
    var plainBtn = el('button', { class: 'btn', attrs: { title: 'ค้นหาตามคำที่พิมพ์ ไม่ใช้ AI และไม่นับโควตา' } }, svg(ICON.search, 16), 'ค้นหาแบบธรรมดา');
    var quota = el('div', { class: 'quota' });
    var chips = el('div', { class: 'ask-chips' });
    var answers = el('div', { class: 'answers' });
    main.appendChild(el('div', { class: 'card card-pad ask-card' },
      input,
      el('div', { class: 'row', style: { marginTop: '10px' } }, counter, quota, el('div', { class: 'spacer' }), plainBtn, askBtn),
      chips,
      el('div', { class: 'muted small ask-note' }, svg(ICON.lock, 13),
        ' AI ไม่เห็นข้อมูลจริง — ส่งไปเพียงคำถามและชื่อช่องข้อมูลที่คุณมีสิทธิ์ · เลขบัตร/เบอร์โทร/อีเมลในคำถามถูกซ่อนให้อัตโนมัติ · ไม่ควรพิมพ์ชื่อ-นามสกุลบุคคลในคำถาม')));
    main.appendChild(answers);

    function drawQuota(q) {
      clear(quota);
      if (!q) return;
      var left = Math.max(q.limitMe - q.usedMe, 0);
      var pct = Math.min(q.usedMe / Math.max(q.limitMe, 1) * 100, 100);
      quota.appendChild(el('span', { class: 'q-text ' + (left === 0 ? 'q-out' : left <= 2 ? 'q-low' : ''), text: 'โควตาวันนี้: ใช้ ' + q.usedMe + '/' + q.limitMe + ' คำถาม' }));
      quota.appendChild(el('span', { class: 'q-bar' }, el('i', { style: { width: pct + '%' } })));
      askBtn.disabled = left === 0;
      askBtn.title = left === 0 ? 'ครบโควตาวันนี้แล้ว — ใช้ "ค้นหาแบบธรรมดา" ได้' : '';
    }
    function drawChips(cats) {
      clear(chips);
      var mine = AI_EXAMPLES.filter(function (x) { return !cats || cats.indexOf(x.cat) !== -1; }).slice(0, 6);
      mine.forEach(function (x) { chips.appendChild(el('button', { class: 'chip chip-btn', text: x.q, on: { click: function () { input.value = x.q; input.dispatchEvent(new Event('input')); ask(); } } })); });
    }
    input.addEventListener('input', function () { counter.textContent = input.value.length + '/300'; });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ask(); } });
    askBtn.addEventListener('click', ask);
    plainBtn.addEventListener('click', plain);

    function ask() {
      var q = input.value.trim();
      if (q.length < 2) { input.classList.add('invalid'); input.focus(); return; }
      input.classList.remove('invalid');
      var waitTxt = el('span', { text: ' กำลังแปลคำถามและค้นข้อมูล…' });
      var holder = el('div', { class: 'card answer' }, qBubble(q), el('div', { class: 'card-pad ans-loading' }, el('span', { class: 'loader sm' }), waitTxt));
      answers.insertBefore(holder, answers.firstChild);
      var t0 = Date.now();
      var tick = setInterval(function () { // บอกเวลาที่รอ ไม่ให้ดูเหมือนค้าง
        var sec = Math.round((Date.now() - t0) / 1000);
        waitTxt.textContent = ' กำลังแปลคำถามและค้นข้อมูล… ' + sec + ' วินาที' + (sec >= 15 ? ' (AI ตอบช้ากว่าปกติ ระบบจะหยุดรอเองภายใน 1 นาที)' : '');
      }, 1000);
      busy(askBtn, function () {
        return authed('askAI', q, newRid()).finally(function () { clearInterval(tick); }).then(function (r) {
          S.aiQuota = r.quota; drawQuota(r.quota);
          S.aiHistory.unshift({ q: q, r: r }); S.aiHistory = S.aiHistory.slice(0, 10);
          holder.replaceWith(answerCard(q, r));
          input.value = ''; counter.textContent = '0/300';
        }).catch(function (e) {
          holder.replaceWith(el('div', { class: 'card answer' }, qBubble(q), el('div', { class: 'card-pad' },
            el('div', { class: e.code === 'QUOTA' || e.code === 'AI_SLOW' ? 'notice gold' : 'errors', text: e.code === 'TIMEOUT' ? 'AI ไม่ตอบภายใน 1 นาที กรุณาลองใหม่อีกครั้ง หรือกด "ค้นหาแบบธรรมดาแทน"' : (e.message || 'ถามไม่สำเร็จ') }),
            el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'btn btn-sm', text: 'ค้นหาแบบธรรมดาแทน', on: { click: function () { input.value = q; plain(); } } })))));
          if (e.code === 'QUOTA') return authed('getAIStatus').then(function (st) { S.aiQuota = st.quota; }).catch(function () {});
        });
      }).then(function () { if (S.aiQuota) drawQuota(S.aiQuota); }); // หลังปุ่มคืนสภาพ จึงปิดปุ่มถ้าครบโควตา
    }
    function plain() {
      var q = input.value.trim();
      if (q.length < 2) { input.classList.add('invalid'); input.focus(); return; }
      busy(plainBtn, function () {
        return authed('searchAll', q).then(function (r) {
          var body = el('div', { class: 'card-pad' },
            el('div', { class: 'ans-head' }, el('span', { class: 'badge b-cancel', text: 'ค้นหาแบบธรรมดา · ไม่ใช้ AI' })),
            el('div', { class: 'ans-big', text: r.total ? 'พบ ' + fmtNum(r.total) + ' รายการที่มีคำว่า "' + q + '"' : 'ไม่พบรายการที่มีคำว่า "' + q + '"' }),
            r.results.length ? el('div', { class: 'list-rows' }, r.results.map(function (it) {
              return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: function () { openDetail(it.category, it.id); } } },
                el('div', { class: 'main-t' }, el('div', { class: 't1', text: it.title }), el('div', { class: 't2', text: it.label })), statusBadge(it.status));
            })) : null,
            r.total > r.results.length ? el('div', { class: 'muted small', text: 'แสดงสูงสุด 5 รายการต่อหมวด' }) : null);
          answers.insertBefore(el('div', { class: 'card answer' }, qBubble(q), body), answers.firstChild);
        }).catch(showError);
      });
    }

    S.aiHistory.forEach(function (h) { answers.appendChild(answerCard(h.q, h.r)); });
    if (S.aiQuota) drawQuota(S.aiQuota);
    drawChips(null);
    authed('getAIStatus').then(function (st) {
      S.aiQuota = st.quota; drawQuota(st.quota);
      drawChips(st.categories.map(function (c) { return c.key; }));
      if (!st.available) answers.insertBefore(el('div', { class: 'notice gold', text: st.reason }), answers.firstChild);
    }).catch(function () { /* ใช้ค่าเดิม */ });
    if (S.aiPending) { input.value = S.aiPending; S.aiPending = null; counter.textContent = input.value.length + '/300'; ask(); }
    else input.focus();
  }

  function qBubble(q) { return el('div', { class: 'q-bubble' }, el('span', { class: 'q-who', text: 'คุณถาม' }), el('span', { text: q })); }

  function answerCard(q, r) {
    var body = el('div', { class: 'card-pad stack' });
    if (r.local && r.results && r.results.length) body.appendChild(el('div', { class: 'muted small', text: '⚡ ตอบจากระบบโดยตรง (คำถามรูปแบบง่าย) — เร็วและไม่นับโควตา AI' }));
    if (!r.understood || !r.results.length) {
      body.appendChild(el('div', { class: 'notice gold', text: r.reply || 'ยังตอบคำถามนี้ไม่ได้' }));
    }
    r.results.forEach(function (x) {
      var block = el('div', { class: 'ans-block' });
      block.appendChild(el('div', { class: 'ans-head' }, el('span', { class: 'badge b-progress', text: x.label }),
        x.conditions.length ? x.conditions.map(function (c) { return el('span', { class: 'cond', text: c }); }) : el('span', { class: 'cond', text: 'ทุกรายการ' })));
      block.appendChild(el('div', { class: 'ans-big', text: x.answer }));
      if (x.groups && x.groups.length) {
        var max = Math.max.apply(null, x.groups.map(function (g) { return g.count; }));
        block.appendChild(el('div', { class: 'g-bars' }, x.groups.map(function (g, i) {
          return el('div', { class: 'g-row' }, el('span', { class: 'g-lbl', text: g.label }),
            el('span', { class: 'g-track' }, el('i', { style: { width: (g.count / max * 100) + '%', background: STATUS_COLOR[g.label] || CHART_COLORS[i % CHART_COLORS.length] } })),
            el('span', { class: 'g-n', text: fmtNum(g.count) }));
        })));
      }
      if (x.rows && x.rows.length) {
        block.appendChild(el('div', { class: 'list-rows ans-rows' }, x.rows.map(function (row) {
          var extra = (row.extra || []).filter(function (e) { return e.value !== '' && e.value !== null; }).map(function (e) {
            var v = e.type === 'money' ? fmtMoney(e.value) : (e.type === 'date' ? fmtDate(e.value) : (e.type === 'number' ? fmtNum(e.value) : String(e.value)));
            return e.label + ': ' + v;
          });
          return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: function () { openDetail(x.category, row.id); }, keydown: function (ev) { if (ev.key === 'Enter') openDetail(x.category, row.id); } } },
            el('div', { class: 'main-t' }, el('div', { class: 't1', text: row.title || row.code }),
              el('div', { class: 't2', text: (String(row.title || '').indexOf(row.code) === -1 ? [row.code] : []).concat(extra).join(' · ') || x.label })),
            dueBadge(row.due), statusBadge(row.status));
        })));
      }
      body.appendChild(block);
    });
    if (r.notes && r.notes.length) body.appendChild(el('div', { class: 'ans-notes' }, r.notes.map(function (n) { return el('div', { text: '• ' + n }); })));
    body.appendChild(el('div', { class: 'muted small' }, 'AI ตีความคำถาม' + (r.title ? ' (' + r.title + ')' : '') + ' · ตัวเลขทั้งหมดมาจากระบบจริง ณ ' + fmtTs(r.generatedAt) +
      (r.fromCache ? ' · ใช้การตีความเดิม ไม่เสียโควตา' : '') + (r.masked ? ' · ซ่อนข้อมูลส่วนบุคคล ' + r.masked + ' ค่าก่อนส่ง AI' : '') +
      ' · ตรวจสอบเงื่อนไขด้านบนว่าตรงกับที่ต้องการ'));
    return el('div', { class: 'card answer fade-in' }, qBubble(q), body);
  }

  /* ============================== รายการข้อมูล ============================== */

  function listState(cat) {
    if (!S.list[cat]) S.list[cat] = { page: 1, search: '', status: '', due: '', sortBy: 'updatedAt', sortDir: 'desc', includeDeleted: false, year: '' };
    return S.list[cat];
  }

  function renderList(main, cat) {
    var schema = S.config.schemas[cat];
    if (!schema) { errorState(main, { message: 'ไม่มีสิทธิ์เข้าถึงหมวดนี้' }); return; }
    var st = listState(cat);
    var fieldsByKey = {};
    schema.fields.forEach(function (f) { fieldsByKey[f.k] = f; });
    var cols = listColKeys(cat, schema, fieldsByKey).map(function (k) { return fieldsByKey[k]; });
    var hasDue = schema.fields.some(function (f) { return f.due; });

    clear(main);
    var yearSheetBtn = cat === 'contracts' && canG('backup') ? el('button', { class: 'btn', attrs: { title: 'สร้างหรืออัปเดตแท็บสรุปสัญญาและการขายตามปี พ.ศ. ในไฟล์ชีตหลัก (ไม่สร้างซ้ำ)' }, on: { click: openYearSheet } }, svg(ICON.audit, 18), 'ชีตสรุปรายปี') : null;
    main.appendChild(pageHead(schema.label, null, yearSheetBtn && !can(cat, 'create') ? yearSheetBtn : can(cat, 'create') ? el('div', { class: 'row' }, yearSheetBtn,
      el('button', { class: 'btn', attrs: { title: 'นำเข้าหลายแถวจากไฟล์ Excel/CSV หรือคัดลอกจาก Google Sheets' }, on: { click: function () { openImport(cat); } } }, svg(ICON.payments, 18), 'วางจากชีต / ไฟล์'),
      el('button', { class: 'btn btn-primary', on: { click: function () { openForm(cat, 'create', null); } } }, svg(ICON.plus, 18), 'เพิ่มรายการ')) : null));

    // v1.9 แท็บหมวดย่อยในเมนูเดียวกัน (เช่น ทรัพย์สิน | ที่ดิน · ลูกค้า | หนี้ | รับชำระ)
    var grp = groupOfCat(cat), gtabs = grp ? groupTabs(grp) : [];
    if (gtabs.length > 1) {
      main.appendChild(el('div', { class: 'tabs cat-tabs', attrs: { role: 'tablist', 'aria-label': grp.label } }, gtabs.map(function (c) {
        return el('button', { class: 'tab' + (c === cat ? ' active' : ''), attrs: { role: 'tab', 'aria-selected': c === cat ? 'true' : 'false', 'data-cat': c },
          on: { click: function () { if (c !== cat) navigate('cat:' + c); } } }, svg(ICON[c] || ICON.dashboard, 16), ' ' + S.config.schemas[c].label);
      })));
    }
    if (cat === 'meetings') main.appendChild(meetingBanner());
    if (cat === 'customers' && (S.config.schemas.debts || S.config.schemas.payments)) {
      main.appendChild(el('div', { class: 'row section' }, el('span', { class: 'muted small', text: 'เปิดรายชื่อลูกค้าเพื่อดูหนี้ สัญญา และการรับชำระครบในหน้าเดียว · หรือดูรวมทั้งหมดที่แท็บด้านบน' })));
    }
    var search = el('input', { class: 'input search', type: 'search', placeholder: 'ค้นหา (รหัส ชื่อ ที่ตั้ง ฯลฯ)', value: st.search, attrs: { 'aria-label': 'ค้นหา' } });
    var status = el('select', { class: 'input', attrs: { 'aria-label': 'กรองสถานะ' } }, el('option', { value: '', text: 'ทุกสถานะ' }),
      schema.statuses.map(function (s) { return el('option', { value: s, text: s, selected: st.status === s }); }));
    var due = hasDue ? el('select', { class: 'input', attrs: { 'aria-label': 'กรองกำหนดเวลา' } },
      el('option', { value: '', text: 'ทุกกำหนดเวลา' }), el('option', { value: 'overdue', text: 'เกินกำหนด', selected: st.due === 'overdue' }),
      el('option', { value: 'soon', text: 'ใกล้ครบกำหนด', selected: st.due === 'soon' })) : null;
    var delChk = canG('restore') ? el('input', { type: 'checkbox', checked: st.includeDeleted }) : null;
    var yearSel = null;
    if (fieldsByKey.contractYear) {
      var nb = new Date().getFullYear() + 543;
      yearSel = el('select', { class: 'input', attrs: { 'aria-label': 'ปีสัญญา พ.ศ.' } }, el('option', { value: '', text: 'ทุกปี (พ.ศ.)' }));
      for (var yy = nb + 3; yy >= nb - 10; yy--) yearSel.appendChild(el('option', { value: String(yy), text: 'ปี ' + yy, selected: st.year === String(yy) }));
      yearSel.addEventListener('change', function () { st.year = yearSel.value; st.page = 1; load(); });
    }
    var tableBox = el('div');
    var card = el('div', { class: 'card' }, el('div', { class: 'toolbar' }, search, yearSel, status, due,
      delChk ? el('label', { class: 'check small' }, delChk, 'แสดงรายการที่ถูกลบ') : null,
      el('button', { class: 'btn btn-sm', on: { click: load } }, svg(ICON.refresh, 16), 'รีเฟรช'),
      el('button', { class: 'btn btn-sm', attrs: { title: 'เลือกคอลัมน์ที่แสดงในตาราง', 'data-act': 'cols' }, on: { click: function () { openColumnChooser(cat); } } }, 'คอลัมน์'),
      S.config.canManageFields && cat !== 'meetings' ? el('button', { class: 'btn btn-sm', attrs: { title: 'เพิ่ม/แก้ไข/ซ่อน ช่องข้อมูลเพิ่มเติมของหมวดนี้', 'data-act': 'fields' }, on: { click: function () { openFieldManager(cat); } } }, 'ช่องข้อมูล') : null,
      S.config.canManageFields ? el('button', { class: 'btn btn-sm', attrs: { title: 'เพิ่ม/ลบ/เปลี่ยนชื่อคอลัมน์ของหมวดนี้', 'data-act': 'columns' }, on: { click: function () { openColumnManager(cat); } } }, 'จัดการคอลัมน์') : null), tableBox);
    main.appendChild(card);

    var timer;
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { st.search = search.value.trim(); st.page = 1; load(); }, 350); });
    status.addEventListener('change', function () { st.status = status.value; st.page = 1; load(); });
    if (due) due.addEventListener('change', function () { st.due = due.value; st.page = 1; load(); });
    if (delChk) delChk.addEventListener('change', function () { st.includeDeleted = delChk.checked; st.page = 1; load(); });

    var listSeq = 0;
    /** แสดงผลล่าสุดที่จำไว้ทันที (ถ้ามี) แล้วดึงข้อมูลสดเบื้องหลัง · silent = อัปเดตอัตโนมัติ ไม่แสดงตัวโหลด */
    function load(silent) {
      var q = { page: st.page, search: st.search, status: st.status, due: st.due, sortBy: st.sortBy, sortDir: st.sortDir, includeDeleted: st.includeDeleted };
      if (st.year && fieldsByKey.contractYear) q.filters = { contractYear: st.year };
      var key = 'list:' + cat + ':' + JSON.stringify(q), cached = S.cache[key], my = ++listSeq;
      var hasTable = function () { return !!tableBox.querySelector('table, .empty'); };
      if (cached && !silent) drawTable(cached.data);
      else if (!silent || !hasTable()) clear(tableBox).appendChild(el('div', { class: 'card-pad stack' }, [1, 2, 3, 4].map(function () { return el('div', { class: 'skeleton' }); })));
      authed('getRecords', cat, q)
        .then(function (r) {
          if (my !== listSeq || S.view !== 'cat:' + cat) return;
          var sig = sigOf(r, ['loadedAt', 'serverTime']);
          var shown = S.cache[key];
          if (shown && shown.sig === sig && hasTable() && (cached || silent)) { markRefreshed(); return; }
          cacheSet(key, { data: r, sig: sig });
          drawTable(r);
          markRefreshed();
        })
        .catch(function (e) {
          if (my !== listSeq) return;
          if (hasTable() && (silent || cached)) { if (!silent) showError(e); return; }
          clear(tableBox).appendChild(el('div', { class: 'empty', text: e.message || 'โหลดข้อมูลไม่สำเร็จ' })); showError(e);
        });
    }
    function sortBtn(k, label) {
      var arrow = st.sortBy === k ? (st.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return el('th', { attrs: { 'aria-sort': st.sortBy === k ? (st.sortDir === 'asc' ? 'ascending' : 'descending') : 'none' } },
        el('button', { text: label + arrow, on: { click: function () {
          if (st.sortBy === k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc'; else { st.sortBy = k; st.sortDir = 'asc'; }
          load();
        } } }));
    }
    var rowEls = {};
    /** v1.16 ความกว้างคอลัมน์ตามชนิดข้อมูล */
    function colClass(f, i) {
      var c = f.t === 'money' || f.t === 'number' ? 'num col-num' : (f.t === 'date' || f.t === 'time' || f.auto ? 'nowrap col-date' : (f.t === 'textarea' ? 'col-long' : 'col-text'));
      return i === 0 ? c + ' ledger-first' : c;
    }
    function buildRow(rec) {
      var tr = el('tr', { class: rec.isDeleted ? 'deleted' : '', attrs: { 'data-id': rec.id }, on: { click: function () { openDetail(cat, rec.id); } } },
        cols.map(function (f, i) {
          var v = fieldValue(f, rec);
          var long = typeof v === 'string' && v.length > 40;
          return el('td', { class: colClass(f, i), attrs: { 'data-label': f.l, title: long ? v : null } }, long ? el('div', { class: 'cell-clamp', text: v }) : v);
        }),
        hasDue ? el('td', { class: 'nowrap', attrs: { 'data-label': 'กำหนดเวลา' } }, dueBadge(rec._due) || el('span', { class: 'muted', text: '–' })) : null,
        el('td', { class: 'nowrap', attrs: { 'data-label': 'แก้ไขล่าสุด' }, text: fmtTs(rec.updatedAt) }),
        el('td', { class: 'ledger-acts', attrs: { 'data-label': 'จัดการ' }, on: { click: function (ev) { ev.stopPropagation(); } } }, rowActions(cat, rec)));
      rowEls[rec.id] = tr;
      return tr;
    }
    /** v1.16 หลังเซิร์ฟเวอร์ยืนยันแล้วเท่านั้น: ปรับเฉพาะแถวที่เปลี่ยน (ตำแหน่งเลื่อนคงเดิม) */
    S.patchRow = function (c, rec) { var old = rowEls[rec.id]; if (c === cat && old && old.parentNode) old.parentNode.replaceChild(buildRow(rec), old); };
    S.dropRow = function (c, id) { var old = rowEls[id]; if (c === cat && old && old.parentNode && !st.includeDeleted) { old.parentNode.removeChild(old); delete rowEls[id]; } };
    function drawTable(r) {
      var prev = tableBox.querySelector('.ledger-wrap');
      var keepX = prev ? prev.scrollLeft : 0, keepY = prev ? prev.scrollTop : 0;
      clear(tableBox);
      rowEls = {};
      if (!r.rows.length) {
        tableBox.appendChild(el('div', { class: 'empty' }, el('div', { class: 'big', text: '📂' }),
          st.search || st.status || st.due || st.year ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูลในหมวดนี้'));
      } else {
        var wrap = el('div', { class: 'table-wrap ledger-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'ตาราง' + schema.label + ' เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์' } }, el('table', { class: 'data ledger' },
          el('thead', null, el('tr', null, cols.map(function (f, i) { var th = sortBtn(f.k, f.l); if (i === 0) th.classList.add('ledger-first'); return th; }), hasDue ? el('th', { text: 'กำหนดเวลา' }) : null, sortBtn('updatedAt', 'แก้ไขล่าสุด'), el('th', { class: 'ledger-acts', text: 'จัดการ' }))),
          el('tbody', null, r.rows.map(buildRow))));
        tableBox.appendChild(wrap);
        wrap.scrollLeft = keepX; wrap.scrollTop = keepY;
      }
      tableBox.appendChild(el('div', { class: 'pager' },
        el('span', { class: 'muted small', text: 'ทั้งหมด ' + fmtNum(r.total) + ' รายการ · ข้อมูล ณ ' + fmtTs(r.loadedAt) }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm', text: '‹ ก่อนหน้า', disabled: r.page <= 1, on: { click: function () { st.page = r.page - 1; load(); } } }),
        el('span', { class: 'small', text: 'หน้า ' + r.page + ' / ' + r.pages }),
        el('button', { class: 'btn btn-sm', text: 'ถัดไป ›', disabled: r.page >= r.pages, on: { click: function () { st.page = r.page + 1; load(); } } })));
    }
    S.reloadList = function (silent) { if (S.view === 'cat:' + cat) load(silent); };
    load();
  }
  /* ---------- v1.16 ปุ่มจัดการประจำแถว: เรียกฟังก์ชันเดิมของระบบทั้งหมด ไม่มี API ใหม่ ---------- */
  function rowActionDefs(cat, rec) {
    var list = [{ label: 'ดู', title: 'ดูรายละเอียดทั้งหมด', fn: function () { openDetail(cat, rec.id); } }];
    if (!rec.isDeleted) {
      if (can(cat, 'update') && !(cat === 'meetings' && rec.status === 'ยกเลิก')) list.push({ label: 'แก้ไข', title: 'แก้ไขรายการนี้ (บันทึกทับแถวเดิม)', cls: 'btn-primary', fn: function (b) {
        return busy(b, function () { return authed('getRecordById', cat, rec.id).then(function (r) { openForm(cat, 'update', r.record); }).catch(showError); });
      } });
      if (can(cat, 'upload')) list.push({ label: 'แนบไฟล์', title: 'แนบไฟล์เข้ากับรายการนี้', fn: function () { openDetail(cat, rec.id, 'files'); } });
      if (can(cat, 'create')) {
        list.push({ label: 'คัดลอก', title: 'คัดลอกเป็นรายการใหม่', fn: function (b) {
          return busy(b, function () { return authed('duplicateRecord', cat, rec.id).then(function (r) { openForm(cat, 'create', r.draft); toast(r.note, 'ok'); }).catch(showError); });
        } });
        list.push({ label: 'เพิ่ม', title: 'เพิ่มรายการใหม่', fn: function () { openForm(cat, 'create', null); } });
      }
      if (can(cat, 'delete')) list.push({ label: 'ลบ', title: 'ลบรายการนี้', cls: 'btn-danger', fn: function () { doDelete({ close: function () {} }, cat, rec); } });
    }
    return list;
  }
  function rowActions(cat, rec) {
    var defs = rowActionDefs(cat, rec);
    var btn = function (d, after) {
      return el('button', { class: 'btn btn-sm la-btn ' + (d.cls || ''), text: d.label, attrs: { title: d.title, type: 'button', 'data-act': d.label }, on: { click: function (ev) { ev.stopPropagation(); var b = ev.currentTarget; d.fn(b); if (after) after(); } } });
    };
    return [el('div', { class: 'la-grid' }, defs.map(function (d) { return btn(d); })),
      el('button', { class: 'btn btn-sm la-more', text: '⋯ จัดการ', attrs: { type: 'button', title: 'คำสั่งของรายการนี้' }, on: { click: function (ev) {
        ev.stopPropagation();
        var m = openModal({ title: 'จัดการรายการ', size: 'sm', body: el('div', { class: 'stack' }, defs.map(function (d) { var b = btn(d, function () { m.close(); }); b.classList.remove('btn-sm'); b.style.width = '100%'; b.textContent = d.title; return b; })) });
      } } })];
  }

  /* ---------- v1.9 ตารางแบบปรับคอลัมน์ได้ (Dynamic Table) ---------- */
  var LIST_COL_MAX = 80, COL_MEM = {}; // v1.9.1 เลือกได้ทุกช่องของหมวด (เดิม 12)
  function colPrefKey(cat) { return 'pams_cols2_' + cat; } // v1.16 ค่าเริ่มต้นใหม่ = ทุกคอลัมน์ (ไม่ใช้ค่าที่จำไว้ของรุ่นก่อน)
  function defaultColKeys(cat, schema) {
    var d = S.config.listColumns && S.config.listColumns[cat];
    // v1.16 ตารางแนวนอน: แสดงครบทุกคอลัมน์ (ผู้ใช้ยังเลือกเองได้ที่ปุ่ม "คอลัมน์")
    return d && d.length ? d : schema.fields.filter(function (f) { return f.t !== 'meta' && f.t !== 'ts' && !f.hidden; }).map(function (f) { return f.k; });
  }
  /** ลำดับ: ที่เลือกไว้ในเครื่องนี้ → ค่าเริ่มต้นที่ผู้ดูแลตั้ง → ค่าเดิมของระบบ */
  function listColKeys(cat, schema, byKey) {
    var mine = COL_MEM[cat] || null; // จำในรอบนี้เสมอ (กรณีเบราว์เซอร์ปิดการจำค่า)
    if (!mine) { try { mine = JSON.parse(localStorage.getItem(colPrefKey(cat)) || 'null'); } catch (e) { mine = null; } }
    var pick = function (arr) { return (Array.isArray(arr) ? arr : []).filter(function (k) { return byKey[k]; }); };
    var keys = pick(mine);
    if (!keys.length) keys = pick(defaultColKeys(cat, schema));
    if (!keys.length) keys = pick(COLS[cat] || schema.title);
    return keys.slice(0, LIST_COL_MAX);
  }
  function openColumnChooser(cat) {
    var schema = S.config.schemas[cat];
    var byKey = {}; schema.fields.forEach(function (f) { byKey[f.k] = f; });
    var cur = listColKeys(cat, schema, byKey);
    var avail = schema.fields.filter(function (f) { return f.t !== 'meta' && f.t !== 'ts' && !f.hidden; });
    var chosen = cur.slice();
    var count = el('span', { class: 'muted small' });
    var grid = el('div', { class: 'check-grid' });
    function draw() {
      clear(grid);
      avail.forEach(function (f) {
        var c = el('input', { type: 'checkbox', checked: chosen.indexOf(f.k) !== -1, attrs: { 'data-k': f.k } });
        c.addEventListener('change', function () {
          var i = chosen.indexOf(f.k);
          if (c.checked && i === -1) { if (chosen.length >= LIST_COL_MAX) { c.checked = false; toast('เลือกได้สูงสุด ' + LIST_COL_MAX + ' คอลัมน์', 'warn'); return; } chosen.push(f.k); }
          if (!c.checked && i !== -1) chosen.splice(i, 1);
          count.textContent = 'เลือกแล้ว ' + chosen.length + '/' + LIST_COL_MAX;
        });
        grid.appendChild(el('label', { class: 'check' }, c, f.l, f.x ? el('span', { class: 'badge b-progress x-badge', text: 'เพิ่มเติม' }) : null));
      });
      count.textContent = 'เลือกแล้ว ' + chosen.length + '/' + LIST_COL_MAX;
    }
    draw();
    // คงลำดับเดิม ช่องที่ติ๊กเพิ่มจะต่อท้าย
    var order = function () { var ok = avail.map(function (f) { return f.k; }); return chosen.filter(function (k) { return ok.indexOf(k) !== -1; }); };
    var saveMine = el('button', { class: 'btn btn-primary', text: 'ใช้ในเครื่องนี้' });
    var resetBtn = el('button', { class: 'btn', text: 'กลับค่าเริ่มต้น' });
    var saveAll = S.config.canManageFields ? el('button', { class: 'btn btn-gold', text: 'ตั้งเป็นค่าเริ่มต้นของทุกคน' }) : null;
    var m = openModal({ title: 'เลือกคอลัมน์ที่แสดง — ' + schema.label, body: el('div', { class: 'stack' },
      el('div', { class: 'notice', text: 'ติ๊กช่องที่ต้องการเห็นในตาราง (สูงสุด ' + LIST_COL_MAX + ' คอลัมน์) · ไม่เปลี่ยนข้อมูล เปลี่ยนเฉพาะการแสดงผล · ช่องที่ไม่มีสิทธิ์ดูจะไม่แสดง' }),
      count, grid),
      foot: [el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); } } }), resetBtn, el('div', { class: 'spacer' }), saveAll, saveMine] });
    var reopen = function () { m.close(); S.cache = {}; navigate('cat:' + cat); };
    saveMine.addEventListener('click', function () {
      var ks = order();
      if (!ks.length) { toast('เลือกอย่างน้อย 1 คอลัมน์', 'warn'); return; }
      COL_MEM[cat] = ks;
      try { localStorage.setItem(colPrefKey(cat), JSON.stringify(ks)); } catch (e) { toast('เบราว์เซอร์นี้จำค่าข้ามรอบไม่ได้ — ใช้ได้จนกว่าจะปิดหน้าเว็บ', 'warn'); }
      reopen();
    });
    resetBtn.addEventListener('click', function () { delete COL_MEM[cat]; try { localStorage.removeItem(colPrefKey(cat)); } catch (e) { /* ignore */ } reopen(); });
    if (saveAll) saveAll.addEventListener('click', function () {
      var ks = order();
      busy(saveAll, function () {
        return authed('saveListColumns', cat, ks, newRid()).then(function (r) {
          S.config.listColumns = S.config.listColumns || {}; S.config.listColumns[cat] = r.columns;
          delete COL_MEM[cat]; try { localStorage.removeItem(colPrefKey(cat)); } catch (e) { /* ignore */ }
          toast('ตั้งค่าเริ่มต้นของตารางแล้ว (ผู้ใช้ที่เลือกเองในเครื่องจะยังเห็นแบบที่เลือก)', 'ok');
          reopen();
        }).catch(showError);
      });
    });
  }

  /* ---------- v1.9 จัดการช่องข้อมูลเพิ่มเติม (Dynamic Form) ---------- */
  function openFieldManager(cat) {
    var schema = S.config.schemas[cat];
    var m = openModal({ title: 'ช่องข้อมูลเพิ่มเติม — ' + schema.label, sticky: true, body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    var changed = false;
    function done() { m.close(); if (changed) reloadConfig().then(function () { S.cache = {}; navigate('cat:' + cat); }).catch(showError); }
    m.setFoot([el('div', { class: 'spacer' }), el('button', { class: 'btn', text: 'ปิด', on: { click: done } })]);
    function load() {
      authed('listFieldDefs', cat).then(draw).catch(function (e) { m.setBody(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
    }
    function draw(d) {
      var active = d.fields.filter(function (f) { return f.active; }).length;
      var body = el('tbody', null, d.fields.length ? d.fields.map(function (f) {
        var tog = el('button', { class: 'btn btn-sm', text: f.active ? 'ซ่อน' : 'แสดง' });
        tog.addEventListener('click', function () {
          busy(tog, function () {
            return authed('saveFieldDef', { id: f.id, category: cat, label: f.label, options: f.options, pii: f.pii, description: f.description, active: !f.active }, newRid())
              .then(function () { changed = true; toast(f.active ? 'ซ่อนช่องแล้ว (ข้อมูลเดิมยังอยู่ครบในชีต)' : 'แสดงช่องแล้ว', 'ok'); load(); }).catch(showError);
          });
        });
        return el('tr', { style: { cursor: 'default' } },
          el('td', { attrs: { 'data-label': 'ชื่อช่อง' } }, el('strong', { text: f.label }), f.description ? el('div', { class: 'muted small', text: f.description }) : null,
            f.sourceHeader && f.sourceHeader !== f.label ? el('div', { class: 'muted small', text: 'จากคอลัมน์: ' + f.sourceHeader }) : null),
          el('td', { attrs: { 'data-label': 'ชนิด' } }, f.typeLabel, f.type === 'select' ? el('div', { class: 'muted small', text: f.options.join(' · ') }) : null),
          el('td', { attrs: { 'data-label': 'สถานะ' } }, el('span', { class: 'badge ' + (f.active ? 'b-ok' : 'b-cancel'), text: f.active ? 'แสดง' : 'ซ่อน' }), f.pii ? el('span', { class: 'badge b-soon', style: { marginLeft: '4px' }, text: 'ข้อมูลส่วนบุคคล' }) : null),
          el('td', { class: 'mono small', attrs: { 'data-label': 'คอลัมน์ในชีต' }, text: f.key }),
          el('td', { attrs: { 'data-label': '' } }, el('div', { class: 'row' }, el('button', { class: 'btn btn-sm', text: 'แก้ไข', on: { click: function () { editField(d, f); } } }), tog)));
      }) : [el('tr', null, el('td', { attrs: { colspan: '5' }, class: 'muted', text: 'ยังไม่มีช่องเพิ่มเติม — กด "เพิ่มช่องใหม่" หรือสร้างระหว่างนำเข้าไฟล์ Excel' }))]);
      m.setBody(el('div', { class: 'stack' },
        el('div', { class: 'notice' }, 'ช่องเพิ่มเติมจะแสดงในฟอร์มเพิ่ม/แก้ไข ตาราง (เลือกที่ "▦ คอลัมน์") และรายละเอียดรายการ · ระบบเพิ่มเป็นคอลัมน์ใหม่ท้ายชีต (ชื่อขึ้นต้น x_) ไม่แก้คอลัมน์เดิม · ',
          el('strong', { text: 'ไม่มีการลบ' }), ' — "ซ่อน" แล้วข้อมูลเดิมยังอยู่ครบ เปิดแสดงใหม่ได้ · เปลี่ยนชนิดข้อมูลหลังสร้างไม่ได้ (กันข้อมูลเดิมเพี้ยน)'),
        el('div', { class: 'row' }, el('span', { class: 'muted small', text: 'ใช้งานอยู่ ' + active + '/' + d.max + ' ช่อง' }), el('div', { class: 'spacer' }),
          el('button', { class: 'btn btn-primary btn-sm', attrs: { 'data-act': 'add-field' }, on: { click: function () { editField(d, null); } } }, svg(ICON.plus, 16), 'เพิ่มช่องใหม่')),
        el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
          el('thead', null, el('tr', null, ['ชื่อช่อง', 'ชนิดข้อมูล', 'สถานะ', 'คอลัมน์ในชีต', ''].map(function (h) { return el('th', { text: h }); }))), body))));
    }
    function editField(d, f) {
      var isNew = !f;
      var label = el('input', { class: 'input', maxLength: 60, value: f ? f.label : '', attrs: { 'aria-label': 'ชื่อช่อง' } });
      var type = el('select', { class: 'input', disabled: !isNew, attrs: { 'aria-label': 'ชนิดข้อมูล' } }, d.types.map(function (t) { return el('option', { value: t.key, text: t.label, selected: f ? f.type === t.key : t.key === 'text' }); }));
      var opts = el('textarea', { class: 'input', rows: 3, placeholder: 'หนึ่งบรรทัดต่อหนึ่งตัวเลือก', value: f ? f.options.join('\n') : '' });
      var optBox = el('div', { class: 'field' }, el('label', { text: 'ตัวเลือก (สำหรับชนิด "ตัวเลือก")' }), opts);
      var pii = el('input', { type: 'checkbox', checked: f ? f.pii : false });
      var desc = el('input', { class: 'input', maxLength: 200, value: f ? f.description : '', placeholder: 'คำอธิบายสั้น ๆ ว่ากรอกอะไร (ถ้ามี)' });
      var sync = function () { optBox.classList.toggle('hidden', type.value !== 'select'); };
      type.addEventListener('change', sync); sync();
      var err = el('div');
      var save = el('button', { class: 'btn btn-primary', text: isNew ? 'สร้างช่อง' : 'บันทึก' });
      var mm = openModal({ title: isNew ? 'เพิ่มช่องข้อมูลใหม่' : 'แก้ไขช่อง "' + f.label + '"', size: 'sm', body: el('div', { class: 'stack' },
        el('div', { class: 'field' }, el('label', null, 'ชื่อช่อง', el('span', { class: 'req', text: '*' })), label),
        el('div', { class: 'field' }, el('label', { text: 'ชนิดข้อมูล' }), type, !isNew ? el('div', { class: 'hint', text: 'เปลี่ยนชนิดไม่ได้หลังสร้าง' }) : null),
        optBox,
        el('label', { class: 'check' }, pii, 'เป็นข้อมูลส่วนบุคคล (ปิดบังสำหรับผู้ไม่มีสิทธิ์ดูข้อมูลส่วนบุคคล)'),
        el('div', { class: 'field' }, el('label', { text: 'คำอธิบาย' }), desc), err),
        foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { mm.close(); } } }), el('div', { class: 'spacer' }), save] });
      var rid = newRid();
      save.addEventListener('click', function () {
        var data = { category: cat, label: label.value.trim(), type: type.value, options: opts.value.split('\n'), pii: pii.checked, description: desc.value.trim() };
        if (f) { data.id = f.id; data.active = f.active; delete data.type; }
        busy(save, function () {
          return authed('saveFieldDef', data, rid).then(function () { changed = true; mm.close(); toast(isNew ? 'สร้างช่องใหม่แล้ว' : 'บันทึกแล้ว', 'ok'); load(); })
            .catch(function (e) { clear(err); showErrors(err, e.message || 'บันทึกไม่สำเร็จ', e.details || []); });
        });
      });
    }
    load();
  }

  /** หลังบันทึก/ลบ: ล้างข้อมูลที่จำไว้ แล้วโหลดหน้าปัจจุบันใหม่แบบไม่กระพริบ */
  function refreshCurrent() {
    S.cache = {};
    if (S.view.indexOf('cat:') === 0 && S.reloadList) S.reloadList(true);
    else if (S.view === 'dashboard') renderDashboard($('main'), { silent: true });
  }

  function openYearSheet() {
    var nb = new Date().getFullYear() + 543;
    var sel = el('select', { class: 'input' });
    for (var y = nb + 2; y >= nb - 10; y--) sel.appendChild(el('option', { value: String(y), text: 'ปี พ.ศ. ' + y, selected: y === nb }));
    var go = el('button', { class: 'btn btn-primary', text: 'สร้าง / อัปเดตชีต' });
    var out = el('div');
    var m = openModal({ title: 'ชีตสรุปสัญญาและการขายรายปี', size: 'sm', body: el('div', { class: 'stack' },
      el('div', { class: 'notice', text: 'ระบบจะสร้างแท็บ "สรุปสัญญา_ปี" ในไฟล์ชีตหลัก รวมสัญญาทุกประเภทที่มีผลในปีนั้น และรายการขายที่เจรจา/โอนในปีนั้น · กดซ้ำได้ ระบบเขียนทับแท็บเดิม ไม่สร้างซ้ำ · ข้อมูลจริงยังแก้ผ่านเว็บแอปตามปกติ' }),
      el('div', { class: 'field' }, el('label', { text: 'ปี พ.ศ.' }), sel), out),
      foot: [el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); } } }), go] });
    go.addEventListener('click', function () {
      busy(go, function () {
        return authed('buildYearSheet', Number(sel.value), newRid()).then(function (r) {
          clear(out).appendChild(el('div', { class: 'notice gold', text: (r.created ? 'สร้างแท็บ ' : 'อัปเดตแท็บ ') + '"' + r.sheetName + '" แล้ว · สัญญา ' + r.contracts + ' รายการ · การขาย ' + r.sales + ' รายการ' }));
        }).catch(showError);
      });
    });
  }

  /* ============================== รายละเอียด ============================== */

  function openDetail(cat, id, tab) {
    var schema = S.config.schemas[cat];
    if (!schema) { toast('คุณไม่มีสิทธิ์ดูหมวดนี้', 'warn'); return; }
    var m = openModal({ title: schema.label, body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    authed('getRecordById', cat, id).then(function (r) { drawDetail(m, cat, r.record, tab); })
      .catch(function (e) { m.setBody(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
  }

  function drawDetail(m, cat, rec, tab) {
    var schema = S.config.schemas[cat];
    var titleText = schema.title.map(function (k) { return rec[k]; }).filter(Boolean).join(' · ') || rec.id;
    m.title.textContent = schema.label + ' — ' + titleText;
    var pane = el('div');
    var tabs = el('div', { class: 'tabs', attrs: { role: 'tablist' } });
    var defs = [['info', 'ข้อมูล']].concat(cat === 'assets' || cat === 'land' ? [['links', 'ภาระผูกพัน']] : [], cat === 'meetings' ? [['requests', 'คำขอเลื่อนนัด']] : [], cat === 'customers' ? [['debtview', 'หนี้ · สัญญา · รับชำระ']] : [], [['files', 'ไฟล์แนบ'], ['history', 'ประวัติ']]);
    function show(key) {
      Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle('active', b.getAttribute('data-k') === key); b.setAttribute('aria-selected', b.getAttribute('data-k') === key); });
      clear(pane);
      if (key === 'info') pane.appendChild(infoPane(cat, rec));
      if (key === 'files') filesPane(pane, cat, rec);
      if (key === 'history') historyPane(pane, cat, rec);
      if (key === 'links') linksPane(pane, cat, rec);
      if (key === 'requests') requestsPane(pane, cat, rec, m);
      if (key === 'debtview') customerDebtPane(pane, rec, m);
    }
    defs.forEach(function (d) { tabs.appendChild(el('button', { class: 'tab', attrs: { 'data-k': d[0], role: 'tab' }, text: d[1], on: { click: function () { show(d[0]); } } })); });
    m.setBody([rec.isDeleted ? el('div', { class: 'errors', style: { marginBottom: '12px' }, text: 'รายการนี้ถูกลบ (Soft Delete) เมื่อ ' + fmtTs(rec.deletedAt) + ' โดย ' + rec.deletedBy + (rec.deleteReason ? ' · เหตุผล: ' + rec.deleteReason : '') }) : null, tabs, pane]);
    show(tab && defs.some(function (d) { return d[0] === tab; }) ? tab : 'info');

    var foot = [];
    if (!rec.isDeleted) {
      if (can(cat, 'delete')) foot.push(el('button', { class: 'btn btn-danger', text: 'ลบ', on: { click: function () { doDelete(m, cat, rec); } } }));
      foot.push(el('div', { class: 'spacer' }));
      if (can(cat, 'create')) foot.push(el('button', { class: 'btn', text: 'คัดลอกเป็นรายการใหม่', on: { click: function (ev) {
        var b = ev.currentTarget;
        busy(b, function () { return authed('duplicateRecord', cat, rec.id).then(function (r) { m.close(); openForm(cat, 'create', r.draft); toast(r.note, 'ok'); }).catch(showError); });
      } } }));
      if (cat === 'contracts') foot.push(el('button', { class: 'btn', text: 'ดูไฟล์สัญญาเช่า', on: { click: function () { contractFilesModal(rec); } } }));
      if (cat === 'contracts' && can('contracts', 'create') && ['ยกเลิก', 'ต่อสัญญาแล้ว'].indexOf(rec.status) === -1) foot.push(el('button', { class: 'btn btn-gold', text: 'ต่อสัญญา / ขยายอายุ', on: { click: function () { renewContract(rec); } } }));
      if ((cat === 'assets' || cat === 'land') && can('sales', 'create') && rec.status !== 'ขายแล้ว') foot.push(el('button', { class: 'btn', text: 'บันทึกการขาย', on: { click: function () { saleFrom(cat, rec); } } }));
      if (cat === 'meetings' && can(cat, 'update') && rec.status !== 'ยกเลิก') {
        foot.push(el('button', { class: 'btn btn-danger', text: 'ยกเลิกนัด', on: { click: function () { cancelMeetingUi(m, rec); } } }));
        foot.push(el('button', { class: 'btn', text: 'ส่งทดสอบถึงผู้ดูแล', attrs: { title: 'ส่งการ์ดตัวอย่างถึง LINE ส่วนตัวของผู้ดูแลระบบก่อน (ยังไม่ส่งเข้ากลุ่ม)' }, on: { click: function (ev) {
          var b = ev.currentTarget;
          busy(b, function () { return authed('sendMeetingTest', rec.id, newRid()).then(function (r) { toast(r.message, r.sent ? 'ok' : 'err'); }).catch(showError); });
        } } }));
        foot.push(el('button', { class: 'btn btn-gold', text: 'ส่งแจ้งเตือน LINE', on: { click: function (ev) {
          var b = ev.currentTarget;
          busy(b, function () { return sendMeeting(rec.id).then(function () { m.close(); refreshCurrent(); openDetail(cat, rec.id); }, function () {}); });
        } } }));
      }
      if (can(cat, 'update') && !(cat === 'meetings' && rec.status === 'ยกเลิก')) foot.push(el('button', { class: 'btn btn-primary', text: cat === 'meetings' ? 'แก้ไขรายการ' : 'แก้ไข', on: { click: function () { m.close(); openForm(cat, 'update', rec); } } }));
    } else {
      foot.push(el('div', { class: 'spacer' }));
      if (canG('purge')) foot.push(el('button', { class: 'btn btn-danger', text: 'ลบถาวร', on: { click: function () { doPurge(m, cat, rec); } } }));
      if (canG('restore')) foot.push(el('button', { class: 'btn btn-primary', text: 'กู้คืน', on: { click: function (ev) {
        var b = ev.currentTarget;
        busy(b, function () { return authed('restoreRecord', cat, rec.id, newRid()).then(function () { toast('กู้คืนแล้ว', 'ok'); m.close(); refreshCurrent(); }).catch(showError); });
      } } }));
    }
    m.setFoot(foot);
  }

  /** v1.8 หลังแก้วัน/เวลา/รายละเอียดสำคัญของนัดที่แจ้งเตือนเช้าไปแล้ว — ให้ผู้ใช้ยืนยันก่อนแจ้งเตือนใหม่ (ระบบไม่ส่งซ้ำเอง) */
  function askReRemind(id) {
    confirmBox({ title: 'แจ้งเตือนเช้าวันประชุมอีกครั้ง?', okText: 'ยืนยัน แจ้งเตือนใหม่', cancelText: 'ไม่ต้องแจ้งซ้ำ',
      message: 'นัดนี้ระบบแจ้งเตือนเช้าวันประชุมไปแล้ว และคุณเปลี่ยนวัน เวลา หรือรายละเอียดสำคัญ\nต้องการให้ระบบแจ้งเตือนใหม่ในเช้าวันประชุม (07:00–08:00 น.) หรือไม่?' }).then(function (c) {
      if (!c.ok) { toast('ไม่แจ้งเตือนซ้ำ (สถานะคงเป็น "แจ้งเตือนแล้ว")', 'warn'); return; }
      return authed('resetMeetingReminder', id, newRid()).then(function (x) { toast(x.message, 'ok'); refreshCurrent(); }).catch(showError);
    });
  }

  var REMIND_TH = { PENDING: 'รอแจ้งเตือน', PROCESSING: 'กำลังส่ง', SENT: 'แจ้งเตือนแล้ว', FAILED: 'ส่งไม่สำเร็จ', CANCELLED: 'ยกเลิก', MISSED: 'พลาดช่วงเวลา' };

  function infoPane(cat, rec) {
    var schema = S.config.schemas[cat];
    var kv = el('div', { class: 'kv' }, schema.fields.map(function (f) {
      var v = fieldValue(f, rec);
      if (f.t === 'ref' && rec[f.k] && S.config.schemas[f.ref]) {
        var a = el('a', { href: '#', text: rec[f.k], on: { click: function (ev) { ev.preventDefault(); openDetail(f.ref, rec[f.k]); } } });
        authed('getLookupOptions', f.ref, rec[f.k], cat).then(function (r) { var it = r.items.filter(function (x) { return x.id === rec[f.k]; })[0]; if (it) a.textContent = it.label + (it.sub ? ' (' + it.sub + ')' : ''); }).catch(function () {});
        v = a;
      } else if (f.t === 'ref' && rec[f.k] && (can(cat, 'create') || can(cat, 'update'))) {
        var sp = el('span', { text: rec[f.k] }); // ไม่มีสิทธิ์ดูหมวดปลายทาง → แสดงรหัส/ชื่อ (ไม่เปิดรายการ)
        authed('getLookupOptions', f.ref, rec[f.k], cat).then(function (r) { var it = r.items.filter(function (x) { return x.id === rec[f.k]; })[0]; if (it) sp.textContent = it.label; }).catch(function () {});
        v = sp;
      }
      return el('div', { class: 'item' + (f.t === 'textarea' ? ' span-2' : '') }, el('div', { class: 'k', text: f.l }), el('div', { class: 'v' }, v));
    }));
    var hidden = (rec._masked || []).length;
    var extra = [];
    if (cat === 'debts' && rec._paidTotal !== undefined) {
      extra.push(el('div', { class: 'notice', style: { marginTop: '12px' } }, 'ยอดรับชำระรวม ' + fmtMoney(rec._paidTotal) + ' · เงินต้นหักยอดชำระ ' + fmtMoney(rec._principalLessPaid) + ' (ยังไม่รวมดอกเบี้ย — คำนวณตามนโยบายองค์กร)'));
    }
    var burden = null;
    if ((cat === 'assets' || cat === 'land') && !rec.isDeleted) {
      burden = el('div', { style: { marginBottom: '10px' } });
      authed('getPropertyLinks', cat, rec.id).then(function (d) { if (d.summary.length) burden.appendChild(linksSummary(d, true)); }).catch(function () {});
    }
    if (cat === 'meetings') {
      if (rec.sendResult) extra.push(el('div', { class: 'notice' + (rec.status === 'ส่งไม่สำเร็จ' ? ' gold' : ''), style: { marginTop: '12px' }, text: 'ผลการส่ง LINE ล่าสุด: ' + rec.sendResult }));
      var rs = rec.reminderStatus || 'PENDING';
      var reBtn = (['SENT', 'MISSED', 'FAILED'].indexOf(rs) !== -1) && rec.status !== 'ยกเลิก' && can(cat, 'update') && canG('announce') ?
        el('button', { class: 'btn btn-sm', style: { marginLeft: '8px' }, text: 'ตั้งให้แจ้งเตือนเช้าอีกครั้ง', on: { click: function () { askReRemind(rec.id); } } }) : null;
      extra.push(el('div', { class: 'notice' + (rs === 'FAILED' || rs === 'MISSED' ? ' gold' : ''), style: { marginTop: '8px' } },
        el('b', { text: '⏰ แจ้งเตือนเช้าวันประชุม (07:00–08:00): ' + (REMIND_TH[rs] || rs) + ' [' + rs + ']' }),
        rec.reminderAt ? ' · ส่งเมื่อ ' + fmtTs(rec.reminderAt) : '', reBtn,
        rec.reminderResult ? el('div', { class: 'muted small', text: rec.reminderResult }) : null));
      extra.push(meetingNoteBox());
    }
    return el('div', null, burden, dueBadge(rec._due) ? el('div', { style: { marginBottom: '10px' } }, dueBadge(rec._due)) : null, kv, extra,
      hidden ? el('p', { class: 'muted small', text: 'มี ' + hidden + ' ช่องที่ถูกซ่อนตามสิทธิ์ของคุณ' }) : null,
      el('p', { class: 'muted small', style: { marginTop: '14px' } },
        'รหัสรายการ ', el('span', { class: 'mono', text: rec.id }), ' · สร้างโดย ' + (rec.createdBy || '–') + ' เมื่อ ' + fmtTs(rec.createdAt) +
        ' · แก้ไขล่าสุดโดย ' + (rec.updatedBy || '–') + ' เมื่อ ' + fmtTs(rec.updatedAt) + ' · เวอร์ชัน ' + rec.version));
  }

  function doDelete(m, cat, rec) {
    confirmBox({ title: 'ยืนยันการลบ', danger: true, okText: 'ลบรายการ', reasonLabel: 'เหตุผลการลบ (ไม่บังคับ)',
      message: 'รายการจะถูกซ่อน (Soft Delete) และผู้ดูแลกู้คืนได้ ข้อมูลยังคงถูกเก็บตามนโยบาย\nยืนยันลบรายการนี้หรือไม่?' })
      .then(function (r) {
        if (!r.ok) return;
        return authed('deleteRecord', cat, rec.id, r.reason, newRid()).then(function (res) {
          toast('ลบรายการแล้ว', 'ok');
          (res.warnings || []).forEach(function (w) { toast(w, 'warn'); });
          if (S.dropRow) S.dropRow(cat, rec.id); // v1.16 เอาเฉพาะแถวนี้ออกจากหน้าจอ
          m.close(); refreshCurrent();
        }).catch(showError);
      });
  }
  function doPurge(m, cat, rec) {
    confirmBox({ title: 'ลบถาวร', danger: true, okText: 'ลบถาวร', requireText: rec.id,
      message: 'การลบถาวรย้อนกลับไม่ได้ ไฟล์แนบใน Drive จะไม่ถูกลบอัตโนมัติ\nหมวดที่อยู่ในนโยบายเก็บรักษาตามกฎหมายจะลบถาวรไม่ได้' })
      .then(function (r) {
        if (!r.ok) return;
        return authed('purgeRecord', cat, rec.id, r.text, newRid()).then(function () { toast('ลบถาวรแล้ว', 'ok'); m.close(); refreshCurrent(); }).catch(showError);
      });
  }

  function historyPane(pane, cat, rec) {
    pane.appendChild(el('div', { class: 'skeleton' }));
    authed('getRecordHistory', cat, rec.id).then(function (r) {
      clear(pane);
      if (!r.rows.length) { pane.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีประวัติ' })); return; }
      pane.appendChild(el('div', { class: 'timeline' }, r.rows.map(function (h) {
        return el('div', { class: 'ev' }, el('div', { class: 'muted', text: fmtTs(h.timestamp) }),
          el('div', null, el('strong', { text: actionLabel(h.action) }), ' · ' + h.user + ' · ' + h.result,
            h.details ? el('div', { class: 'muted small pre', text: h.details }) : null));
      })));
    }).catch(function (e) { clear(pane).appendChild(el('div', { class: 'empty', text: e.message })); });
  }
  function actionLabel(a) {
    return ({ CREATE: 'สร้างรายการ', UPDATE: 'แก้ไข', SOFT_DELETE: 'ลบ (Soft Delete)', RESTORE: 'กู้คืน', PURGE: 'ลบถาวร',
      FILE_UPLOAD: 'อัปโหลดไฟล์', FILE_DOWNLOAD: 'เปิด/ดาวน์โหลดไฟล์', FILE_DELETE: 'ลบไฟล์', FORBIDDEN: 'ถูกปฏิเสธสิทธิ์',
      LOGIN: 'เข้าสู่ระบบ', LOGOUT: 'ออกจากระบบ', OTP_REQUEST: 'ขอรหัส OTP', AI_ASK: 'ถาม AI', AI_SUMMARY: 'สรุปด้วย AI', IMPORT: 'นำเข้าจากชีต' })[a] || a;
  }

  /* ============================== ไฟล์แนบ ============================== */

  /** แท็บไฟล์แนบ: กล่องอัปโหลดอยู่คงที่ (ความคืบหน้าไม่หาย) · รายชื่อไฟล์โหลดใหม่เมื่ออัปโหลด/ลบเสร็จ */
  function filesPane(pane, cat, rec) {
    if (DOC_CATS.indexOf(cat) !== -1) return docsPane(pane, cat, rec); // v1.10 เอกสารสัญญาเช่า / คดี
    var upHolder = el('div'), listBox = el('div', null, el('div', { class: 'skeleton' }));
    pane.appendChild(upHolder); pane.appendChild(listBox);
    var first = true;
    function load() {
      authed('listFiles', cat, rec.id).then(function (r) {
        if (first && cat === 'contracts') upHolder.appendChild(el('div', { class: 'row', style: { marginBottom: '8px' } },
          el('button', { class: 'btn btn-gold btn-sm', text: '📂 ดูไฟล์สัญญาเช่า (ทุกฉบับ)', on: { click: function () { contractFilesModal(rec); } } })));
        if (first && r.canUpload && !rec.isDeleted) upHolder.appendChild(uploadBox(cat, rec, load));
        first = false;
        clear(listBox);
        if (!r.canDownload) listBox.appendChild(el('div', { class: 'notice', style: { margin: '10px 0' }, text: 'บัญชีของคุณดูรายชื่อไฟล์ได้ แต่ไม่มีสิทธิ์เปิดหรือดาวน์โหลดไฟล์' }));
        if (r.hiddenCount) listBox.appendChild(el('p', { class: 'muted small', text: 'มีไฟล์อ่อนไหวอีก ' + r.hiddenCount + ' ไฟล์ที่ซ่อนตามสิทธิ์ของคุณ' }));
        if (!r.files.length) { listBox.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีไฟล์แนบ' })); return; }
        listBox.appendChild(el('div', { class: 'muted small', style: { marginTop: '12px' }, text: 'ไฟล์แนบ ' + r.files.length + ' ไฟล์' }));
        r.files.forEach(function (f) {
          listBox.appendChild(el('div', { class: 'file-row' },
            el('span', { class: 'f-ext', text: (extOf(f.originalName) || '?').slice(0, 4).toUpperCase() }),
            el('div', { class: 'name' }, f.originalName, el('div', { class: 'muted small', text: fmtSize(f.sizeBytes) + ' · ' + f.uploadedBy + ' · ' + fmtTs(f.uploadedAt) })),
            el('span', { class: 'badge ' + (f.sensitive ? 'b-sens' : 'b-progress'), text: f.tag }),
            f.version ? el('span', { class: 'badge ' + (f.cstatus === 'REPLACED' ? 'b-cancel' : 'b-ok'), text: 'ฉบับที่ ' + f.version + (f.cstatus === 'REPLACED' ? ' · ถูกแทนที่' : '') }) : null,
            r.canDownload ? el('button', { class: 'btn btn-sm', text: 'เปิด', on: { click: function (ev) { openFile(ev.currentTarget, f); } } }) : null,
            r.canDelete && !rec.isDeleted ? el('button', { class: 'btn btn-sm btn-danger', text: 'ลบ', on: { click: function () {
              confirmBox({ title: 'ลบไฟล์', danger: true, okText: 'ลบไฟล์', reasonLabel: 'เหตุผล (ไม่บังคับ)',
                message: 'ไฟล์จะถูกซ่อนจากระบบ แต่ไฟล์ต้นฉบับยังเก็บไว้ใน Drive เพื่อเป็นหลักฐาน' }).then(function (c) {
                if (!c.ok) return;
                return authed('deleteFile', f.id, c.reason, newRid()).then(function () { toast('ลบไฟล์แล้ว', 'ok'); load(); }).catch(showError);
              });
            } } }) : null));
        });
      }).catch(function (e) { clear(listBox).appendChild(el('div', { class: 'empty', text: e.message })); });
    }
    load();
  }

  function extOf(name) { var p = String(name || '').split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; }

  /* ============================== v1.10 เอกสาร: สัญญาเช่า · กฎหมายและคดี ============================== */
  var DOC_CATS = ['contracts', 'legal'];
  var DOC_KINDS = [['DRIVE', 'ลิงก์ Google Drive / โฟลเดอร์'], ['SHEETS', 'ลิงก์ Google Sheets'], ['LINK', 'ลิงก์อื่น (https)'], ['NOTE', 'บันทึกข้อความ']];
  var KIND_ICON = { DRIVE: '📁', SHEETS: '📊', LINK: '🔗', NOTE: '📝' };
  function docTypesOf(cat) {
    var k = cat === 'contracts' ? 'OPTIONS_DOC_TYPE_CONTRACT' : 'OPTIONS_DOC_TYPE_LEGAL';
    return String((S.config.settings || {})[k] || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function docKey(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function baseName(n) { return String(n || '').replace(/\.[^.]+$/, '').trim(); }

  /**
   * ชุดเตรียมเอกสาร: เลือกไฟล์ / เพิ่มลิงก์ / บันทึกข้อความ → ตั้งชื่อ ประเภท วันที่ ก่อนส่ง
   * opts: { existing: fn() → [ชื่อเอกสารเดิม], onPickFiles: fn(files) → Promise<contractAction|null>, compact }
   * คืน { el, count(), run(rec) → Promise<{ ok, fail }> }
   */
  function docStager(cat, opts) {
    opts = opts || {};
    var set = S.config.settings;
    var isCtr = cat === 'contracts';
    var allowed = String(isCtr ? (set.CONTRACT_FILE_EXT || 'pdf|doc|docx|xls|xlsx|csv|jpg|jpeg|png|zip') : (set.ALLOWED_FILE_EXT || '*')).split('|').map(function (x) { return x.trim().toLowerCase().replace(/^\./, ''); }).filter(Boolean);
    var all = !isCtr && allowed.indexOf('*') !== -1;
    var maxMb = Number(set.MAX_UPLOAD_MB || 50);
    var canPII = can(cat, 'viewPII');
    var types = docTypesOf(cat);
    var tag = el('select', { class: 'input', attrs: { 'aria-label': 'ระดับความลับของไฟล์', title: 'ประเภทไฟล์ (ไฟล์อ่อนไหวเปิดได้เฉพาะผู้มีสิทธิ์ข้อมูลส่วนบุคคล)' } },
      (S.config.fileTags || []).filter(function (t) { return !t.sensitive || canPII; }).map(function (t) { return el('option', { value: t.tag, text: t.tag + (t.sensitive ? ' (อ่อนไหว)' : '') }); }));
    var input = el('input', { type: 'file', class: 'sr-only', multiple: true, attrs: { 'aria-label': 'เลือกไฟล์เอกสาร' } });
    if (!all) input.setAttribute('accept', allowed.map(function (e) { return '.' + e; }).join(','));
    var list = el('div', { class: 'doc-stage' });
    var items = [];
    var pickBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', attrs: { 'data-act': 'doc-pick' }, on: { click: function () { input.click(); } } }, svg(ICON.upload, 16), 'เลือกไฟล์');
    var linkBtn = el('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-act': 'doc-link' }, on: { click: function () { addLink(); } } }, '🔗 เพิ่มลิงก์ / บันทึกข้อความ');
    var info = el('div', { class: 'muted small', text: (all ? 'ไฟล์ทุกชนิด (ยกเว้นไฟล์โปรแกรม)' : 'อนุญาต: ' + allowed.join(', ')) + ' · สูงสุด ' + maxMb + ' MB/ไฟล์ · ไม่บังคับแนบไฟล์ — ใส่ลิงก์หรือบันทึกข้อความแทนได้' });
    var zone = el('div', { class: 'drop dropzone doc-zone' },
      el('div', { class: 'row' }, pickBtn, linkBtn, el('div', { class: 'spacer' }), el('label', { class: 'small muted', text: 'ความลับของไฟล์:' }), tag, input), info, list);
    function typeSel(v) {
      return el('select', { class: 'input', attrs: { 'aria-label': 'ประเภทเอกสาร' } }, el('option', { value: '', text: '— ประเภทเอกสาร —' }),
        types.map(function (t) { return el('option', { value: t, text: t, selected: t === v }); }));
    }
    function remove(it) { var i = items.indexOf(it); if (i !== -1) items.splice(i, 1); if (it.node.parentNode) it.node.parentNode.removeChild(it.node); }
    function baseRow(it, head, extra) {
      it.name = el('input', { class: 'input', maxLength: 150, placeholder: 'ตั้งชื่อเอกสาร (แสดงในระบบ)', value: it.defName || '', attrs: { 'aria-label': 'ชื่อเอกสาร', 'data-doc': 'name' } });
      it.type = typeSel(''); it.type.setAttribute('data-doc', 'type');
      it.dateW = dateField({ k: 'docDate', l: 'วันที่เอกสาร', t: 'date' }, ''); // ปฏิทินเดียวกับฟอร์ม (พิมพ์ วว/ดด/ปปปป พ.ศ.)
      it.date = it.dateW.querySelector('input[type=hidden]'); it.date._vis.setAttribute('data-doc', 'date');
      it.msg = el('div', { class: 'small doc-msg' });
      it.rm = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '✕', attrs: { title: 'เอาออก', 'aria-label': 'เอาออก' }, on: { click: function () { remove(it); } } });
      it.node = el('div', { class: 'doc-item' }, el('div', { class: 'row' }, head, el('div', { class: 'spacer' }), it.rm),
        el('div', { class: 'doc-fields' }, el('div', { class: 'df-name' }, it.name), el('div', { class: 'df-type' }, it.type), el('div', { class: 'df-date' }, it.dateW)), extra || null, it.msg);
      it.name.addEventListener('input', function () { it.allowDup = false; it.node.classList.remove('bad'); it.msg.textContent = ''; });
      items.push(it); list.appendChild(it.node);
      return it;
    }
    function addFiles(files, act) {
      Array.prototype.slice.call(files || []).forEach(function (file) {
        var ext = extOf(file.name);
        var it = { kind: 'FILE', file: file, ext: ext, defName: baseName(file.name), rid: newRid(), act: act || null };
        baseRow(it, el('div', { class: 'row', style: { gap: '8px' } }, el('span', { class: 'f-ext', text: (ext || '?').slice(0, 4).toUpperCase() }),
          el('span', { class: 'small', text: file.name + ' · ' + fmtSize(file.size) })));
        it.up = upRow(file); it.up.el.classList.add('hidden'); it.node.appendChild(it.up.el);
        var why = !ext ? 'ไฟล์ต้องมีนามสกุล' : BLOCKED_EXT.indexOf(ext) !== -1 ? 'ไม่อนุญาตไฟล์ชนิด .' + ext + ' (ไฟล์โปรแกรม/สคริปต์)' :
          (!all && allowed.indexOf(ext) === -1) ? 'ไม่อนุญาตไฟล์ชนิด .' + ext : file.size > maxMb * 1048576 ? 'ไฟล์ใหญ่เกิน ' + maxMb + ' MB' : !file.size ? 'ไฟล์ว่าง' : '';
        if (why) { it.blocked = why; it.node.classList.add('bad'); it.msg.textContent = why + ' — ไฟล์นี้จะไม่ถูกส่ง'; }
      });
      input.value = '';
      // v1.10.1 โหมดอัปโหลดทันที (สัญญาเช่า เมื่อไม่ติ๊ก "ตั้งชื่อก่อนอัปโหลด") — ใช้ชื่อไฟล์เป็นชื่อเอกสาร
      if (opts.autoSend && opts.autoSend() && opts.onAuto && pending(true).length) opts.onAuto();
    }
    function addLink() {
      var it = { kind: 'DRIVE', rid: newRid() };
      it.kindSel = el('select', { class: 'input', attrs: { 'aria-label': 'ชนิดเอกสาร', 'data-doc': 'kind' } }, DOC_KINDS.map(function (k) { return el('option', { value: k[0], text: KIND_ICON[k[0]] + ' ' + k[1] }); }));
      it.url = el('input', { class: 'input', type: 'url', maxLength: 2000, placeholder: 'วางลิงก์ https://…', attrs: { 'aria-label': 'ลิงก์', 'data-doc': 'url' } });
      it.note = el('textarea', { class: 'input hidden', rows: 3, maxLength: 5000, placeholder: 'พิมพ์บันทึกข้อความ', attrs: { 'aria-label': 'บันทึกข้อความ', 'data-doc': 'note' } });
      var sync = function () { it.kind = it.kindSel.value; it.url.classList.toggle('hidden', it.kind === 'NOTE'); it.note.classList.toggle('hidden', it.kind !== 'NOTE');
        it.url.placeholder = it.kind === 'SHEETS' ? 'https://docs.google.com/spreadsheets/…' : it.kind === 'DRIVE' ? 'https://drive.google.com/…' : 'https://…'; };
      it.kindSel.addEventListener('change', sync);
      baseRow(it, it.kindSel, el('div', null, it.url, it.note));
      sync(); it.name.focus();
    }
    function okFile(f) { var e = extOf(f.name); return !!e && BLOCKED_EXT.indexOf(e) === -1 && (all || allowed.indexOf(e) !== -1); }
    input.addEventListener('change', function () {
      var files = input.files;
      if (!files || !files.length) return;
      if (!opts.onPickFiles) return addFiles(files, null);
      var arr = Array.prototype.slice.call(files);
      var bad = arr.filter(function (f) { return !okFile(f); });
      if (bad.length) addFiles(bad, null); // ไฟล์ชนิดที่ไม่อนุญาต แจ้งทันที (ไม่ต้องถามเรื่องไฟล์เดิม)
      arr = arr.filter(okFile);
      if (!arr.length) { input.value = ''; return; }
      pickBtn.disabled = true;
      opts.onPickFiles(arr).then(function (act) {
        if (act === null) { input.value = ''; toast('ยกเลิก — ไม่มีการเปลี่ยนแปลง', 'warn'); return; }
        addFiles(arr, act);
      }).catch(function (e) { input.value = ''; showError(e); }).then(function () { pickBtn.disabled = false; });
    });
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (ev) { if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) { if (opts.onPickFiles) { var arr = Array.prototype.slice.call(ev.dataTransfer.files); opts.onPickFiles(arr).then(function (a) { if (a !== null) addFiles(arr, a); }).catch(showError); } else addFiles(ev.dataTransfer.files, null); } });

    function pending(onlyFiles) { return items.filter(function (it) { return !it.done && !it.blocked && (!onlyFiles || it.kind === 'FILE'); }); }
    /** ตรวจก่อนส่ง: ชื่อไม่ว่าง ไม่ซ้ำกันเอง ไม่ซ้ำเอกสารเดิม · ลิงก์/บันทึกครบ */
    function validate(onlyFiles) {
      var problems = 0;
      var existing = (opts.existing ? opts.existing() : []).map(docKey);
      var seen = {};
      pending(onlyFiles).forEach(function (it) {
        var n = it.name.value.replace(/\s+/g, ' ').trim(), why = '';
        it.node.classList.remove('bad');
        if (!n) why = 'กรุณาตั้งชื่อเอกสาร';
        else if (seen[docKey(n)]) why = 'ชื่อซ้ำกับเอกสารอื่นในชุดนี้ — กรุณาเปลี่ยนชื่อ';
        else if (existing.indexOf(docKey(n)) !== -1 && !it.allowDup && !(it.act && it.act.mode === 'replace')) why = 'มีเอกสารชื่อนี้ในรายการแล้ว — เปลี่ยนชื่อ หรือกด "ใช้ชื่อที่แนะนำ"';
        else if (it.kind !== 'FILE' && it.kind !== 'NOTE' && !/^https:\/\/\S+$/i.test(it.url.value.trim())) why = 'กรุณาวางลิงก์ที่ขึ้นต้นด้วย https://';
        else if (it.kind === 'NOTE' && !it.note.value.trim()) why = 'กรุณาพิมพ์บันทึกข้อความ';
        if (n) seen[docKey(n)] = true;
        if (why) {
          problems++; it.node.classList.add('bad'); clear(it.msg).appendChild(document.createTextNode(why));
          if (/ใช้ชื่อที่แนะนำ/.test(why)) suggestBtn(it, suggestName(n, existing));
        }
      });
      return problems;
    }
    function suggestName(n, existing) { var i = 2, s = n + ' (' + i + ')'; while (existing.indexOf(docKey(s)) !== -1 && i < 99) { i++; s = n + ' (' + i + ')'; } return s; }
    function suggestBtn(it, sug) {
      it.msg.appendChild(el('button', { class: 'btn btn-sm', type: 'button', style: { marginLeft: '8px' }, attrs: { 'data-act': 'use-suggest' }, text: 'ใช้ชื่อ "' + sug + '"', on: { click: function () { it.name.value = sug; it.allowDup = false; it.node.classList.remove('bad'); it.msg.textContent = ''; } } }));
    }
    function sendOne(rec, it) {
      var doc = { displayName: it.name.value.replace(/\s+/g, ' ').trim(), docType: it.type.value, docDate: it.date.value, allowDup: !!it.allowDup };
      it.rm.disabled = true; it.msg.textContent = 'กำลังส่ง…'; it.node.classList.remove('bad');
      var p;
      if (it.kind === 'FILE') {
        it.up.el.classList.remove('hidden');
        p = uploadOne(cat, rec, { file: it.file, ext: it.ext, row: it.up, tag: tag.value, keep: false, contractAction: it.act || (isCtr ? { mode: 'new' } : null), doc: doc }, maxMb);
      } else {
        p = authed('saveDocLink', cat, rec.id, { kind: it.kind, title: doc.displayName, url: it.url.value.trim(), note: it.note.value, docType: doc.docType, docDate: doc.docDate, allowDuplicateName: doc.allowDup }, it.rid)
          .then(function (r) { if (r.warning) toast(doc.displayName + ': ' + r.warning, 'warn'); });
      }
      return p.then(function () {
        it.done = true; it.node.classList.add('ok'); it.msg.textContent = '✓ บันทึกแล้ว';
        [it.name, it.type, it.date._vis, it.url, it.note, it.kindSel].forEach(function (x) { if (x) x.disabled = true; });
        Array.prototype.forEach.call(it.dateW.querySelectorAll('button'), function (b) { b.disabled = true; });
      }, function (e) {
        it.rm.disabled = false; it.node.classList.add('bad');
        it.rid = newRid();
        clear(it.msg).appendChild(document.createTextNode((e && e.message) || 'ส่งไม่สำเร็จ'));
        if (e && e.code === 'DUPLICATE' && e.details && e.details.suggest) suggestBtn(it, e.details.suggest);
        else it.msg.appendChild(document.createTextNode(' — แก้แล้วกดส่งอีกครั้งได้ (ไม่สร้างรายการซ้ำ)'));
        throw e;
      });
    }
    function run(rec, onlyFiles) {
      var todo = pending(onlyFiles);
      if (!todo.length) return Promise.resolve({ ok: 0, fail: 0 });
      if (validate(onlyFiles)) return Promise.reject({ code: 'VALIDATION', message: 'ตรวจชื่อ/ลิงก์ของเอกสารที่ขึ้นสีแดงก่อนส่ง' });
      var ok = 0, fail = 0;
      return todo.reduce(function (pr, it) { return pr.then(function () { return sendOne(rec, it).then(function () { ok++; }, function () { fail++; }); }); }, Promise.resolve())
        .then(function () { return { ok: ok, fail: fail }; });
    }
    function clearDone() { items.filter(function (it) { return it.done; }).forEach(remove); }
    return { el: zone, count: function () { return pending().length; }, run: run, validate: validate, clearDone: clearDone };
  }

  /** แท็บเอกสาร (สัญญาเช่า · คดี): รายการไฟล์ + ลิงก์ + บันทึก · ค้นหา · เปิด · ลบตามสิทธิ์ */
  function docsPane(pane, cat, rec) {
    var upHolder = el('div'), listBox = el('div', null, el('div', { class: 'skeleton' }));
    pane.appendChild(upHolder); pane.appendChild(listBox);
    var first = true, names = [], q = '';
    function load() {
      authed('listFiles', cat, rec.id).then(function (r) {
        names = r.files.map(function (f) { return f.displayName || baseName(f.originalName); }).concat((r.links || []).map(function (l) { return l.title; }));
        if (first) {
          if (cat === 'contracts') upHolder.appendChild(el('div', { class: 'row', style: { marginBottom: '8px' } },
            el('button', { class: 'btn btn-gold btn-sm', text: '📂 ดูไฟล์สัญญาเช่า (ทุกฉบับ)', on: { click: function () { contractFilesModal(rec); } } })));
          if (r.canUpload && !rec.isDeleted) {
            // v1.10.1 สัญญาเช่า: ไม่ติ๊ก "ตั้งชื่อก่อนอัปโหลด" = เลือกไฟล์แล้วอัปโหลดทันที (ใช้ชื่อไฟล์) · ติ๊ก = ตั้งชื่อ/ประเภทแล้วกด "อัปโหลด / บันทึกเอกสาร"
            var nameFirst = cat === 'contracts' ? el('input', { type: 'checkbox', attrs: { 'data-act': 'name-first' } }) : null;
            if (nameFirst) { try { nameFirst.checked = localStorage.getItem('pams_ctr_namefirst') === '1'; } catch (e) { /* ignore */ }
              nameFirst.addEventListener('change', function () { try { localStorage.setItem('pams_ctr_namefirst', nameFirst.checked ? '1' : '0'); } catch (e) { /* ignore */ } }); }
            var go = el('button', { class: 'btn btn-gold', attrs: { 'data-act': 'doc-send' }, text: 'อัปโหลด / บันทึกเอกสาร' });
            var st = docStager(cat, { existing: function () { return names; }, onPickFiles: cat === 'contracts' ? function (files) { return contractPick(rec, files); } : null,
              autoSend: function () { return !!nameFirst && !nameFirst.checked; }, onAuto: function () { send(true); } });
            var sending = false, again = false;
            var send = function (onlyFiles) {
              if (sending) { again = true; return; } // กำลังส่งอยู่ → ส่งไฟล์ที่เพิ่มใหม่ต่อเมื่อรอบนี้เสร็จ (ไม่ส่งซ้ำ)
              if (!st.count()) { toast('ยังไม่มีเอกสาร — กด "เลือกไฟล์" หรือ "เพิ่มลิงก์ / บันทึกข้อความ"', 'warn'); return; }
              sending = true;
              busy(go, function () {
                return st.run(rec, onlyFiles).finally(function () { sending = false; if (again) { again = false; setTimeout(function () { send(true); }, 0); } }).then(function (s) {
                  toast('บันทึกเอกสารแล้ว ' + s.ok + ' รายการ' + (s.fail ? ' · ไม่สำเร็จ ' + s.fail + ' (ดูรายละเอียดในรายการสีแดง)' : ''), s.fail ? 'warn' : 'ok');
                  st.clearDone(); // รายการที่ส่งสำเร็จย้ายไปอยู่ในรายการเอกสารด้านล่าง
                  load();
                }).catch(function (e) { toast(e.message || 'ส่งไม่สำเร็จ', 'warn'); });
              });
            };
            go.addEventListener('click', function () { send(false); });
            upHolder.appendChild(el('div', { class: 'stack' }, st.el, el('div', { class: 'row' },
              nameFirst ? el('label', { class: 'check small', attrs: { title: 'ไม่ติ๊ก = เลือกไฟล์แล้วอัปโหลดทันที โดยใช้ชื่อไฟล์เป็นชื่อเอกสาร' } }, nameFirst, 'ตั้งชื่อ/ประเภทเอกสารก่อนอัปโหลด') : null,
              el('div', { class: 'spacer' }), go)));
          }
        }
        first = false;
        draw(r);
      }).catch(function (e) { clear(listBox).appendChild(el('div', { class: 'empty', text: e.message })); });
    }
    function draw(r) {
      clear(listBox);
      if (!r.canDownload) listBox.appendChild(el('div', { class: 'notice', style: { margin: '10px 0' }, text: 'บัญชีของคุณดูรายชื่อไฟล์ได้ แต่ไม่มีสิทธิ์เปิดหรือดาวน์โหลดไฟล์' }));
      if (r.hiddenCount) listBox.appendChild(el('p', { class: 'muted small', text: 'มีไฟล์อ่อนไหวอีก ' + r.hiddenCount + ' ไฟล์ที่ซ่อนตามสิทธิ์ของคุณ' }));
      var docs = r.files.map(function (f) { return { t: 'f', f: f, name: f.displayName || f.originalName, type: f.docType, date: f.docDate, at: f.uploadedAt }; })
        .concat((r.links || []).map(function (l) { return { t: 'l', l: l, name: l.title, type: l.docType, date: l.docDate, at: l.createdAt }; }))
        .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      if (!docs.length) { listBox.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีเอกสาร' })); return; }
      var search = el('input', { class: 'input', type: 'search', placeholder: 'ค้นหาชื่อ/ประเภทเอกสาร', value: q, attrs: { 'aria-label': 'ค้นหาเอกสาร' } });
      var box = el('div');
      listBox.appendChild(el('div', { class: 'row', style: { marginTop: '12px' } }, el('span', { class: 'muted small', text: 'เอกสาร ' + docs.length + ' รายการ' }), el('div', { class: 'spacer' }), docs.length > 4 ? el('div', { style: { minWidth: '200px' } }, search) : null));
      listBox.appendChild(box);
      function rows() {
        clear(box);
        var k = docKey(q);
        docs.filter(function (d) { return !k || docKey(d.name + ' ' + (d.type || '')).indexOf(k) !== -1; }).forEach(function (d) {
          var sub = [d.type, d.date ? 'ลงวันที่ ' + fmtDate(d.date) : ''].filter(Boolean).join(' · ');
          if (d.t === 'f') {
            var f = d.f;
            box.appendChild(el('div', { class: 'file-row', attrs: { 'data-doc-row': 'file' } },
              el('span', { class: 'f-ext', text: (extOf(f.originalName) || '?').slice(0, 4).toUpperCase() }),
              el('div', { class: 'name' }, d.name, el('div', { class: 'muted small', text: (sub ? sub + ' · ' : '') + 'ไฟล์ ' + f.originalName + ' · ' + fmtSize(f.sizeBytes) + ' · ' + f.uploadedBy + ' · ' + fmtTs(f.uploadedAt) })),
              el('span', { class: 'badge ' + (f.sensitive ? 'b-sens' : 'b-progress'), text: f.tag }),
              f.version ? el('span', { class: 'badge ' + (f.cstatus === 'REPLACED' ? 'b-cancel' : 'b-ok'), text: 'ฉบับที่ ' + f.version + (f.cstatus === 'REPLACED' ? ' · ถูกแทนที่' : '') }) : null,
              r.canDownload ? el('button', { class: 'btn btn-sm', text: 'เปิด / ดาวน์โหลด', on: { click: function (ev) { openFile(ev.currentTarget, f); } } }) : null,
              r.canDelete && !rec.isDeleted ? el('button', { class: 'btn btn-sm btn-danger', text: 'ลบ', on: { click: function () {
                confirmBox({ title: 'ลบเอกสาร "' + d.name + '"', danger: true, okText: 'ลบ', reasonLabel: 'เหตุผล (ไม่บังคับ)',
                  message: 'เอกสารจะถูกซ่อนจากระบบ แต่ไฟล์ต้นฉบับยังเก็บไว้ใน Drive เพื่อเป็นหลักฐาน' }).then(function (c) {
                  if (!c.ok) return;
                  return authed('deleteFile', f.id, c.reason, newRid()).then(function () { toast('ลบเอกสารแล้ว', 'ok'); load(); }).catch(showError);
                });
              } } }) : null));
          } else {
            var l = d.l;
            box.appendChild(el('div', { class: 'file-row', attrs: { 'data-doc-row': l.kind } },
              el('span', { class: 'f-ext', text: KIND_ICON[l.kind] || '🔗' }),
              el('div', { class: 'name' }, d.name, el('div', { class: 'muted small', text: (sub ? sub + ' · ' : '') + l.kindLabel + ' · ' + l.createdBy + ' · ' + fmtTs(l.createdAt) }),
                l.kind === 'NOTE' ? el('div', { class: 'small doc-note', text: l.note }) : (l.note ? el('div', { class: 'muted small', text: l.note }) : null)),
              l.url ? el('button', { class: 'btn btn-sm', text: 'เปิดลิงก์', attrs: { title: l.url }, on: { click: function () { var w = window.open(l.url, '_blank', 'noopener'); if (w) w.opener = null; } } }) : null,
              r.canDelete && !rec.isDeleted ? el('button', { class: 'btn btn-sm btn-danger', text: 'ลบ', on: { click: function () {
                confirmBox({ title: 'ลบเอกสาร "' + d.name + '"', danger: true, okText: 'ลบ', reasonLabel: 'เหตุผล (ไม่บังคับ)',
                  message: 'ลบเฉพาะรายการในระบบ (เก็บประวัติไว้) — ไม่แตะไฟล์ปลายทางใน Google Drive' }).then(function (c) {
                  if (!c.ok) return;
                  return authed('deleteDocLink', l.id, c.reason, newRid()).then(function () { toast('ลบเอกสารแล้ว', 'ok'); load(); }).catch(showError);
                });
              } } }) : null));
          }
        });
        if (!box.childNodes.length) box.appendChild(el('div', { class: 'muted small', style: { padding: '10px' }, text: 'ไม่พบเอกสารที่ตรงกับ "' + q + '"' }));
      }
      var timer;
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { q = search.value.trim(); rows(); }, 200); });
      rows();
      listBox.appendChild(el('div', { class: 'muted small', style: { marginTop: '8px' }, text: 'ไฟล์ไม่ถูกแชร์สาธารณะ — เปิดผ่านระบบตามสิทธิ์เท่านั้น · ลิงก์ Google Drive/Sheets เปิดได้เฉพาะผู้ที่มีสิทธิ์ในไฟล์นั้น' }));
    }
    load();
  }

  /** สัญญาเช่า: ตรวจไฟล์เดิมก่อน → ให้เลือก เพิ่มฉบับใหม่ / แทนที่ / ยกเลิก (เหมือนเดิม) */
  function contractPick(rec, files) {
    return authed('checkContractFiles', rec.id).then(function (c) {
      if (!c.found) return { mode: 'new' };
      return chooseContractAction(c, files.length);
    });
  }

  /** v1.8 พบไฟล์เดิมในสัญญา → ให้ผู้ใช้เลือก (คืน null = ยกเลิก ไม่มีการเปลี่ยนแปลง) */
  function chooseContractAction(c, nFiles) {
    return new Promise(function (resolve) {
      var done = false, pickId = c.files.length ? c.files[0].id : '';
      var radios = c.files.map(function (f, i) {
        var r = el('input', { type: 'radio', name: 'cfrep', checked: i === 0 });
        r.addEventListener('change', function () { if (r.checked) pickId = f.id; });
        return el('label', { class: 'check' }, r, (f.version ? 'ฉบับที่ ' + f.version : 'ฉบับเดิม') + ' · ' + f.fileName + ' · อัปโหลดเมื่อ ' + fmtTs(f.uploadDate) + ' · ' + f.uploadedBy);
      });
      var canReplace = nFiles === 1 && c.files.length > 0;
      var finish = function (v) { done = true; m.close(); resolve(v); };
      var m = openModal({ title: 'พบไฟล์เดิมในสัญญานี้', size: 'sm', sticky: true,
        body: el('div', { class: 'stack' },
          el('p', { style: { margin: 0, fontWeight: 600 }, text: c.message || 'พบไฟล์เดิม ต้องการเพิ่มเป็นฉบับใหม่หรือแทนที่ไฟล์เดิม?' }),
          c.files.length ? el('div', { class: 'chk-list' }, radios) : null,
          c.hiddenCount ? el('div', { class: 'muted small', text: 'มีไฟล์อ่อนไหวอีก ' + c.hiddenCount + ' ไฟล์ที่ซ่อนตามสิทธิ์ของคุณ' }) : null,
          el('div', { class: 'muted small', text: canReplace ? '"แทนที่ไฟล์เดิม" = ไฟล์ที่เลือกเปลี่ยนสถานะเป็น "ถูกแทนที่" และยังเก็บไว้เป็นประวัติ (ไม่ลบไฟล์จริง)' : (nFiles > 1 ? 'เลือกหลายไฟล์พร้อมกัน แทนที่ได้ครั้งละ 1 ไฟล์ — ใช้ "เพิ่มเป็นไฟล์ฉบับใหม่" หรือเลือกทีละไฟล์' : '') })),
        foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { finish(null); } } }),
          canReplace ? el('button', { class: 'btn btn-danger', text: 'แทนที่ไฟล์เดิม', on: { click: function () { finish({ mode: 'replace', replaces: pickId }); } } }) : null,
          el('button', { class: 'btn btn-primary', text: 'เพิ่มเป็นไฟล์ฉบับใหม่', on: { click: function () { finish({ mode: 'new' }); } } })],
        onClose: function () { if (!done) resolve(null); } });
    });
  }

  /** v1.8 ปุ่ม "ดูไฟล์สัญญาเช่า": รายการทุกฉบับตามสิทธิ์ (เซิร์ฟเวอร์ตรวจสิทธิ์ทุกครั้ง · เปิดไฟล์ตรวจซ้ำอีกครั้ง) */
  function contractFilesModal(rec) {
    var m = openModal({ title: 'ไฟล์สัญญาเช่า — ' + (rec.contractNo || rec.id), body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    authed('listContractFiles', rec.id).then(function (r) {
      if (!r.files.length) { m.setBody(el('div', { class: 'empty', text: 'ยังไม่มีไฟล์สัญญาเช่า' + (r.hiddenCount ? ' ที่คุณมีสิทธิ์เห็น' : '') })); return; }
      m.setBody(el('div', { class: 'stack' },
        el('table', { class: 'data' }, el('thead', null, el('tr', null, ['ชื่อไฟล์', 'ประเภท', 'วันที่อัปโหลด', 'ฉบับ', 'สถานะ', ''].map(function (h) { return el('th', { text: h }); }))),
          el('tbody', null, r.files.map(function (f) {
            return el('tr', { style: { cursor: 'default' } },
              el('td', { attrs: { 'data-label': 'ชื่อไฟล์' }, text: f.fileName }),
              el('td', { attrs: { 'data-label': 'ประเภท' }, text: f.fileType + ' · ' + fmtSize(f.sizeBytes) }),
              el('td', { attrs: { 'data-label': 'วันที่อัปโหลด' }, text: fmtTs(f.uploadDate) + ' · ' + f.uploadedBy }),
              el('td', { attrs: { 'data-label': 'ฉบับ' }, text: f.version ? String(f.version) : 'เดิม' }),
              el('td', { attrs: { 'data-label': 'สถานะ' } }, el('span', { class: 'badge ' + (f.status === 'ACTIVE' ? 'b-ok' : 'b-cancel'), text: f.statusLabel })),
              el('td', null, el('button', { class: 'btn btn-sm', text: 'เปิดไฟล์', on: { click: function (ev) { openFile(ev.currentTarget, { id: f.id, originalName: f.fileName }); } } })));
          }))),
        r.hiddenCount ? el('div', { class: 'muted small', text: 'มีอีก ' + r.hiddenCount + ' ไฟล์ที่ซ่อนตามสิทธิ์ของคุณ' }) : null,
        el('div', { class: 'muted small', text: 'ไฟล์ไม่ถูกแชร์สาธารณะ — เปิดผ่านระบบเท่านั้น และทุกการเปิดถูกบันทึกในประวัติ' })));
    }).catch(function (e) { m.setBody(el('div', { class: 'errors', text: e.message || 'คุณไม่มีสิทธิ์เข้าถึงไฟล์สัญญาเช่านี้ กรุณาติดต่อผู้ดูแลระบบ' })); });
  }

  /**
   * กล่องแนบไฟล์: เลือกหรือลากวางได้หลายไฟล์ทุกชนิด · รูปถูกบีบอัดอัตโนมัติ (เลือกเก็บต้นฉบับได้)
   * ไฟล์เกิน 4 MB ส่งเป็นช่วง ๆ พร้อมแถบความคืบหน้า และยกเลิกได้
   */
  function uploadBox(cat, rec, onDone) {
    var set = S.config.settings;
    var isCtr = cat === 'contracts';
    var allowed = String(isCtr ? (set.CONTRACT_FILE_EXT || 'pdf|doc|docx|xls|xlsx|csv|jpg|jpeg|png|zip') : (set.ALLOWED_FILE_EXT || '*')).split('|').map(function (x) { return x.trim().toLowerCase().replace(/^\./, ''); }).filter(Boolean);
    var all = !isCtr && allowed.indexOf('*') !== -1;
    var maxMb = Number(set.MAX_UPLOAD_MB || 50);
    var canPII = can(cat, 'viewPII');
    var tag = el('select', { class: 'input', attrs: { 'aria-label': 'ประเภทไฟล์' } },
      (S.config.fileTags || []).filter(function (t) { return !t.sensitive || canPII; }).map(function (t) {
        return el('option', { value: t.tag, text: t.tag + (t.sensitive ? ' (อ่อนไหว)' : '') });
      }));
    var input = el('input', { type: 'file', class: 'sr-only', multiple: true, attrs: { 'aria-label': 'เลือกไฟล์' } });
    if (!all) input.setAttribute('accept', allowed.map(function (e) { return '.' + e; }).join(','));
    var keep = el('input', { type: 'checkbox' });
    var list = el('div', { class: 'up-list' });
    var pick = el('button', { class: 'btn btn-primary', type: 'button', on: { click: function () { input.click(); } } }, svg(ICON.upload, 16), 'เลือกไฟล์');
    var zone = el('div', { class: 'drop dropzone' },
      el('div', { class: 'row' }, el('div', { class: 'dz-ico' }, svg(ICON.upload, 26)),
        el('div', { class: 'main-t', style: { flex: '1 1 200px' } }, el('div', { style: { fontWeight: 600 }, text: 'ลากไฟล์มาวางที่นี่ หรือกดเลือกไฟล์ (เลือกได้หลายไฟล์)' }),
          el('div', { class: 'muted small', text: (all ? 'ทุกชนิด: เอกสาร รูป วิดีโอ เสียง แผนที่ ไฟล์บีบอัด ฯลฯ (ยกเว้นไฟล์โปรแกรม)' : 'อนุญาต: ' + allowed.join(', ')) + ' · สูงสุด ' + maxMb + ' MB/ไฟล์' })),
        tag, pick, input),
      set.IMAGE_COMPRESS !== 'false' ? el('label', { class: 'check small', style: { marginTop: '8px' } }, keep, 'เก็บรูปต้นฉบับ (ไม่บีบอัด) — เลือกเมื่อเป็นหลักฐานที่ต้องการความละเอียดเต็ม') : null,
      list);
    var running = false, queue = [], anyDone = false;
    function addFiles(files) {
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      if (!isCtr) return addChecked(files, null);
      // ไฟล์ชนิดที่ไม่อนุญาต แจ้งทันที (ไม่ต้องถามเรื่องไฟล์เดิม)
      var okExt = function (f) { var e = extOf(f.name); return e && BLOCKED_EXT.indexOf(e) === -1 && allowed.indexOf(e) !== -1; };
      var badFiles = files.filter(function (f) { return !okExt(f); });
      if (badFiles.length) addChecked(badFiles, null);
      files = files.filter(okExt);
      if (!files.length) return;
      // v1.8 หมวดสัญญาเช่า: ตรวจไฟล์เดิมก่อน → ถาม "เพิ่มเป็นฉบับใหม่ / แทนที่ไฟล์เดิม / ยกเลิก" (ยกเลิก = ไม่เปลี่ยนแปลงอะไร)
      if (running || queue.length) return addChecked(files, { mode: 'new' });
      pick.disabled = true;
      authed('checkContractFiles', rec.id).then(function (c) {
        if (!c.found) return addChecked(files, { mode: 'new' });
        return chooseContractAction(c, files.length).then(function (act) {
          if (!act) { input.value = ''; toast('ยกเลิกการอัปโหลด — ไม่มีการเปลี่ยนแปลงข้อมูล', 'warn'); return; }
          addChecked(files, act);
        });
      }).catch(function (e) { input.value = ''; showError(e); }).finally(function () { pick.disabled = false; });
    }
    function addChecked(files, act) {
      files.forEach(function (file, idx) {
        var ext = extOf(file.name);
        var row = upRow(file);
        list.appendChild(row.el);
        if (!ext) return row.fail('ไฟล์ต้องมีนามสกุล');
        if (BLOCKED_EXT.indexOf(ext) !== -1) return row.fail('ไม่อนุญาตไฟล์ชนิด .' + ext + ' (ไฟล์โปรแกรม/สคริปต์)');
        if (!all && allowed.indexOf(ext) === -1) return row.fail('ไม่อนุญาตไฟล์ชนิด .' + ext);
        queue.push({ file: file, ext: ext, row: row, tag: tag.value, keep: keep.checked, contractAction: act ? (idx === 0 || act.mode === 'new' ? act : { mode: 'new' }) : null });
      });
      input.value = '';
      next();
    }
    function next() {
      if (running) return;
      var job = queue.shift();
      if (!job) { if (anyDone) { anyDone = false; onDone(); } return; }
      running = true;
      uploadOne(cat, rec, job, maxMb).then(function () { anyDone = true; }).catch(function (e) { job.row.fail(e && e.message || 'อัปโหลดไม่สำเร็จ'); })
        .then(function () { running = false; next(); });
    }
    input.addEventListener('change', function () { addFiles(input.files); });
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (ev) { if (ev.dataTransfer && ev.dataTransfer.files) addFiles(ev.dataTransfer.files); });
    return zone;
  }

  /** แถวแสดงความคืบหน้าของแต่ละไฟล์ */
  function upRow(file) {
    var bar = el('i'), status = el('span', { class: 'muted small', text: 'รอคิว' });
    var cancelBtn = el('button', { class: 'btn btn-ghost btn-sm hidden', text: 'ยกเลิก' });
    var node = el('div', { class: 'up-item' },
      el('div', { class: 'row' }, el('span', { class: 'name', text: file.name }), el('span', { class: 'muted small', text: fmtSize(file.size) }), el('div', { class: 'spacer' }), status, cancelBtn),
      el('div', { class: 'up-bar' }, bar));
    return {
      el: node, cancelBtn: cancelBtn,
      set: function (pct, text) { bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; if (text) status.textContent = text; },
      done: function (text) { bar.style.width = '100%'; node.classList.add('ok'); status.textContent = text || 'อัปโหลดแล้ว'; cancelBtn.classList.add('hidden'); },
      fail: function (text) { node.classList.add('bad'); status.textContent = text; cancelBtn.classList.add('hidden'); }
    };
  }

  function readB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject({ message: 'อ่านไฟล์ไม่สำเร็จ' }); };
      fr.readAsDataURL(blob);
    });
  }

  function uploadOne(cat, rec, job, maxMb) {
    var row = job.row, file = job.file;
    var isImg = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].indexOf(job.ext) !== -1;
    var compress = isImg && !job.keep && S.config.settings.IMAGE_COMPRESS !== 'false' && file.size > 300 * 1024;
    if (cat === 'contracts' && ['jpg', 'jpeg'].indexOf(job.ext) === -1) compress = false; // สัญญาเช่า: บีบอัดเฉพาะ JPG (คงชนิดไฟล์เดิม) · PDF/เอกสาร/ZIP เก็บต้นฉบับ
    row.set(2, compress ? 'กำลังบีบอัดรูป…' : 'กำลังเตรียม…');
    var step = compress ? compressImage(file) : Promise.resolve({ blob: file, name: file.name, type: file.type || '' });
    return step.then(function (p) {
      if (p.blob.size > maxMb * 1048576) throw { message: 'ไฟล์ใหญ่เกิน ' + maxMb + ' MB' };
      if (!p.blob.size) throw { message: 'ไฟล์ว่าง' };
      var note = p.blob !== file ? 'บีบอัด ' + fmtSize(file.size) + ' → ' + fmtSize(p.blob.size) : '';
      var meta = { name: p.name, mimeType: p.type, tag: job.tag, originalSize: file.size };
      if (job.contractAction) meta.contractAction = job.contractAction;
      // v1.10 ชื่อเอกสาร/ประเภท/วันที่ (หมวดสัญญาเช่า · กฎหมายและคดี)
      if (job.doc) { meta.displayName = job.doc.displayName; meta.docType = job.doc.docType; meta.docDate = job.doc.docDate; meta.docNote = job.doc.docNote || ''; if (job.doc.allowDup) meta.allowDuplicateName = true; }
      if (p.blob.size <= SMALL_UPLOAD) {
        row.set(30, 'กำลังส่ง…' + (note ? ' (' + note + ')' : ''));
        return readB64(p.blob).then(function (b64) {
          return authed('uploadFile', cat, rec.id, Object.assign({ base64: b64 }, meta), newRid());
        }).then(function (r) {
          if (r && r.message) { row.done(r.message); toast(r.message, 'ok'); return; }
          row.done('อัปโหลดแล้ว' + (note ? ' · ' + note : ''));
        });
      }
      return uploadChunked(cat, rec, p.blob, meta, row, note);
    });
  }

  /** ส่งไฟล์ใหญ่ทีละช่วง 4 MB — เน็ตหลุดระหว่างทางจะลองส่งช่วงเดิมซ้ำให้ 2 ครั้ง */
  function uploadChunked(cat, rec, blob, meta, row, note) {
    var cancelled = false, uploadId = null;
    row.cancelBtn.classList.remove('hidden');
    row.cancelBtn.onclick = function () { cancelled = true; row.cancelBtn.disabled = true; };
    return authed('beginUpload', cat, rec.id, Object.assign({ size: blob.size }, meta), newRid()).then(function (b) {
      uploadId = b.uploadId;
      var size = b.chunkSize, total = b.chunks;
      function send(i, tries) {
        if (cancelled) { authed('cancelUpload', uploadId).catch(function () {}); throw { message: 'ยกเลิกแล้ว' }; }
        row.set(5 + i / total * 93, 'กำลังส่ง ' + (i + 1) + '/' + total + ' ช่วง' + (note ? ' · ' + note : ''));
        return readB64(blob.slice(i * size, Math.min((i + 1) * size, blob.size))).then(function (b64) {
          return authed('uploadChunk', uploadId, i, b64);
        }).then(function (r) {
          if (r.done) { if (r.message) { row.done(r.message); toast(r.message, 'ok'); } else row.done('อัปโหลดแล้ว (' + total + ' ช่วง)' + (note ? ' · ' + note : '')); return r; }
          return send(r.next, 0);
        }, function (e) {
          if ((e.code === 'NETWORK' || e.code === 'TIMEOUT' || e.code === 'INTERNAL') && tries < 2) {
            row.set(5 + i / total * 93, 'เครือข่ายขัดข้อง กำลังลองส่งช่วงที่ ' + (i + 1) + ' อีกครั้ง…');
            return new Promise(function (res) { setTimeout(res, 1500 * (tries + 1)); }).then(function () { return send(i, tries + 1); });
          }
          throw e;
        });
      }
      return send(b.next || 0, 0);
    });
  }

  /** บีบอัดรูป: ย่อด้านยาวตามค่าตั้ง (ค่าเริ่มต้น 2560 px) · รูปมีพื้นโปร่งใสใช้ WebP · ใช้ผลบีบอัดเมื่อเล็กลงจริงเท่านั้น */
  function compressImage(file) {
    var maxPx = Number(S.config.settings.IMAGE_MAX_PX || 2560), quality = Number(S.config.settings.IMAGE_QUALITY || 82) / 100;
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      var keepOrig = function () { URL.revokeObjectURL(url); resolve({ blob: file, name: file.name, type: file.type }); };
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, r = Math.min(1, maxPx / Math.max(w, h));
          var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
          var ctx = c.getContext('2d');
          var png = /png|webp/i.test(file.type);
          if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          var type = png ? 'image/webp' : 'image/jpeg';
          c.toBlob(function (blob) {
            if (!blob || blob.size >= file.size * 0.95 || (png && blob.type !== 'image/webp')) { resolve({ blob: file, name: file.name, type: file.type }); return; }
            resolve({ blob: blob, name: file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg'), type: type });
          }, type, quality);
        } catch (e) { keepOrig(); }
      };
      img.onerror = keepOrig;
      img.src = url;
    });
  }

  /** เปิดไฟล์: ไฟล์ใหญ่ดึงทีละช่วงพร้อมแสดงความคืบหน้า · ดูตัวอย่างรูป/วิดีโอ/เสียง/PDF ได้ในหน้า */
  function openFile(btn, f) {
    var prog = el('div', { class: 'up-bar' }, el('i', { style: { width: '3%' } }));
    var txt = el('div', { class: 'muted small', text: 'กำลังเปิดไฟล์…' });
    var closed = false;
    var m = openModal({ title: f.originalName, body: el('div', { class: 'stack' }, txt, prog), onClose: function () { closed = true; if (m && m.url) setTimeout(function () { URL.revokeObjectURL(m.url); }, 1000); } });
    function show(blob, name, mime) {
      if (closed) return;
      var url = URL.createObjectURL(blob); m.url = url;
      var dl = el('a', { class: 'btn btn-primary', text: 'ดาวน์โหลด', attrs: { href: url, download: name } });
      var body;
      if (/^image\//.test(mime) && !/heic|heif|tiff/.test(mime)) body = el('img', { class: 'preview-img', alt: name, attrs: { src: url } });
      else if (/^video\//.test(mime)) body = el('video', { class: 'preview-img', controls: true, attrs: { src: url, playsinline: '' } });
      else if (/^audio\//.test(mime)) body = el('audio', { controls: true, style: { width: '100%' }, attrs: { src: url } });
      else if (mime === 'application/pdf') body = el('div', { class: 'stack' }, el('iframe', { class: 'preview-pdf', attrs: { src: url, title: name } }),
        el('div', { class: 'muted small', text: 'ถ้าไม่เห็นเอกสาร ให้กด "ดาวน์โหลด" หรือ "เปิดแท็บใหม่"' }));
      else body = el('div', { class: 'notice', text: 'ไฟล์ชนิดนี้แสดงตัวอย่างในหน้านี้ไม่ได้ กรุณากดดาวน์โหลด (' + fmtSize(blob.size) + ')' });
      m.setBody(body);
      m.setFoot([el('span', { class: 'muted small spacer', text: 'การเปิดไฟล์ถูกบันทึกในประวัติการใช้งาน · ' + fmtSize(blob.size) }),
        mime === 'application/pdf' ? el('a', { class: 'btn', text: 'เปิดแท็บใหม่', attrs: { href: url, target: '_blank', rel: 'noopener' } }) : null, dl]);
    }
    function b64ToBytes(b64) { var bin = atob(b64), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }
    busy(btn, function () {
      return authed('getAuthorizedFile', f.id).then(function (r) {
        if (!r.chunked) { show(new Blob([b64ToBytes(r.base64)], { type: r.mimeType }), r.name, r.mimeType); return; }
        var parts = [];
        function get(i) {
          if (closed) return Promise.resolve();
          if (i >= r.chunks) { show(new Blob(parts, { type: r.mimeType }), r.name, r.mimeType); return Promise.resolve(); }
          txt.textContent = 'กำลังดาวน์โหลด ' + (i + 1) + '/' + r.chunks + ' ช่วง (' + fmtSize(r.sizeBytes) + ')';
          prog.firstChild.style.width = (3 + i / r.chunks * 97) + '%';
          return authed('getFileChunk', f.id, i).then(function (c) { parts.push(b64ToBytes(c.base64)); return get(i + 1); });
        }
        return get(0);
      }).catch(function (e) { if (!closed) m.setBody(el('div', { class: 'errors', text: e.message || 'เปิดไฟล์ไม่สำเร็จ' })); showError(e); });
    });
  }

  /* ============================== ช่องกรอกพิเศษ: ปฏิทิน พ.ศ. · ค้นหาและเลือกรายการ · เลือกหรือพิมพ์เอง ============================== */

  function pad2(n) { return ('0' + n).slice(-2); }
  function isoOf(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function validIso(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var dt = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); return dt.toISOString().slice(0, 10) === s; }
  function beText(iso) { return validIso(String(iso || '')) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + (Number(iso.slice(0, 4)) + 543) : ''; }
  function todayIso() { var d = new Date(); return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function addYearsIso(iso, n) { // วันสิ้นสุด = วันเริ่ม + n ปี − 1 วัน
    var d = new Date(Date.UTC(+iso.slice(0, 4) + n, +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
    d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
  }
  function addDaysIso(iso, n) { var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  /** อ่านวันที่ที่พิมพ์: 15/11/2569 · 15/11/69 · 15-11-2026 · 2026-11-15 */
  function parseThaiDate(t) {
    t = String(t || '').trim().replace(/[๐-๙]/g, function (c) { return '๐๑๒๓๔๕๖๗๘๙'.indexOf(c); });
    if (!t) return '';
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else { m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(t); if (!m) return null; d = +m[1]; mo = +m[2]; y = +m[3]; if (m[3].length === 2) y += 2500; }
    if (y > 2400) y -= 543;
    var iso = isoOf(y, mo, d);
    return validIso(iso) ? iso : null;
  }

  /** ช่องวันที่ + ปฏิทินภาษาไทย (เลือกปี พ.ศ. ได้) — ค่าที่ส่งเซิร์ฟเวอร์เป็น ค.ศ. ปปปป-ดด-วว */
  function dateField(f, v) {
    var holder = el('input', { type: 'hidden', value: validIso(String(v || '')) ? v : '' });
    var vis = el('input', { class: 'input', value: beText(v), placeholder: 'วว/ดด/ปปปป (พ.ศ.)', attrs: { 'aria-label': f.l, inputmode: 'numeric', autocomplete: 'off' } });
    var btn = el('button', { class: 'btn btn-sm dp-btn', type: 'button', attrs: { title: 'เปิดปฏิทิน', 'aria-label': 'เปิดปฏิทิน ' + f.l } }, svg('M8 2v4|M16 2v4|M3 10h18|M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 16));
    var pop = el('div', { class: 'dp-pop hidden', attrs: { role: 'dialog', 'aria-label': 'ปฏิทิน' } });
    var wrap = el('div', { class: 'dp' }, el('div', { class: 'dp-row' }, vis, btn), pop, holder);
    holder._vis = vis; holder._wrap = wrap;
    function set(iso, silent) {
      holder.value = iso || ''; vis.value = beText(iso); vis.classList.remove('invalid');
      if (!silent) holder.dispatchEvent(new Event('change'));
    }
    holder._set = set;
    vis.addEventListener('change', function () {
      var p = parseThaiDate(vis.value);
      if (p === null) { holder.value = vis.value.trim(); vis.classList.add('invalid'); holder.dispatchEvent(new Event('change')); toast(f.l + ': อ่านวันที่ไม่ได้ ใช้รูปแบบ 15/11/2569 หรือกดปุ่มปฏิทิน', 'warn'); return; }
      set(p);
    });
    var view = null;
    function draw() {
      clear(pop);
      var y = view.y, mo = view.m;
      var mSel = el('select', { class: 'input', attrs: { 'aria-label': 'เดือน' } }, TH_MONTHS.map(function (n, i) { return el('option', { value: String(i), text: n, selected: i === mo }); }));
      var nowBE = new Date().getFullYear() + 543, ySel = el('select', { class: 'input', attrs: { 'aria-label': 'ปี พ.ศ.' } });
      for (var yy = nowBE + 30; yy >= nowBE - 80; yy--) ySel.appendChild(el('option', { value: String(yy - 543), text: String(yy), selected: yy - 543 === y }));
      mSel.addEventListener('change', function () { view.m = +mSel.value; draw(); });
      ySel.addEventListener('change', function () { view.y = +ySel.value; draw(); });
      var nav = function (dlt) { return function () { var t = new Date(view.y, view.m + dlt, 1); view.y = t.getFullYear(); view.m = t.getMonth(); draw(); }; };
      pop.appendChild(el('div', { class: 'dp-head' }, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '‹', attrs: { 'aria-label': 'เดือนก่อน' }, on: { click: nav(-1) } }), mSel, ySel,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '›', attrs: { 'aria-label': 'เดือนถัดไป' }, on: { click: nav(1) } })));
      var grid = el('div', { class: 'dp-grid' }, ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(function (d) { return el('span', { class: 'dp-wd', text: d }); }));
      var first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate(), today = todayIso();
      for (var i = 0; i < first; i++) grid.appendChild(el('span'));
      for (var d = 1; d <= days; d++) (function (d) {
        var iso = isoOf(y, mo + 1, d);
        grid.appendChild(el('button', { type: 'button', class: 'dp-day' + (iso === holder.value ? ' sel' : '') + (iso === today ? ' today' : ''), text: String(d),
          on: { click: function () { set(iso); close(); vis.focus(); } } }));
      })(d);
      pop.appendChild(grid);
      pop.appendChild(el('div', { class: 'dp-foot' },
        el('button', { type: 'button', class: 'btn btn-sm', text: 'วันนี้', on: { click: function () { set(today); close(); } } }),
        el('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'ล้าง', on: { click: function () { set(''); close(); } } }),
        el('span', { class: 'spacer' }), el('span', { class: 'muted small', text: 'ปี พ.ศ.' })));
    }
    function open() {
      var base = validIso(holder.value) ? holder.value : todayIso();
      view = { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
      draw(); pop.classList.remove('hidden');
    }
    function close() { pop.classList.add('hidden'); }
    btn.addEventListener('click', function () { pop.classList.contains('hidden') ? open() : close(); });
    wrap.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !pop.classList.contains('hidden')) { close(); ev.stopPropagation(); } });
    document.addEventListener('mousedown', function (ev) { if (!wrap.contains(ev.target)) close(); });
    return wrap;
  }

  /** ค้นหาและเลือกรายการอ้างอิง (พิมพ์รหัส ชื่อ เลขโฉนด จังหวัด) — ทรัพย์สิน/ที่ดิน แสดงภาระผูกพันทันทีที่เลือก */
  function refPicker(f, v, cat) {
    var holder = el('input', { type: 'hidden', value: v || '' });
    var vis = el('input', { class: 'input', value: v || '', placeholder: 'พิมพ์ค้นหา รหัส ชื่อ ' + (f.ref === 'land' ? 'เลขโฉนด/น.ส.3 ก. จังหวัด' : '') + '…', attrs: { 'aria-label': f.l, autocomplete: 'off' } });
    var clearBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm rp-clear' + (v ? '' : ' hidden'), text: '×', attrs: { title: 'ล้างค่า', 'aria-label': 'ล้างค่า' } });
    var list = el('div', { class: 'rp-list hidden', attrs: { role: 'listbox' } });
    var info = el('div', { class: 'rp-info' });
    var wrap = el('div', { class: 'rp' }, el('div', { class: 'rp-row' }, vis, clearBtn), list, info, holder);
    holder._vis = vis; holder._wrap = wrap;
    // ผู้มีสิทธิ์เพิ่ม/แก้ไขหมวดของฟอร์ม เลือกรายการอ้างอิงได้แม้ไม่ได้ดูหมวดนั้น (ค่าตั้ง REF_LOOKUP_FOR_EDITORS)
    var canRead = !!S.config.schemas[f.ref] || (!!cat && S.config.settings.REF_LOOKUP_FOR_EDITORS !== 'false' && (can(cat, 'create') || can(cat, 'update')));
    if (!canRead) { vis.disabled = true; vis.title = 'ไม่มีสิทธิ์ดูหมวดนี้'; return wrap; }
    var seq = 0, timer, items = [];
    function choose(it) {
      holder.value = it ? it.id : ''; vis.value = it ? it.label : ''; vis.classList.remove('invalid');
      list.classList.add('hidden'); clearBtn.classList.toggle('hidden', !it);
      holder.dispatchEvent(new Event('change'));
      if (it && (f.ref === 'land' || f.ref === 'assets')) showLinks(f.ref, it.id); else clear(info);
    }
    holder._choose = function (id) { if (!id) { choose(null); return; } authed('getLookupOptions', f.ref, id, cat || '').then(function (r) { var it = r.items.filter(function (x) { return x.id === id; })[0]; choose(it || { id: id, label: id }); }); };
    function search(term) {
      var my = ++seq;
      clear(list).appendChild(el('div', { class: 'muted small', style: { padding: '8px 10px' }, text: 'กำลังค้นหา…' }));
      list.classList.remove('hidden');
      authed('getLookupOptions', f.ref, term, cat || '').then(function (r) {
        if (my !== seq) return;
        items = r.items.slice(0, 50);
        clear(list);
        var qa = S.config.quickAdd && S.config.quickAdd[f.ref];
        var addBtn = qa && cat && qa.forCats.indexOf(cat) !== -1 ? el('button', { type: 'button', class: 'rp-item rp-add', on: { mousedown: function (ev) { ev.preventDefault(); list.classList.add('hidden'); quickAddModal(f.ref, cat, qa, vis.value.trim(), choose); } } },
          el('div', { class: 'rp-t' }, el('span', { text: '+ เพิ่ม' + qa.label + 'ใหม่' + (term ? ' "' + term + '"' : '') }))) : null;
        if (!items.length) { list.appendChild(el('div', { class: 'muted small', style: { padding: '8px 10px' }, text: term ? 'ไม่พบรายการที่ตรงกับ "' + term + '"' : 'ยังไม่มีรายการ' })); if (addBtn) list.appendChild(addBtn); return; }
        items.forEach(function (it) {
          list.appendChild(el('button', { type: 'button', class: 'rp-item', attrs: { role: 'option' }, on: { mousedown: function (ev) { ev.preventDefault(); choose(it); } } },
            el('div', { class: 'rp-t' }, el('span', { text: it.label }), it.status ? statusBadge(it.status) : null),
            it.sub ? el('div', { class: 'muted small', text: it.sub }) : null));
        });
        if (r.truncated || r.items.length > 50) list.appendChild(el('div', { class: 'muted small', style: { padding: '6px 10px' }, text: 'พิมพ์เพิ่มเพื่อค้นให้แคบลง' }));
        if (addBtn) list.appendChild(addBtn);
      }).catch(function (e) { if (my === seq) clear(list).appendChild(el('div', { class: 'muted small', style: { padding: '8px 10px' }, text: e.message || 'ค้นหาไม่สำเร็จ' })); });
    }
    vis.addEventListener('input', function () { holder.value = ''; clearBtn.classList.add('hidden'); clear(info); clearTimeout(timer); timer = setTimeout(function () { search(vis.value.trim()); }, 250); });
    vis.addEventListener('focus', function () { if (!holder.value) search(vis.value.trim()); });
    vis.addEventListener('blur', function () { setTimeout(function () { list.classList.add('hidden'); if (!holder.value && vis.value.trim()) vis.classList.add('invalid'); }, 150); });
    vis.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); if (items[0] && !list.classList.contains('hidden')) choose(items[0]); }
      if (ev.key === 'Escape' && !list.classList.contains('hidden')) { list.classList.add('hidden'); ev.stopPropagation(); }
    });
    clearBtn.addEventListener('click', function () { choose(null); vis.focus(); });
    if (v) authed('getLookupOptions', f.ref, v, cat || '').then(function (r) {
      var it = r.items.filter(function (x) { return x.id === v; })[0];
      if (it && holder.value === v) { vis.value = it.label; if (f.ref === 'land' || f.ref === 'assets') showLinks(f.ref, v); }
    }).catch(function () { /* คงรหัสเดิม */ });
    function showLinks(cat, id) {
      clear(info).appendChild(el('div', { class: 'muted small', text: 'กำลังตรวจภาระผูกพัน…' }));
      authed('getPropertyLinks', cat, id).then(function (d) { if (holder.value === id) clear(info).appendChild(linksSummary(d, true)); })
        .catch(function () { clear(info); });
    }
    return wrap;
  }

  /** v1.8.1 เพิ่มลูกค้าใหม่จากช่องค้นหาในฟอร์ม (ผู้แก้ไขใช้ได้เมื่อผู้ดูแลเปิด REF_QUICK_ADD_FOR_EDITORS) */
  function quickAddModal(refCat, cat, qa, term, onDone) {
    var rid = newRid();
    var inputs = {};
    var rows = (qa.fields || []).map(function (f) {
      var v = f.k === qa.prefill ? (term || '') : (f.t === 'select' && f.req && f.opts && f.opts.length ? f.opts[0] : '');
      var inp;
      if (f.t === 'select') inp = selectInput(Object.assign({}, f, { ph: 'เลือก' + f.l }), v, 'create');
      else if (f.t === 'date') inp = el('input', { class: 'input', type: 'date', attrs: { 'aria-label': f.l } });
      else inp = el('input', { class: 'input', value: v, maxLength: f.max || 200, placeholder: f.ph || (f.auto ? 'เว้นว่างให้ระบบออกเลข' : 'กรอก' + f.l), attrs: { 'aria-label': f.l, type: f.t === 'phone' ? 'tel' : 'text' } });
      inputs[f.k] = inp;
      return el('div', { class: 'field' }, el('label', null, f.l, f.req ? el('span', { class: 'req', text: '*' }) : null), inp._wrap || inp);
    });
    var errBox = el('div');
    var save = el('button', { class: 'btn btn-primary', text: 'เพิ่มและเลือก' });
    var m = openModal({ title: 'เพิ่ม' + qa.label + 'ใหม่', size: 'sm', sticky: true,
      body: el('div', { class: 'stack' }, errBox, rows,
        el('div', { class: 'muted small', text: 'กรอกเฉพาะข้อมูลหลัก ข้อมูลอื่นเพิ่มภายหลังได้ที่หมวด "' + qa.label + '" (ตามสิทธิ์) · ระบบตรวจข้อมูลซ้ำก่อนบันทึก' })),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save] });
    setTimeout(function () { var first = inputs[qa.prefill] || null; if (first && first.focus) first.focus(); }, 50);
    save.addEventListener('click', function () {
      clear(errBox);
      var data = {}, missing = [];
      (qa.fields || []).forEach(function (f) {
        var inp = inputs[f.k]; var v = String(inp.value || '').trim();
        (inp._vis || inp).classList.toggle('invalid', f.req && !v);
        if (f.req && !v) missing.push(f.l);
        if (v) data[f.k] = v;
      });
      if (missing.length) { showErrors(errBox, 'กรุณากรอกข้อมูลที่จำเป็น', missing); return; }
      busy(save, function () {
        return authed('quickAddRef', refCat, cat, data, rid).then(function (r) {
          saveCustomOptions(refCat, qa.fields, inputs);
          toast('เพิ่ม' + qa.label + ' "' + r.item.label + '" และเลือกให้แล้ว', 'ok'); m.close(); onDone(r.item);
        }).catch(function (e) { rid = newRid(); showErrors(errBox, e.message, e.details || []); });
      });
    });
  }

  /**
   * v1.8.4 ช่องแบบเลือก + "พิมพ์เพิ่มใหม่" เมื่อไม่มีในรายการ (ช่องที่อนุญาต)
   * ผู้ดูแลระบบหลักติ๊ก "เพิ่มเข้ารายการตัวเลือกถาวร" ได้ (ระบบบันทึกลงค่าตั้ง หลังบันทึกรายการสำเร็จ)
   */
  function selectInput(f, v, mode) {
    var opts = (f.opts || []).slice();
    if (!f.custom) {
      if (v && opts.indexOf(v) === -1) opts.unshift(v);
      var s0 = el('select', { class: 'input', attrs: { 'aria-label': f.l } }, el('option', { value: '', text: '— ' + (f.ph || 'เลือก' + f.l) + ' —' }),
        opts.map(function (o) { return el('option', { value: o, text: o, selected: o === v }); }));
      return s0;
    }
    var known = !v || opts.indexOf(v) !== -1;
    var holder = el('input', { type: 'hidden', value: v || '' });
    var sel = el('select', { class: 'input', attrs: { 'aria-label': f.l } }, el('option', { value: '', text: '— ' + (f.ph || 'เลือก' + f.l) + ' —' }),
      opts.map(function (o) { return el('option', { value: o, text: o, selected: o === v }); }),
      el('option', { value: '__other', text: '+ พิมพ์เพิ่มใหม่ (ไม่มีในรายการ)', selected: !known }));
    var other = el('input', { class: 'input' + (known ? ' hidden' : ''), value: known ? '' : v, maxLength: f.max || 120, placeholder: 'พิมพ์' + f.l + 'ใหม่', attrs: { 'aria-label': f.l + ' (พิมพ์ใหม่)' } });
    var keep = el('input', { type: 'checkbox', checked: true });
    var keepRow = canG('manageSettings') ? el('label', { class: 'check small' + (known ? ' hidden' : '') }, keep, 'เพิ่มเข้ารายการตัวเลือกถาวร (ผู้ใช้อื่นเลือกได้ด้วย)') : null;
    function sync() { holder.value = sel.value === '__other' ? other.value.trim() : sel.value; }
    sel.addEventListener('change', function () {
      var o = sel.value === '__other';
      other.classList.toggle('hidden', !o); if (keepRow) keepRow.classList.toggle('hidden', !o);
      if (o) other.focus(); sync(); holder.dispatchEvent(new Event('change'));
    });
    other.addEventListener('input', sync);
    holder._vis = sel; holder._wrap = el('div', { class: 'stack-sm' }, sel, other, keepRow, holder);
    holder._isCustom = function () { return sel.value === '__other' && !!other.value.trim(); };
    holder._keep = function () { return !!keepRow && keep.checked; };
    holder.focus = function () { sel.focus(); };
    return holder;
  }

  /** หลังบันทึกสำเร็จ: ค่าที่พิมพ์ใหม่ + ติ๊กเก็บถาวร → เพิ่มเข้ารายการตัวเลือก (เฉพาะผู้ดูแลระบบหลัก) */
  function saveCustomOptions(cat, fields, inputs) {
    if (!canG('manageSettings')) return;
    (fields || []).forEach(function (f) {
      var inp = inputs[f.k];
      if (!inp || !inp._isCustom || !inp._isCustom() || !inp._keep()) return;
      authed('addSelectOption', cat, f.k, inp.value, newRid()).then(function (r) {
        if (r.added) { toast('เพิ่ม "' + inp.value + '" เข้ารายการ ' + f.l + ' แล้ว', 'ok'); reloadConfig().catch(function () {}); }
      }).catch(function () { /* ค่าในรายการยังบันทึกแล้ว */ });
    });
  }

  /** ช่องข้อความที่มีรายการให้เลือก และพิมพ์เองได้ (เช่น ผู้ถือกรรมสิทธิ์ ผู้ให้เช่า ลักษณะการเช่า) */
  var comboSeq = 0;
  function comboInput(f, v, cat) {
    var id = 'combo' + (++comboSeq);
    var dl = el('datalist', { id: id });
    var inp = el('input', { class: 'input', value: v || '', maxLength: f.max || 255, placeholder: f.ph || 'เลือกจากรายการ หรือพิมพ์เอง', attrs: { 'aria-label': f.l, list: id, autocomplete: 'off' } });
    var loaded = false;
    function fill(list) { clear(dl); list.forEach(function (x) { dl.appendChild(el('option', { value: x.value || x, label: x.group || '' })); }); }
    function load() {
      if (loaded) return; loaded = true;
      if (f.combo === 'list') { fill(f.comboOpts || []); return; }
      authed('getComboOptions', cat, f.k).then(function (r) { fill(r.items); }).catch(function () { loaded = false; });
    }
    if (f.combo === 'list') load();
    inp.addEventListener('focus', load);
    var wrap = el('div', null, inp, dl);
    inp._wrap = wrap;
    return inp;
  }

  /** สรุปภาระผูกพัน (ใช้ทั้งในฟอร์มและหน้ารายละเอียด) */
  function linksSummary(d, compact) {
    var box = el('div', { class: 'links-box ' + (d.hasBurden ? 'has' : 'none') });
    if (!d.summary.length) box.appendChild(el('div', { class: 'lk-ok', text: '✓ ไม่พบภาระผูกพันที่ยังค้างอยู่ (ตามหมวดที่คุณมีสิทธิ์ดู)' }));
    else box.appendChild(el('div', { class: 'lk-head' }, el('strong', { text: 'มีภาระ/รายการที่เกี่ยวข้อง: ' }),
      d.summary.map(function (x) { return el('span', { class: 'badge ' + (x.level === 'urgent' ? 'b-overdue' : x.level === 'important' ? 'b-soon' : 'b-progress'), text: x.text }); })));
    var act = [];
    d.groups.forEach(function (g) { g.items.forEach(function (it) { if (it.active || !compact) act.push({ g: g, it: it }); }); });
    if (act.length) {
      var rows = el('div', { class: 'lk-rows' }, act.slice(0, compact ? 6 : 200).map(function (x) {
        return el('div', { class: 'lk-row' + (x.it.active ? '' : ' closed'), attrs: { role: 'button', tabindex: 0 }, on: { click: function () { openDetail(x.g.category, x.it.id); } } },
          el('span', { class: 'lk-cat', text: x.g.label }),
          el('span', { class: 'lk-main' }, el('strong', { text: x.it.code }), x.it.kind ? ' · ' + x.it.kind : '', x.it.period ? el('span', { class: 'muted', text: ' · ' + x.it.period }) : null),
          dueBadge(x.it.due), statusBadge(x.it.status));
      }));
      box.appendChild(rows);
      if (compact && act.length > 6) box.appendChild(el('div', { class: 'muted small', text: '…และอีก ' + (act.length - 6) + ' รายการ (ดูได้ในแท็บ "ภาระผูกพัน" ของรายการ)' }));
    }
    return box;
  }

  function linksPane(pane, cat, rec) {
    pane.appendChild(el('div', { class: 'skeleton' }));
    authed('getPropertyLinks', cat, rec.id).then(function (d) {
      clear(pane);
      var actions = el('div', { class: 'row', style: { marginBottom: '10px' } });
      if (!rec.isDeleted && can('contracts', 'create')) actions.appendChild(el('button', { class: 'btn btn-sm btn-primary', on: { click: function () { newContractFrom(cat, rec); } } }, svg(ICON.contracts, 16), 'ทำสัญญาใหม่'));
      if (!rec.isDeleted && can('sales', 'create') && rec.status !== 'ขายแล้ว') actions.appendChild(el('button', { class: 'btn btn-sm btn-gold', on: { click: function () { saleFrom(cat, rec); } } }, svg(ICON.sales, 16), 'บันทึกการขาย'));
      pane.appendChild(actions);
      pane.appendChild(linksSummary(d, false));
      if (!d.groups.length) pane.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีรายการอื่นที่ผูกกับรายการนี้' }));
    }).catch(function (e) { clear(pane).appendChild(el('div', { class: 'empty', text: e.message })); });
  }

  function closeTopModal() { if (modals.length) modals[modals.length - 1].close(); }
  function newContractFrom(cat, rec) {
    closeTopModal();
    var d = { status: 'มีผลบังคับ', startDate: todayIso() };
    if (cat === 'land') { d.landId = rec.id; if (rec.assetId) d.assetId = rec.assetId; } else d.assetId = rec.id;
    if (rec.ownerName) d.ownerName = rec.ownerName;
    openForm('contracts', 'create', d);
  }
  function saleFrom(cat, rec) {
    closeTopModal();
    var d = { status: 'ขายแล้ว', transferDate: todayIso(), saleType: 'ขายขาด' };
    if (cat === 'land') { d.landId = rec.id; if (rec.assetId) d.assetId = rec.assetId; } else d.assetId = rec.id;
    if (rec.askingPrice) d.askingPrice = rec.askingPrice;
    toast('บันทึกการขาย: เมื่อสถานะเป็น "ขายแล้ว" ระบบจะปรับสถานะทรัพย์สิน/ที่ดินเป็น "ขายแล้ว" ให้อัตโนมัติ', 'ok');
    openForm('sales', 'create', d);
  }
  /** ต่อสัญญา / ขยายอายุ: สร้างสัญญาใหม่จากข้อมูลเดิม (วันเริ่ม = วันถัดจากวันสิ้นสุดเดิม · ระยะเวลาเท่าเดิม) */
  function renewContract(rec) {
    closeTopModal();
    var schema = S.config.schemas.contracts, d = {};
    schema.fields.forEach(function (f) {
      if (['contractNo', 'contractYear', 'status', 'renewalOf', 'notes'].indexOf(f.k) !== -1) return;
      if (rec._masked && rec._masked.indexOf(f.k) !== -1) return;
      if (rec[f.k] !== '' && rec[f.k] !== undefined && rec[f.k] !== null) d[f.k] = rec[f.k];
    });
    var start = validIso(String(rec.endDate || '')) ? addDaysIso(rec.endDate, 1) : todayIso();
    var years = 1;
    if (validIso(String(rec.startDate || '')) && validIso(String(rec.endDate || ''))) years = Math.max(1, Math.round((Date.parse(rec.endDate) - Date.parse(rec.startDate)) / (365.25 * 86400000)));
    d.startDate = start; d.endDate = addYearsIso(start, years);
    d.renewalOf = rec.id; d.status = 'มีผลบังคับ';
    d.notes = 'ต่อ/ขยายจากสัญญา ' + (rec.contractNo || rec.id);
    openForm('contracts', 'create', d);
  }

  /* ============================== ฟอร์มเพิ่ม/แก้ไข ============================== */

  /* ============================== แจ้งนัดประชุม / แจ้งงาน ============================== */

  /** แท็บ "หนี้ · สัญญา · รับชำระ" ในหน้าลูกค้า — ข้อมูลครบของลูกค้ารายนี้ ตามสิทธิ์ */
  function customerDebtPane(pane, rec, m) {
    pane.appendChild(el('div', { class: 'page-loading' }, el('div', { class: 'loader' })));
    authed('getCustomerOverview', rec.id).then(function (d) {
      clear(pane);
      var go = function (cat, id) { return function () { m.close(); openDetail(cat, id); }; };
      var add = function (cat, preset, label) {
        return can(cat, 'create') && !rec.isDeleted ? el('button', { class: 'btn btn-sm btn-primary', on: { click: function () { m.close(); openForm(cat, 'create', preset); } } }, svg(ICON.plus, 14), label) : null;
      };
      if (d.totals) {
        var t = d.totals;
        pane.appendChild(el('div', { class: 'stats', style: { marginBottom: '14px' } },
          el('div', { class: 'card stat' }, el('div', { class: 'label', text: 'หนี้ทั้งหมด' }), el('div', { class: 'value', text: fmtNum(t.debtCount) }), el('div', { class: 'note', text: 'ยังไม่ปิด ' + t.openCount + ' รายการ' + (t.overdue ? ' · เกินกำหนด ' + t.overdue : '') })),
          el('div', { class: 'card stat' }, el('div', { class: 'label', text: 'เงินต้นรวม' }), el('div', { class: 'value', text: fmtMoney(t.principal) })),
          el('div', { class: 'card stat green' }, el('div', { class: 'label', text: 'รับชำระแล้ว (หนี้)' }), el('div', { class: 'value', text: fmtMoney(t.paid) })),
          el('div', { class: 'card stat ' + (t.remaining > 0 ? 'orange' : 'green') }, el('div', { class: 'label', text: 'คงเหลือ (เงินต้นหักชำระ)' }), el('div', { class: 'value', text: fmtMoney(t.remaining) }), el('div', { class: 'note', text: 'ยังไม่รวมดอกเบี้ย' }))));
      } else if (!d.financial) pane.appendChild(el('div', { class: 'notice', style: { marginBottom: '12px' }, text: 'ยอดเงินถูกซ่อนตามสิทธิ์ของคุณ' }));

      var section = function (title, items, addBtn, row, empty) {
        pane.appendChild(el('div', { class: 'section' }, el('div', { class: 'row' }, el('h3', { style: { margin: 0 }, text: title + ' (' + items.length + ')' }), el('div', { class: 'spacer' }), addBtn),
          items.length ? el('div', { class: 'list-rows', style: { marginTop: '8px' } }, items.map(row)) : el('div', { class: 'empty', text: empty })));
      };
      if (d.canDebts) section('หนี้', d.debts, add('debts', { customerId: rec.id }, 'เพิ่มหนี้'), function (x) {
        return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: go('debts', x.id) } },
          el('div', { class: 'main-t' }, el('div', { class: 't1', text: (x.debtorCode || x.id) + ' · สัญญา ' + (x.contractNo || '–') + (x.debtType ? ' · ' + x.debtType : '') }),
            el('div', { class: 't2', text: (x.principal !== '' ? 'เงินต้น ' + fmtMoney(x.principal) : 'เงินต้น (ซ่อน)') + (x._paidTotal !== undefined ? ' · ชำระแล้ว ' + fmtMoney(x._paidTotal) + ' · คงเหลือ ' + fmtMoney(x._principalLessPaid) : '') + (x.dueDate ? ' · ครบกำหนด ' + fmtDate(x.dueDate) : '') })),
          el('div', { class: 'row' }, dueBadge(x._due), statusBadge(x.status),
            can('payments', 'create') && ['เสร็จสิ้น', 'ยกเลิก'].indexOf(x.status) === -1 ? el('button', { class: 'btn btn-sm', on: { click: function (ev) { ev.stopPropagation(); m.close(); openForm('payments', 'create', { debtId: x.id, paymentType: 'ชำระหนี้' }); } } }, 'รับชำระ') : null));
      }, 'ยังไม่มีหนี้ของลูกค้ารายนี้');
      if (d.canContracts) section('สัญญาที่เป็นคู่สัญญา', d.contracts, add('contracts', { partyCustomerId: rec.id, partyName: rec.fullName || '' }, 'เพิ่มสัญญา'), function (x) {
        return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: go('contracts', x.id) } },
          el('div', { class: 'main-t' }, el('div', { class: 't1', text: (x.contractNo || x.id) + ' · ' + (x.contractType || '') + (x.usePurpose ? ' (' + x.usePurpose + ')' : '') }),
            el('div', { class: 't2', text: fmtDate(x.startDate) + ' – ' + fmtDate(x.endDate) + (x.amount !== '' ? ' · ' + fmtMoney(x.amount) : '') })),
          el('div', { class: 'row' }, dueBadge(x._due), statusBadge(x.status),
            can('payments', 'create') && ['ยกเลิก', 'สิ้นสุด'].indexOf(x.status) === -1 ? el('button', { class: 'btn btn-sm', on: { click: function (ev) { ev.stopPropagation(); m.close(); openForm('payments', 'create', { contractId: x.id, paymentType: 'ค่าเช่า' }); } } }, 'รับชำระ') : null));
      }, 'ไม่มีสัญญาที่ผูกกับลูกค้ารายนี้ (ช่อง "คู่สัญญาในทะเบียนลูกค้า" ในสัญญา)');
      if (d.canPayments) section('การรับชำระ', d.payments, null, function (x) {
        return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: go('payments', x.id) } },
          el('div', { class: 'main-t' }, el('div', { class: 't1', text: fmtDate(x.paymentDate) + ' · ' + (x.amount !== '' ? fmtMoney(x.amount) : 'จำนวนเงิน (ซ่อน)') }),
            el('div', { class: 't2', text: (x.paymentCode || x.id) + (x.paymentType ? ' · ' + x.paymentType : '') + (x.method ? ' · ' + x.method : '') + (x.receiptNo ? ' · ใบเสร็จ ' + x.receiptNo : '') })),
          statusBadge(x.status));
      }, 'ยังไม่มีการรับชำระ');
      if (!d.canDebts && !d.canContracts && !d.canPayments) pane.appendChild(el('div', { class: 'empty', text: 'บัญชีของคุณไม่มีสิทธิ์ดูหนี้ สัญญา หรือการรับชำระ' }));
    }).catch(function (e) { clear(pane).appendChild(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
  }

  function loadMeetingCfg(force) {
    if (S.meetingCfg && !force) return Promise.resolve(S.meetingCfg);
    return authed('getMeetingConfig').then(function (c) { S.meetingCfg = c; return c; });
  }

  /** หมายเหตุใต้ฟอร์ม: พื้นขาว ตัวอักษรสีน้ำเงิน · LINE ID บอทจริงจากเซิร์ฟเวอร์ */
  function meetingNoteBox() {
    var box = el('div', { class: 'mtg-note', attrs: { role: 'note' }, text: 'หมายเหตุ: กำลังโหลด LINE ID ของบอท…' });
    loadMeetingCfg().then(function (c) {
      clear(box);
      box.appendChild(document.createTextNode(c.note));
      box.appendChild(el('div', { class: 'mtg-note-ex', text: 'ตัวอย่างข้อความ: ' + c.example }));
    }).catch(function () { box.textContent = 'หมายเหตุ: กรณีวันและเวลาที่กำหนดไม่สะดวก สามารถแจ้งเปลี่ยนแปลงผ่าน LINE ของระบบ พร้อมแจ้งเหตุผลและเสนอวัน เวลาใหม่ที่สะดวก ขอบคุณครับ/ค่ะ'; });
    return box;
  }

  /** ส่งแจ้งเตือน LINE — แสดงผลจริงจากเซิร์ฟเวอร์ (สำเร็จ / ไม่พบกลุ่ม / ส่งไม่สำเร็จ / ส่งซ้ำ) */
  function sendMeeting(id) {
    return authed('sendMeetingNotice', id, newRid()).then(function (r) {
      toast(r.message, r.sent ? 'ok' : (r.status === 'DUPLICATE' ? 'warn' : 'err'));
      return r;
    }).catch(function (e) { showError(e); throw e; });
  }

  function cancelMeetingUi(m, rec) {
    confirmBox({ title: 'ยกเลิกนัด', danger: true, okText: 'ยกเลิกนัด', reasonLabel: 'เหตุผลการยกเลิก (จำเป็น)',
      message: Number(rec.sendCount || 0) > 0 ? 'นัดนี้เคยส่ง LINE แล้ว ระบบจะส่งแจ้งยกเลิกถึงกลุ่มเดิมให้อัตโนมัติ\nยืนยันยกเลิกนัดหรือไม่?' : 'นัดนี้ยังไม่เคยส่ง LINE ระบบจะเปลี่ยนสถานะเป็น "ยกเลิก" เท่านั้น\nยืนยันหรือไม่?' })
      .then(function (r) {
        if (!r.ok) return;
        if (!r.reason) { toast('กรุณาระบุเหตุผลการยกเลิก', 'warn'); return; }
        return authed('cancelMeeting', rec.id, r.reason, newRid()).then(function (res) {
          toast(res.message, /ไม่สำเร็จ|ไม่พบกลุ่ม/.test(res.message) ? 'warn' : 'ok');
          m.close(); refreshCurrent();
        }).catch(showError);
      });
  }

  function reqWhen(q) {
    return (q.proposedDate ? fmtDate(q.proposedDate) : 'วันเดิม') + (q.proposedStart ? ' · ' + q.proposedStart + (q.proposedEnd ? '–' + q.proposedEnd : '') + ' น.' : '');
  }

  /** แท็บ "คำขอเลื่อนนัด" ในหน้ารายละเอียด — อนุมัติแล้วระบบจึงเปลี่ยนนัดจริงและแจ้งกลุ่ม */
  function requestsPane(pane, cat, rec, m) {
    pane.appendChild(el('div', { class: 'page-loading' }, el('div', { class: 'loader' })));
    authed('listMeetingRequests', rec.id).then(function (d) {
      clear(pane);
      pane.appendChild(el('div', { class: 'muted small', style: { marginBottom: '10px' }, text: 'คำขอจาก LINE เป็นเพียง "คำขอ" — นัดจะเปลี่ยนจริงเมื่อผู้จัด ผู้บริหาร หรือผู้ดูแลระบบกดอนุมัติ แล้วระบบจะแจ้งกลุ่มเดิมให้อัตโนมัติ' }));
      if (!d.items.length) { pane.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีคำขอเลื่อน/เปลี่ยนนัด' })); return; }
      pane.appendChild(el('div', { class: 'list-rows' }, d.items.map(function (q) {
        var acts = null;
        if (d.canDecide && q.status === 'รอพิจารณา' && rec.status !== 'ยกเลิก') {
          var decide = function (approve) {
            return function (ev) {
              var b = ev.currentTarget;
              confirmBox({ title: approve ? 'อนุมัติคำขอเลื่อนนัด' : 'ไม่อนุมัติคำขอ', okText: approve ? 'อนุมัติและแจ้งกลุ่ม' : 'ไม่อนุมัติ', danger: !approve, reasonLabel: 'หมายเหตุ (ไม่บังคับ)',
                message: approve ? 'เปลี่ยนนัดเป็น ' + reqWhen(q) + '\nระบบจะบันทึกการเปลี่ยนแปลงและส่งแจ้งกลุ่ม LINE เดิม' : 'นัดหมายจะคงเดิม' })
                .then(function (r) {
                  if (!r.ok) return;
                  return busy(b, function () {
                    return authed('decideMeetingRequest', q.id, approve, r.reason, newRid()).then(function (res) {
                      toast(res.message, /ไม่สำเร็จ|ไม่พบกลุ่ม/.test(res.message) ? 'warn' : 'ok'); m.close(); refreshCurrent(); openDetail(cat, rec.id, 'requests');
                    }).catch(showError);
                  });
                });
            };
          };
          acts = el('div', { class: 'row' }, el('button', { class: 'btn btn-sm btn-primary', text: 'อนุมัติ', on: { click: decide(true) } }),
            el('button', { class: 'btn btn-sm', text: 'ไม่อนุมัติ', on: { click: decide(false) } }));
        }
        return el('div', { class: 'lrow', style: { cursor: 'default', alignItems: 'flex-start' } },
          el('div', { class: 'main-t' },
            el('div', { class: 't1', text: 'เสนอ: ' + reqWhen(q) }),
            el('div', { class: 't2', text: 'เหตุผล: ' + q.reason }),
            el('div', { class: 't2', text: q.requesterName + ' · ' + q.source + ' · ' + fmtTs(q.createdAt) + (q.decidedAt ? ' · พิจารณาโดย ' + (q.decidedBy || '–') + ' ' + fmtTs(q.decidedAt) : '') + (q.decisionNote ? ' · ' + q.decisionNote : '') }),
            q.rawText ? el('div', { class: 't2 muted', text: 'ข้อความเดิม: ' + q.rawText }) : null,
            q.notifyResult ? el('div', { class: 't2 muted', text: q.notifyResult }) : null,
            acts),
          el('span', { class: 'badge ' + (q.status === 'อนุมัติ' ? 'b-done' : q.status === 'ไม่อนุมัติ' ? 'b-cancel' : 'b-soon'), text: q.status }));
      })));
    }).catch(function (e) { clear(pane).appendChild(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
  }

  function pendingRequestsModal() {
    var m = openModal({ title: 'คำขอเลื่อน/เปลี่ยนนัดที่รอพิจารณา', body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    authed('listMeetingRequests', '').then(function (d) {
      if (!d.items.length) { m.setBody(el('div', { class: 'empty', text: 'ไม่มีคำขอรอพิจารณา' })); return; }
      m.setBody(el('div', { class: 'list-rows' }, d.items.map(function (q) {
        return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: function () { m.close(); openDetail('meetings', q.meetingId, 'requests'); } } },
          el('div', { class: 'main-t' }, el('div', { class: 't1', text: q.meetingCode + ' · เสนอ ' + reqWhen(q) }), el('div', { class: 't2', text: q.reason + ' · ' + fmtTs(q.createdAt) })),
          el('span', { class: 'badge b-soon', text: q.status }));
      })));
    }).catch(function (e) { m.setBody(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
  }

  /** ผูกบัญชี LINE ส่วนตัว: เพิ่มบอทเป็นเพื่อน → พิมพ์ "ผูกบัญชี 123456" ในแชตส่วนตัว */
  function lineLinkModal() {
    var m = openModal({ title: 'รับแจ้งเตือน LINE ส่วนตัว', size: 'sm', body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    authed('createLineLinkCode').then(function (r) {
      var codeBox = el('div', { class: 'code-box mono', text: r.command });
      var copy = el('button', { class: 'btn btn-sm', text: 'คัดลอกข้อความ', on: { click: function () {
        var done = function () { toast('คัดลอกแล้ว', 'ok'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.command).then(done, function () { toast('คัดลอกไม่ได้ กรุณาพิมพ์เอง', 'warn'); });
        else toast('คัดลอกไม่ได้ กรุณาพิมพ์เอง', 'warn');
      } } });
      m.setBody(el('div', { class: 'stack' },
        r.linked ? el('div', { class: 'notice', text: 'บัญชีนี้ผูก LINE ไว้แล้ว — ทำตามขั้นตอนอีกครั้งหากต้องการเปลี่ยนเป็น LINE บัญชีอื่น' }) : null,
        el('ol', { class: 'steps' },
          el('li', null, 'เพิ่มบอท ', el('b', { text: r.bot || '(ผู้ดูแลยังไม่ได้ตั้ง LINE ID บอท)' }), ' เป็นเพื่อนใน LINE',
            r.addFriendUrl ? [' — ', el('a', { href: r.addFriendUrl, target: '_blank', rel: 'noopener noreferrer', text: 'เปิดหน้าเพิ่มเพื่อน' })] : null),
          el('li', { text: 'พิมพ์ข้อความด้านล่างในแชตส่วนตัวกับบอท ภายใน ' + r.minutes + ' นาที (ห้ามพิมพ์ในกลุ่ม)' })),
        el('div', { class: 'row' }, codeBox, copy),
        el('div', { class: 'muted small', text: 'บอทจะตอบว่า "ผูกบัญชีเรียบร้อย" · LINE ส่งข้อความส่วนตัวได้เฉพาะผู้ที่เพิ่มบอทเป็นเพื่อนและไม่ได้บล็อกบอท' }),
        r.linked ? notifyToggle(r.lineNotify) : null));
      var foot = [el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); S.meetingCfg = null; } } })];
      if (r.linked) foot.unshift(el('button', { class: 'btn btn-danger', text: 'ยกเลิกการผูก LINE', on: { click: function (ev) {
        var b = ev.currentTarget;
        busy(b, function () { return authed('unlinkLine', newRid()).then(function () { toast('ยกเลิกการผูก LINE แล้ว', 'ok'); m.close(); S.meetingCfg = null; refreshCurrent(); }).catch(showError); });
      } } }));
      m.setFoot(foot);
    }).catch(function (e) { m.setBody(el('div', { class: 'notice', text: e.message || 'ขอรหัสไม่สำเร็จ' })); });
  }

  /** v1.8 สวิตช์ "รับแจ้งเตือนทาง LINE ส่วนตัว" ของผู้ใช้เอง (ระบบเคารพค่านี้ทุกครั้งก่อนส่ง) */
  function notifyToggle(on) {
    var chk = el('input', { type: 'checkbox', checked: on !== false });
    chk.addEventListener('change', function () {
      chk.disabled = true;
      authed('setMyLineNotify', chk.checked, newRid()).then(function (x) { toast(x.lineNotify === 'on' ? 'เปิดรับแจ้งเตือน LINE ส่วนตัวแล้ว' : 'ปิดรับแจ้งเตือน LINE ส่วนตัวแล้ว', 'ok'); })
        .catch(function (e) { chk.checked = !chk.checked; showError(e); }).finally(function () { chk.disabled = false; });
    });
    return el('div', { class: 'notice' }, el('label', { class: 'check' }, chk, 'รับแจ้งเตือนนัดประชุมทาง LINE ส่วนตัว'),
      el('div', { class: 'muted small', text: 'ใช้เฉพาะผู้บริหาร/ผู้ดูแลระบบที่ได้รับอนุญาต · ส่งในช่วง 07:00–08:00 น.' }));
  }

  /** แถบด้านบนหน้ารายการแจ้งนัด: คำขอรอพิจารณา · หมวดที่ยังไม่มีกลุ่ม LINE · ผูก LINE ส่วนตัว */
  function meetingBanner() {
    var box = el('div', { class: 'stack section' });
    loadMeetingCfg(true).then(function (c) {
      if (c.sheetReady === false) box.appendChild(el('div', { class: 'notice gold', text: 'ยังไม่มีชีต Meetings — ผู้ดูแลระบบหลักกด "อัปเดตโครงสร้างชีต" (ตั้งค่าระบบ → การดำเนินการ) ก่อนเริ่มใช้งานเมนูนี้' }));
      if (c.canAnnounce && c.pendingRequests) box.appendChild(el('div', { class: 'notice gold row' }, el('span', { text: 'มีคำขอเลื่อน/เปลี่ยนนัดจาก LINE รอพิจารณา ' + c.pendingRequests + ' รายการ' }),
        el('button', { class: 'btn btn-sm btn-primary', text: 'ดูคำขอ', on: { click: pendingRequestsModal } })));
      if (c.canAnnounce) {
        var un = c.topics.filter(function (x) { return !x.mapped; }).map(function (x) { return x.topic; });
        if (!c.lineEnabled) box.appendChild(el('div', { class: 'notice', text: 'ระบบยังปิดการส่ง LINE — บันทึกนัดได้ แต่ส่งแจ้งเตือนไม่ได้จนกว่าผู้ดูแลระบบหลักจะเปิด' }));
        else if (un.length) box.appendChild(el('div', { class: 'notice', text: 'หมวดงานที่ยังไม่ได้กำหนดกลุ่ม LINE (ระบบจะไม่ส่งจนกว่าผู้ดูแลระบบหลักตั้งค่า): ' + un.join(' · ') }));
      }
      box.appendChild(el('div', { class: 'row' }, el('span', { class: 'muted small', text: 'LINE ส่วนตัวของคุณ: ' }),
        el('span', { class: 'badge ' + (c.myLineLinked ? 'b-ok' : 'b-cancel'), text: c.myLineLinked ? 'ผูกแล้ว' : 'ยังไม่ผูก' }),
        el('button', { class: 'btn btn-sm', text: c.myLineLinked ? 'จัดการ LINE ส่วนตัว' : 'รับแจ้งเตือน LINE ส่วนตัว', on: { click: lineLinkModal } })));
    }).catch(function () { /* ไม่กระทบรายการ */ });
    return box;
  }

  /** การ์ด Dashboard: นัดประชุม / แจ้งงานที่จะถึง */
  function meetingDashCard(mt) {
    var card = el('div', { class: 'card card-pad section' }, el('h3', null, 'นัดประชุม / แจ้งงานที่จะถึง', el('span', { class: 'sub', text: mt.upcomingTotal + ' รายการ' })));
    if (mt.pendingRequests) card.appendChild(el('div', { class: 'notice gold row', style: { marginBottom: '10px' } }, el('span', { text: 'คำขอเลื่อน/เปลี่ยนนัดจาก LINE รอพิจารณา ' + mt.pendingRequests + ' รายการ' }),
      el('button', { class: 'btn btn-sm btn-primary', text: 'ดูคำขอ', on: { click: pendingRequestsModal } })));
    if (!mt.upcoming.length) card.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีนัดที่จะถึง' }));
    else card.appendChild(el('div', { class: 'list-rows' }, mt.upcoming.map(function (i) {
      return el('div', { class: 'lrow', attrs: { role: 'button', tabindex: 0 }, on: { click: function () { openDetail('meetings', i.id); }, keydown: function (ev) { if (ev.key === 'Enter') openDetail('meetings', i.id); } } },
        el('div', { class: 'main-t' }, el('div', { class: 't1', text: i.title }), el('div', { class: 't2', text: i.code + ' · ' + i.topic + ' · ' + fmtDate(i.date) + ' ' + i.time })),
        statusBadge(i.status));
    })));
    return card;
  }

  /** ตั้งค่าระบบ: กลุ่ม LINE ที่ยืนยันแล้ว + กำหนดกลุ่มปลายทางของแต่ละหมวดงาน (ผู้ดูแลระบบหลัก) */
  function lineGroupsCard() {
    var card = el('div', { class: 'card card-pad section' }, el('h3', { text: 'กลุ่ม LINE ตามหมวดงาน (แจ้งนัดประชุม / แจ้งงาน)' }), el('div', { class: 'page-loading' }, el('div', { class: 'loader' })));
    function load(refresh) { authed('getLineGroupSettings', !!refresh).then(draw).catch(function (e) { clear(card).appendChild(el('div', { class: 'notice', text: e.message || 'โหลดไม่สำเร็จ' })); }); }
    function draw(d) {
      clear(card);
      card.appendChild(el('h3', { text: 'กลุ่ม LINE ตามหมวดงาน (แจ้งนัดประชุม / แจ้งงาน)' }));
      card.appendChild(el('div', { class: 'notice', text: 'ระบบส่งเฉพาะกลุ่มที่ LINE ยืนยันว่าบอทอยู่ในกลุ่มจริง · หมวดที่ยังไม่กำหนดกลุ่ม ระบบจะไม่ส่ง (ไม่ส่งไปกลุ่มอื่นแทน) · วิธีได้ Group ID: เชิญบอทเข้ากลุ่ม แล้วกลุ่มจะขึ้นใน "กลุ่มที่รอยืนยัน" ด้านล่าง' }));
      card.appendChild(el('div', { class: 'kv section' },
        el('div', { class: 'item' }, el('div', { class: 'k', text: 'LINE ID ของบอท' }), el('div', { class: 'v' }, d.bot ? d.bot.basicId + (d.bot.displayName ? ' (' + d.bot.displayName + ')' : '') : el('span', { class: 'badge b-bad', text: d.tokenSet ? 'อ่านจาก LINE ไม่ได้ — กรอกค่าตั้ง LINE_BOT_BASIC_ID' : 'ยังไม่ได้ตั้ง Token' }),
          ' ', el('button', { class: 'btn btn-sm btn-ghost', text: 'ตรวจอีกครั้ง', on: { click: function () { load(true); } } }))),
        el('div', { class: 'item span-2' }, el('div', { class: 'k', text: 'Webhook URL (ใส่ใน LINE Developers → Messaging API)' }), el('div', { class: 'v mono break', text: d.webhookUrl || 'ยังไม่พบ — Deploy เว็บแอปก่อน' }))));
      card.appendChild(el('div', { class: 'section' }, el('div', { class: 'muted small', style: { fontWeight: 600 }, text: 'กลุ่มที่ยืนยันแล้ว' }),
        d.groups.length ? el('div', { class: 'list-rows' }, d.groups.map(function (g) {
          return el('div', { class: 'lrow', style: { cursor: 'default' } }, el('div', { class: 'main-t' }, el('div', { class: 't1', text: g.name }), el('div', { class: 't2 mono', text: g.idMasked + (g.isMain ? ' · กลุ่มหลัก (แจ้งเตือนรายวัน/รายงาน)' : '') })),
            el('button', { class: 'btn btn-sm', text: 'ทดสอบส่ง', on: { click: function (ev) { testTarget(ev.currentTarget, g.id); } } }),
            g.isMain ? null : el('button', { class: 'btn btn-sm btn-ghost', text: 'นำออก', on: { click: function (ev) {
              var b = ev.currentTarget;
              busy(b, function () { return authed('removeLineGroup', g.id, newRid()).then(function (r) { toast('นำกลุ่มออกแล้ว' + (r.unmapped.length ? ' · หมวดที่ต้องกำหนดใหม่: ' + r.unmapped.join(', ') : ''), 'ok'); load(); }).catch(showError); });
            } } }));
        })) : el('div', { class: 'empty', text: 'ยังไม่มีกลุ่มที่ยืนยัน' })));
      if (d.pending.length) card.appendChild(el('div', { class: 'section' }, el('div', { class: 'muted small', style: { fontWeight: 600 }, text: 'กลุ่มที่เชิญบอทแล้ว รอยืนยัน' }),
        el('div', { class: 'list-rows' }, d.pending.map(function (p) {
          return el('div', { class: 'lrow', style: { cursor: 'default' } }, el('div', { class: 'main-t' }, el('div', { class: 't1 mono', text: p.idMasked }), el('div', { class: 't2', text: 'พบเมื่อ ' + fmtTs(p.at) })),
            el('button', { class: 'btn btn-sm btn-primary', text: 'ตรวจกับ LINE และเพิ่ม', on: { click: function (ev) {
              var b = ev.currentTarget;
              busy(b, function () { return authed('addLineGroup', p.id, newRid()).then(function (r) { toast('เพิ่มกลุ่ม "' + r.groupName + '" แล้ว', 'ok'); load(); }).catch(showError); });
            } } }));
        }))));
      var manual = el('input', { class: 'input mono', placeholder: 'กรอก Group ID (ขึ้นต้นด้วย C ตามด้วย 32 ตัว)', maxLength: 40, attrs: { 'aria-label': 'Group ID' } });
      card.appendChild(el('div', { class: 'row section' }, manual, el('button', { class: 'btn', text: 'ตรวจกับ LINE และเพิ่ม', on: { click: function (ev) {
        var b = ev.currentTarget;
        busy(b, function () { return authed('addLineGroup', manual.value.trim(), newRid()).then(function (r) { toast('เพิ่มกลุ่ม "' + r.groupName + '" แล้ว', 'ok'); load(); }).catch(showError); });
      } } })));
      var sels = {};
      card.appendChild(el('div', { class: 'section' }, el('div', { class: 'muted small', style: { fontWeight: 600 }, text: 'หมวดงาน → กลุ่มที่จะส่ง (1 หมวดเลือกได้หลายกลุ่ม สูงสุด 5 · ไม่ติ๊ก = ไม่ส่ง LINE)' }),
        d.groups.length ? el('div', { class: 'form-grid' }, d.topics.map(function (t) {
          var mine = (d.map[t] || []);
          sels[t] = d.groups.map(function (g) { var c = el('input', { type: 'checkbox', checked: mine.indexOf(g.id) !== -1, attrs: { 'aria-label': t + ' → ' + g.name } }); c._id = g.id; return c; });
          return el('div', { class: 'field' }, el('label', { text: t }), el('div', { class: 'chk-list' }, d.groups.map(function (g, i) { return el('label', { class: 'check' }, sels[t][i], g.name); })),
            mine.length ? null : el('div', { class: 'hint', text: 'ยังไม่กำหนด — หมวดนี้จะไม่ส่ง LINE' }));
        })) : el('div', { class: 'empty', text: 'เพิ่มกลุ่มที่ยืนยันแล้วก่อน จึงกำหนดหมวดงานได้' })));
      var saveBtn = el('button', { class: 'btn btn-primary', text: 'บันทึกการกำหนดกลุ่ม' });
      var rid = newRid();
      saveBtn.addEventListener('click', function () {
        var map = {}; Object.keys(sels).forEach(function (t) { map[t] = sels[t].filter(function (c) { return c.checked; }).map(function (c) { return c._id; }); });
        busy(saveBtn, function () { return authed('saveMeetingGroupMap', map, rid).then(function (r) { rid = newRid(); toast('บันทึกแล้ว · กำหนดแล้ว ' + r.mapped + ' หมวด' + (r.unmapped.length ? ' · ยังไม่กำหนด: ' + r.unmapped.join(', ') : ''), r.unmapped.length ? 'warn' : 'ok'); S.meetingCfg = null; }).catch(showError); });
      });
      card.appendChild(el('div', { class: 'row section' }, saveBtn));
      recipientsSection(card, d, load);
    }
    function testTarget(b, id) {
      busy(b, function () { return authed('testLineTarget', id, newRid()).then(function (r) { toast(r.message, r.sent ? 'ok' : 'err'); }).catch(showError); });
    }
    load(false);
    return card;
  }

  /** ผู้รับ LINE ส่วนตัว (User ID) — กำหนดหมวดที่รับ และผู้ดูแลที่รับข้อความทดสอบก่อนส่งจริง */
  function recipientsSection(card, d, reload) {
    var box = el('div', { class: 'section stack' });
    box.appendChild(el('h3', { text: 'ผู้รับ LINE ส่วนตัว (User ID)' }));
    box.appendChild(el('div', { class: 'notice', text: 'วิธีได้ User ID: ให้ผู้รับเพิ่มบอทเป็นเพื่อน แล้วพิมพ์ "ลงทะเบียน" ในแชตส่วนตัวกับบอท — ชื่อจะขึ้นใน "รอยืนยัน" ด้านล่าง · หรือกรอก User ID (U + 32 ตัว) เอง ระบบตรวจกับ LINE ก่อนบันทึก · ติ๊ก "ผู้ดูแลระบบ" เพื่อรับข้อความทดสอบก่อนส่งจริง' }));
    var topicsOf = function (r) { return r.topics.indexOf('*') !== -1 ? 'ทุกหมวด' : r.topics.join(', '); };
    box.appendChild(d.recipients.length ? el('div', { class: 'list-rows' }, d.recipients.map(function (r) {
      return el('div', { class: 'lrow', style: { cursor: 'default' } },
        el('div', { class: 'main-t' }, el('div', { class: 't1', text: r.name + (r.admin ? ' · รับข้อความทดสอบ' : '') },
            el('span', { class: 'badge ' + (r.kind ? 'b-progress' : 'b-overdue'), style: { marginLeft: '6px' }, text: r.kind === 'executive' ? 'ผู้บริหาร' : (r.kind === 'admin' ? 'ผู้ดูแลระบบ' : 'ยังไม่ระบุประเภท — ระบบข้ามการส่ง') }),
            r.enabled === false ? el('span', { class: 'badge b-cancel', style: { marginLeft: '4px' }, text: 'ปิดรับ' }) : null),
          el('div', { class: 't2 mono', text: r.idMasked + ' · รับ: ' + topicsOf(r) })),
        el('div', { class: 'row' },
          el('button', { class: 'btn btn-sm', text: 'ทดสอบส่ง', on: { click: function (ev) { var b = ev.currentTarget; busy(b, function () { return authed('testLineTarget', r.id, newRid()).then(function (x) { toast(x.message, x.sent ? 'ok' : 'err'); }).catch(showError); }); } } }),
          el('button', { class: 'btn btn-sm', text: 'แก้ไข', on: { click: function () { recipientForm(d, r, reload); } } }),
          el('button', { class: 'btn btn-sm btn-ghost', text: 'นำออก', on: { click: function (ev) { var b = ev.currentTarget; busy(b, function () { return authed('removeLineRecipient', r.id, newRid()).then(function () { toast('นำผู้รับออกแล้ว', 'ok'); reload(); }).catch(showError); }); } } })));
    })) : el('div', { class: 'empty', text: 'ยังไม่มีผู้รับ LINE ส่วนตัว' }));
    if (d.pendingUsers.length) box.appendChild(el('div', null, el('div', { class: 'muted small', style: { fontWeight: 600 }, text: 'รอยืนยัน (พิมพ์ "ลงทะเบียน" ถึงบอทแล้ว)' }),
      el('div', { class: 'list-rows' }, d.pendingUsers.map(function (p) {
        return el('div', { class: 'lrow', style: { cursor: 'default' } }, el('div', { class: 'main-t' }, el('div', { class: 't1', text: p.name || 'ผู้ใช้ LINE' }), el('div', { class: 't2 mono', text: p.idMasked + ' · ' + fmtTs(p.at) })),
          el('button', { class: 'btn btn-sm btn-primary', text: 'ยืนยันและกำหนดหมวด', on: { click: function () { recipientForm(d, { id: p.id, name: p.name, topics: ['*'], admin: false, isNew: true }, reload); } } }));
      }))));
    box.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn', text: '+ เพิ่มผู้รับด้วย User ID', on: { click: function () { recipientForm(d, null, reload); } } })));
    card.appendChild(box);
  }

  function recipientForm(d, r, reload) {
    var idIn = el('input', { class: 'input mono', value: r ? r.id : '', maxLength: 40, placeholder: 'U + อักขระ 32 ตัว เช่น U1a2b3c…', disabled: !!(r && !r.isNew), attrs: { 'aria-label': 'LINE User ID' } });
    var nameIn = el('input', { class: 'input', value: r ? r.name : '', maxLength: 60, placeholder: 'ชื่อที่แสดง เช่น คุณซัน (ผู้บริหาร)', attrs: { 'aria-label': 'ชื่อผู้รับ' } });
    var all = el('input', { type: 'checkbox', checked: !r || r.topics.indexOf('*') !== -1 });
    var tc = d.topics.map(function (t) { var c = el('input', { type: 'checkbox', checked: !!r && r.topics.indexOf(t) !== -1 }); c._t = t; return c; });
    var adm = el('input', { type: 'checkbox', checked: !!(r && r.admin) });
    var kindSel = el('select', { class: 'input', attrs: { 'aria-label': 'ประเภทผู้รับ' } },
      el('option', { value: '', text: '— เลือกประเภทผู้รับ —' }),
      el('option', { value: 'executive', text: 'ผู้บริหาร (ได้รับอนุญาต)', selected: !!(r && r.kind === 'executive') }),
      el('option', { value: 'admin', text: 'ผู้ดูแลระบบ (ได้รับอนุญาต)', selected: !!(r && r.kind === 'admin') }));
    var enabledChk = el('input', { type: 'checkbox', checked: !(r && r.enabled === false) });
    var topicBox = el('div', { class: 'chk-list' }, tc.map(function (c) { return el('label', { class: 'check' }, c, c._t); }));
    var sync = function () { topicBox.classList.toggle('hidden', all.checked); };
    all.addEventListener('change', sync); sync();
    var save = el('button', { class: 'btn btn-primary', text: 'ตรวจกับ LINE และบันทึก' });
    var m = openModal({ title: r && !r.isNew ? 'แก้ไขผู้รับ LINE ส่วนตัว' : 'เพิ่มผู้รับ LINE ส่วนตัว', size: 'sm',
      body: el('div', { class: 'stack' },
        el('div', { class: 'field' }, el('label', null, 'LINE User ID', el('span', { class: 'req', text: '*' })), idIn),
        el('div', { class: 'field' }, el('label', { text: 'ชื่อที่แสดง' }), nameIn),
        el('div', { class: 'field' }, el('label', { text: 'หมวดงานที่รับแจ้ง' }), el('label', { class: 'check' }, all, 'ทุกหมวด'), topicBox),
        el('div', { class: 'field' }, el('label', null, 'ประเภทผู้รับ', el('span', { class: 'req', text: '*' })), kindSel,
          el('div', { class: 'hint', text: 'ส่ง LINE ส่วนตัวได้เฉพาะผู้บริหาร/ผู้ดูแลระบบที่ได้รับอนุญาต — ผู้ใช้ทั่วไปและสมาชิกกลุ่มไม่ได้รับข้อความส่วนตัว' })),
        el('label', { class: 'check' }, enabledChk, 'รับแจ้งเตือน (ปิด = หยุดส่งถึงคนนี้ชั่วคราว)'),
        el('label', { class: 'check' }, adm, 'รับข้อความ "ทดสอบก่อนส่งจริง" และแจ้งเตือนโควตา'),
        el('div', { class: 'muted small', text: 'LINE ส่งข้อความส่วนตัวได้เฉพาะผู้ที่เพิ่มบอทเป็นเพื่อนและไม่ได้บล็อกบอท · นับโควตาข้อความ 1 ต่อคนต่อครั้ง' })),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save] });
    var rid = newRid();
    save.addEventListener('click', function () {
      var id = idIn.value.trim();
      if (!/^U[0-9a-f]{32}$/.test(id)) { idIn.classList.add('invalid'); toast('User ID ต้องขึ้นต้นด้วย U ตามด้วยอักขระ 32 ตัว (0-9, a-f)', 'warn'); return; }
      var topics = all.checked ? ['*'] : tc.filter(function (c) { return c.checked; }).map(function (c) { return c._t; });
      if (!topics.length) { toast('เลือกหมวดงานอย่างน้อย 1 หมวด หรือติ๊ก "ทุกหมวด"', 'warn'); return; }
      if (!kindSel.value) { kindSel.classList.add('invalid'); toast('กรุณาเลือกประเภทผู้รับ (ผู้บริหาร หรือ ผู้ดูแลระบบ)', 'warn'); return; }
      busy(save, function () {
        return authed('saveLineRecipient', { id: id, name: nameIn.value.trim(), topics: topics, admin: adm.checked, kind: kindSel.value, enabled: enabledChk.checked }, rid).then(function (x) {
          toast((x.created ? 'เพิ่ม' : 'บันทึก') + 'ผู้รับ "' + x.name + '" แล้ว', 'ok'); m.close(); reload();
        }).catch(function (e) { rid = newRid(); showError(e); });
      });
    });
  }



  function openForm(cat, mode, source) {
    var schema = S.config.schemas[cat];
    var rid = newRid(); // ใช้รหัสเดิมตลอดอายุฟอร์ม → กดซ้ำไม่บันทึกซ้ำ
    var orig = source || {};
    var inputs = {};
    var errBox = el('div');
    // v1.14 คอลัมน์จำเป็นหายจากชีต → เซิร์ฟเวอร์หยุดบันทึกหมวดนี้ แจ้งให้ทราบตั้งแต่เปิดฟอร์ม
    if (schema.structure && schema.structure.blocked && schema.structure.blocked.length) {
      showErrors(errBox, 'หมวดนี้หยุดบันทึกชั่วคราว: ไม่พบคอลัมน์ที่ระบบจำเป็นต้องใช้ในชีต', [schema.structure.blocked.join(', ') + ' — แจ้งผู้ดูแลระบบ (ตั้งค่าระบบ → โครงสร้างคอลัมน์)']);
    }
    var uniqueKeys = {};
    (schema.uniques || []).forEach(function (g) { g.forEach(function (k) { uniqueKeys[k] = true; }); });

    var boxes = {};
    var oneOf = {};
    (schema.reqOneOf || []).forEach(function (g) { g.forEach(function (k) { oneOf[k] = g; }); });
    var grid = el('div', { class: 'form-grid' }, schema.fields.map(function (f) {
      if (f.noForm) return null; // v1.12 ช่องที่ไม่แสดงในฟอร์ม (ข้อมูลเดิมคงไว้ ไม่ถูกแก้)
      if (mode === 'update' && orig._masked && orig._masked.indexOf(f.k) !== -1) return null;
      if (f.ro) { // ระบบคำนวณเอง
        if (mode === 'create') return null;
        return el('div', { class: 'field' }, el('label', { text: f.l }), el('div', { class: 'input ro', text: orig[f.k] === '' || orig[f.k] === undefined ? '–' : String(orig[f.k]) }), el('div', { class: 'hint', text: 'ระบบคำนวณให้อัตโนมัติ' }));
      }
      var w = buildInput(f, orig[f.k], mode, cat);
      var input = w._holder || w;
      inputs[f.k] = input;
      var warn = el('div', { class: 'warn' });
      if (uniqueKeys[f.k]) (input._vis || input).addEventListener('blur', function () { checkDup(cat, inputs, schema, mode === 'update' ? orig.id : null, warn); });
      var hint = null;
      if (f.auto && mode === 'create') hint = cat === 'contracts' ? 'เว้นว่าง = ระบบออกเลขตามปี พ.ศ. ของวันเริ่ม (เช่น CTR-2569-0001) หรือกรอกเลขที่สัญญาตามเอกสาร' : 'เว้นว่างเพื่อสร้างรหัสอัตโนมัติ';
      else if (f.autoSeq && mode === 'create') hint = 'เว้นว่าง = ระบบใส่ลำดับถัดไปให้อัตโนมัติ (ต่อจากรายการที่มีอยู่)';
      else if (f.t === 'date') hint = 'พิมพ์ วว/ดด/ปปปป (พ.ศ.) หรือกดปุ่มปฏิทิน';
      else if (f.t === 'ref') hint = 'พิมพ์เพื่อค้นหา แล้วกดเลือกจากรายการ' + (S.config.quickAdd && S.config.quickAdd[f.ref] && S.config.quickAdd[f.ref].forCats.indexOf(cat) !== -1 ? ' · ไม่พบ = กด "+ เพิ่ม' + S.config.quickAdd[f.ref].label + 'ใหม่"' : '');
      else if (f.combo) hint = 'เลือกจากรายการ หรือพิมพ์เองได้';
      else if (f.t === 'select' && f.custom && f.k !== 'relatedCategory') hint = 'เลือกจากรายการ หรือเลือก "+ พิมพ์เพิ่มใหม่" เมื่อไม่มีในรายการ';
      if (oneOf[f.k]) hint = (hint ? hint + ' · ' : '') + 'ต้องระบุอย่างน้อย 1 ช่อง: ' + oneOf[f.k].map(function (k) { var x = schema.fields.filter(function (y) { return y.k === k; })[0]; return x ? x.l : k; }).join(' หรือ ');
      var box = el('div', { class: 'field' + (f.t === 'textarea' || f.t === 'ref' && (f.ref === 'land' || f.ref === 'assets') ? ' span-2' : '') },
        el('label', null, f.l, f.req && !f.auto ? el('span', { class: 'req', text: '*' }) : null, f.x ? el('span', { class: 'badge b-progress x-badge', attrs: { title: 'ช่องข้อมูลเพิ่มเติม (สร้างจากการนำเข้า/ผู้ดูแล)' }, text: 'เพิ่มเติม' }) : null), w._wrap || w, hint ? el('div', { class: 'hint', text: hint }) : null, warn);
      boxes[f.k] = box;
      return box;
    }));
    var banner = null;
    if (cat === 'contracts' && mode === 'create' && orig.renewalOf) banner = el('div', { class: 'notice gold', style: { marginBottom: '12px' }, text: 'ต่อสัญญา / ขยายอายุ — บันทึกเป็นสัญญาใหม่ที่อ้างถึงสัญญาเดิม ตรวจวันเริ่ม–วันสิ้นสุดและเลขที่สัญญาใหม่ เมื่อบันทึกแล้วสัญญาเดิมจะเปลี่ยนเป็น "ต่อสัญญาแล้ว"' });
    // สัญญา: ปุ่มกำหนดระยะเวลา + แสดงปีสัญญา พ.ศ.
    if (cat === 'contracts' && inputs.startDate && inputs.endDate && boxes.endDate) {
      var yearHint = el('div', { class: 'hint' });
      var syncYear = function () { var v = inputs.startDate.value; yearHint.textContent = validIso(v) ? 'ปีสัญญา: พ.ศ. ' + (Number(v.slice(0, 4)) + 543) + (validIso(inputs.endDate.value) ? ' · ถึง พ.ศ. ' + (Number(inputs.endDate.value.slice(0, 4)) + 543) : '') : ''; };
      inputs.startDate.addEventListener('change', syncYear); inputs.endDate.addEventListener('change', syncYear); syncYear();
      boxes.startDate.appendChild(yearHint);
      boxes.endDate.appendChild(el('div', { class: 'dur-chips' }, el('span', { class: 'muted small', text: 'ระยะเวลา:' }), [1, 2, 3, 5, 10, 15, 30].map(function (n) {
        return el('button', { type: 'button', class: 'chip chip-btn', text: n + ' ปี', on: { click: function () {
          var s0 = inputs.startDate.value;
          if (!validIso(s0)) { toast('กรุณาเลือกวันเริ่มสัญญาก่อน', 'warn'); return; }
          inputs.endDate._set(addYearsIso(s0, n));
        } } });
      })));
    }
    // v1.11 ทรัพย์สิน: แสดงผลคำนวณทันที (รวม/ตรว. · รวมมูลค่า (รัฐ)) — เซิร์ฟเวอร์คำนวณซ้ำตอนบันทึก
    if (cat === 'assets' && inputs.areaRai && inputs.areaNgan && inputs.areaSqWa && boxes.areaSqWa) {
      var calcHint = el('div', { class: 'hint calc-hint', attrs: { 'data-calc': 'area' } });
      var calc = function () {
        var n = function (inp) { var v = inp ? String(inp.value || '').replace(/,/g, '').trim() : ''; return v === '' || !isFinite(Number(v)) ? null : Number(v); };
        var r = n(inputs.areaRai), g = n(inputs.areaNgan), w = n(inputs.areaSqWa), per = n(inputs.valuePerSqWa);
        // กรอกมูลค่าต่อ ตรว. แล้ว → ช่องรวมมูลค่า (รัฐ) คำนวณให้และล็อกไว้ (ตรงกับที่บันทึกลงชีต)
        var ap = inputs.appraisalPrice;
        var lockAp = function (v) { if (!ap) return; if (v === null) { if (ap.readOnly) { ap.readOnly = false; ap.classList.remove('ro-calc'); ap.title = ''; } return; } ap.value = String(v); ap.readOnly = true; ap.classList.add('ro-calc'); ap.title = 'คำนวณจาก รวม/ตรว. × มูลค่า ต่อ/ตรว. — ลบมูลค่าต่อ ตรว. ออกถ้าต้องการพิมพ์เอง'; };
        if (r === null && g === null && w === null) { calcHint.textContent = 'รวม/ตรว. = ไร่×400 + งาน×100 + ตรว. (ระบบคำนวณให้)'; lockAp(null); return; }
        var tot = Math.round(((r || 0) * 400 + (g || 0) * 100 + (w || 0)) * 100) / 100;
        var apv = per && tot > 0 ? Math.round(tot * per * 100) / 100 : null;
        lockAp(apv);
        calcHint.textContent = 'รวม ' + fmtNum(tot) + ' ตรว.' + (apv !== null ? ' · รวมมูลค่า (รัฐ) ' + fmtNum(apv) + ' บาท (คำนวณให้)' : '');
      };
      ['areaRai', 'areaNgan', 'areaSqWa', 'valuePerSqWa'].forEach(function (k) { if (inputs[k]) inputs[k].addEventListener('input', calc); });
      boxes.areaSqWa.appendChild(calcHint); calc();
    }
    // v1.10 แนบเอกสารในหน้าบันทึก (สัญญาเช่า · กฎหมายและคดี) — ส่งหลังบันทึกข้อมูลสำเร็จ
    var stager = DOC_CATS.indexOf(cat) !== -1 && can(cat, 'upload') ? docStager(cat, {
      existing: function () { return []; },
      onPickFiles: cat === 'contracts' && mode === 'update' && orig.id ? function (files) { return contractPick(orig, files); } : null
    }) : null;
    var docBox = stager ? el('div', { class: 'doc-form-box' }, el('div', { class: 'df-head' }, el('strong', { text: '📎 เอกสารแนบ' }),
      el('span', { class: 'muted small', text: ' เลือกไฟล์ ตั้งชื่อ เลือกประเภท — ระบบอัปโหลดให้หลังกดบันทึกและบันทึกข้อมูลสำเร็จ' })), stager.el) : null;
    var isMtg = cat === 'meetings';
    if (isMtg && mode === 'create') banner = el('div', { class: 'notice', style: { marginBottom: '12px' }, text: 'ผู้แจ้ง: ' + (S.profile.displayName || '') + ' (ระบบใส่ให้อัตโนมัติจากผู้ที่เข้าสู่ระบบ) · กด "บันทึกร่าง" เพื่อเก็บไว้ก่อน หรือ "บันทึกและส่งแจ้งเตือน LINE" เมื่อข้อมูลครบ' });
    var save = el('button', { class: 'btn ' + (isMtg ? '' : 'btn-primary'), text: isMtg ? (mode === 'create' ? 'บันทึกร่าง' : 'บันทึกการแก้ไข') : (mode === 'create' ? 'บันทึกรายการ' : 'บันทึกการแก้ไข') });
    var saveSend = isMtg ? el('button', { class: 'btn btn-primary', text: 'บันทึกและส่งแจ้งเตือน LINE' }) : null;
    var m = openModal({
      title: (mode === 'create' ? 'เพิ่ม' : 'แก้ไข') + schema.label, sticky: true,
      body: [banner, errBox, grid, docBox, el('p', { class: 'muted small', text: '* จำเป็นต้องกรอก · ระบบตรวจข้อมูลซ้ำและสิทธิ์อีกครั้งก่อนบันทึก' }), isMtg ? meetingNoteBox() : null],
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save, saveSend]
    });

    function submit(btn, andSend) {
      clear(errBox);
      var data = {}, missing = [], bad = [];
      schema.fields.forEach(function (f) {
        var inp = inputs[f.k]; if (!inp) return;
        var v = String(inp.value || '').trim();
        var shown = inp._vis || inp;
        if (f.t !== 'date' || validIso(v) || !v) shown.classList.remove('invalid');
        if (f.req && !f.auto && !v) { missing.push(f.l); shown.classList.add('invalid'); }
        if (v) { // ตรวจรูปแบบเบื้องต้น (เซิร์ฟเวอร์ตรวจซ้ำทุกครั้ง)
          var why = null;
          if (f.t === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) why = 'รูปแบบเวลา ชช:นน เช่น 09:30';
          else if (f.t === 'url' && !/^https?:\/\/\S+$/i.test(v)) why = 'ลิงก์ต้องขึ้นต้นด้วย https://';
          else if ((f.t === 'number' || f.t === 'money') && !isFinite(Number(v.replace(/,/g, '')))) why = 'ต้องเป็นตัวเลข';
          else if (f.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) why = 'รูปแบบอีเมลไม่ถูกต้อง';
          if (why) { bad.push(f.l + ': ' + why); shown.classList.add('invalid'); }
        }
        if (mode === 'create') { if (v !== '') data[f.k] = v; }
        else if (v !== String(orig[f.k] === undefined || orig[f.k] === null ? '' : orig[f.k])) data[f.k] = v;
      });
      if (missing.length) { showErrors(errBox, 'กรุณากรอกข้อมูลที่จำเป็น', missing.concat(bad)); m.body.scrollTop = 0; return; }
      if (bad.length) { showErrors(errBox, 'ข้อมูลไม่ถูกต้อง', bad); m.body.scrollTop = 0; return; }
      if (isMtg && mode === 'update' && !Object.keys(data).length && andSend) { busy(btn, function () { return sendMeeting(orig.id).then(function () { m.close(); refreshCurrent(); }); }); return; }
      if (stager && stager.validate()) { showErrors(errBox, 'ตรวจเอกสารแนบที่ขึ้นสีแดงก่อนบันทึก', []); return; }
      if (mode === 'update' && !Object.keys(data).length) {
        if (stager && stager.count()) { busy(btn, function () { return sendDocs(orig); }); return; } // แก้เฉพาะเอกสาร
        toast('ไม่มีการเปลี่ยนแปลง', 'warn'); return;
      }
      var other = saveSend ? (btn === save ? saveSend : save) : null;
      if (other) other.disabled = true; // กันกดปุ่มอีกปุ่มระหว่างบันทึก
      busy(btn, function () {
        var p = mode === 'create' ? authed('createRecord', cat, data, rid) : authed('updateRecord', cat, orig.id, data, orig.version, rid);
        return p.then(function (r) {
          toast(cat === 'contracts' && !r.unchanged ? 'บันทึกข้อมูลสัญญาเช่าเรียบร้อยแล้ว' : (mode === 'create' ? (isMtg ? 'บันทึกร่างแล้ว' : 'บันทึกรายการแล้ว') : (r.unchanged ? 'ไม่มีการเปลี่ยนแปลง' : 'บันทึกการแก้ไขแล้ว')), 'ok');
          if (isMtg && r.reminderAsk && r.record && r.record.id) askReRemind(r.record.id);
          saveCustomOptions(cat, schema.fields, inputs);
          if (mode === 'update' && r.record && r.record.id && S.patchRow) S.patchRow(cat, r.record); // v1.16 เซิร์ฟเวอร์ยืนยันแล้ว → ปรับแถวเดิมทันที
          (r.linked || []).forEach(function (n) { toast(n, 'ok'); });
          (r.warnings || []).forEach(function (w2) { if (!andSend || w2.indexOf('ส่งแจ้งเตือน LINE') === -1) toast(w2, 'warn'); });
          if (stager && stager.count()) return sendDocs(r.record && r.record.id ? r.record : orig);
          m.close();
          if (andSend && r.record && r.record.id) return sendMeeting(r.record.id).then(refreshCurrent, refreshCurrent);
          refreshCurrent();
        }).catch(function (e) {
          if (e.code === 'CONFLICT') showErrors(errBox, e.message, ['ปิดหน้าต่างนี้แล้วเปิดรายการใหม่เพื่อดูข้อมูลล่าสุด']);
          else if (e.code === 'VALIDATION' || e.code === 'DUPLICATE' || e.code === 'FORBIDDEN') showErrors(errBox, e.message, e.details || []);
          else showError(e);
          m.body.scrollTop = 0;
        }).finally(function () { if (other) other.disabled = false; });
      });
    }
    /** ส่งเอกสารที่เตรียมไว้ หลังบันทึกข้อมูลสำเร็จ — ไม่สำเร็จบางรายการ: เปิดหน้าต่างค้างไว้ให้ลองใหม่ (ข้อมูลหลักบันทึกแล้ว) */
    function sendDocs(rec) {
      mode = 'update'; orig = rec; // ข้อมูลหลักบันทึกแล้ว — กดซ้ำจะไม่สร้างรายการใหม่
      save.textContent = 'ส่งเอกสารที่เหลือ';
      clear(errBox).appendChild(el('div', { class: 'notice', text: 'บันทึกข้อมูลแล้ว · กำลังอัปโหลดเอกสาร…' }));
      return stager.run(rec).then(function (s) {
        if (!s.fail) { toast('อัปโหลดเอกสารแล้ว ' + s.ok + ' รายการ', 'ok'); m.close(); refreshCurrent(); return; }
        clear(errBox).appendChild(el('div', { class: 'errors', text: 'บันทึกข้อมูลแล้ว แต่ส่งเอกสารไม่สำเร็จ ' + s.fail + ' รายการ — แก้รายการสีแดงแล้วกด "ส่งเอกสารที่เหลือ" หรือปิดแล้วแนบภายหลังที่แท็บไฟล์แนบ' }));
        refreshCurrent();
      }, function (e) { clear(errBox).appendChild(el('div', { class: 'errors', text: (e && e.message) || 'ส่งเอกสารไม่สำเร็จ' })); refreshCurrent(); });
    }
    save.addEventListener('click', function () { submit(save, false); });
    if (saveSend) saveSend.addEventListener('click', function () { submit(saveSend, true); });
  }

  /** ข้อความลายน้ำ (placeholder) — แสดงเฉพาะตอนช่องว่าง ไม่ถูกส่งไปบันทึก */
  function phOf(f, mode) {
    if (f.auto && mode === 'create') return f.ph || 'อัตโนมัติ';
    if (f.ph) return f.ph;
    switch (f.t) {
      case 'textarea': return 'กรอก' + f.l + (f.req ? '' : ' (ถ้ามี)');
      case 'number': return 'กรอกตัวเลข';
      case 'money': return 'กรอกจำนวนเงินเป็นบาท';
      case 'email': return 'เช่น name@example.com';
      case 'phone': return 'เช่น 081-234-5678';
      case 'url': return 'เช่น https://…';
      case 'time': return 'ชช:นน เช่น 09:30';
      case 'lat': return 'เช่น 13.7563';
      case 'lng': return 'เช่น 100.5018';
      case 'select': return 'เลือก' + f.l;
      default: return 'กรอก' + f.l;
    }
  }

  /** ช่องธนาคาร: เลือกจากรายการ (รหัส — ชื่อ) หรือ "อื่น ๆ" แล้วพิมพ์ชื่อเอง · รายการแก้ได้ที่ ตั้งค่าระบบ → OPTIONS_BANK */
  function bankInput(f, v) {
    var opts = (f.bankOpts || []).slice();
    var known = !v || opts.indexOf(v) !== -1;
    var holder = el('input', { type: 'hidden', value: v || '' });
    var sel = el('select', { class: 'input', attrs: { 'aria-label': f.l } }, el('option', { value: '', text: '— ' + (f.ph || 'เลือกธนาคาร') + ' —' }),
      opts.map(function (o) { return el('option', { value: o, text: o, selected: o === v }); }),
      el('option', { value: '__other', text: 'อื่น ๆ (พิมพ์ชื่อธนาคารเอง)', selected: !known }));
    var other = el('input', { class: 'input' + (known ? ' hidden' : ''), value: known ? '' : v, maxLength: f.max || 120, placeholder: 'พิมพ์ชื่อธนาคาร / สถาบันการเงิน', attrs: { 'aria-label': f.l + ' (อื่น ๆ)' } });
    function sync() { holder.value = sel.value === '__other' ? other.value.trim() : sel.value; }
    sel.addEventListener('change', function () { other.classList.toggle('hidden', sel.value !== '__other'); if (sel.value === '__other') other.focus(); sync(); });
    other.addEventListener('input', sync);
    holder._vis = sel; holder._wrap = el('div', { class: 'stack-sm' }, sel, other, holder);
    return holder;
  }

  function buildInput(f, value, mode, cat) {
    var v = value === undefined || value === null ? '' : String(value);
    if (f.t === 'date') { var dw = dateField(f, v); dw._holder = dw.querySelector('input[type=hidden]'); return dw; }
    if (f.t === 'ref') { var rw = refPicker(f, v, cat); rw._holder = rw.querySelector('input[type=hidden]'); return rw; }
    if (f.bank) return bankInput(f, v);
    if (f.combo && f.t === 'text') return comboInput(f, v, cat);
    var ph = phOf(f, mode);
    var common = { class: 'input', placeholder: ph, attrs: { 'aria-label': f.l } };
    switch (f.t) {
      case 'textarea': return el('textarea', Object.assign({ value: v, maxLength: f.max || 5000, rows: 3 }, common));
      case 'number': return el('input', Object.assign({ type: 'number', value: v, step: 'any', placeholder: ph, attrs: { 'aria-label': f.l, inputmode: 'decimal', min: f.min !== null ? f.min : undefined } }, { class: 'input' }));
      case 'money': return el('input', { class: 'input', type: 'number', value: v, step: '0.01', placeholder: ph, attrs: { 'aria-label': f.l, inputmode: 'decimal', min: 0 } });
      case 'lat': case 'lng': return el('input', { class: 'input', type: 'number', value: v, step: 'any', placeholder: ph, attrs: { 'aria-label': f.l, inputmode: 'decimal' } });
      case 'date': return el('input', Object.assign({ type: 'date', value: v }, common));
      case 'time': return el('input', Object.assign({ type: 'time', value: v, step: 60 }, common));
      case 'url': return el('input', Object.assign({ type: 'url', value: v, maxLength: f.max || 500, attrs: { 'aria-label': f.l, inputmode: 'url', autocomplete: 'off' } }, { class: 'input', placeholder: ph }));
      case 'email': return el('input', Object.assign({ type: 'email', value: v, maxLength: 254 }, common));
      case 'phone': return el('input', Object.assign({ type: 'tel', value: v, maxLength: 20 }, common));
      case 'idcard': return el('input', { class: 'input mono', value: v, maxLength: 17, placeholder: f.ph || 'x-xxxx-xxxxx-xx-x', attrs: { 'aria-label': f.l, inputmode: 'numeric' } });
      case 'status':
      case 'select': {
        if (f.t === 'select' && f.custom && f.k !== 'relatedCategory') return selectInput(Object.assign({}, f, { ph: ph }), v, mode);
        var opts = (f.opts || []).slice();
        if (v && opts.indexOf(v) === -1) opts.unshift(v); // ค่าเดิมที่ถูกถอดจากตัวเลือก
        var s = el('select', { class: 'input', attrs: { 'aria-label': f.l } }, f.t === 'status' ? null : el('option', { value: '', text: '— ' + ph + ' —' }),
          opts.map(function (o) { return el('option', { value: o, text: f.k === 'relatedCategory' && S.config.schemas[o] ? S.config.schemas[o].label : o, selected: o === v }); }));
        if (f.t === 'status' && !v && mode === 'create') s.selectedIndex = 0;
        return s;
      }
      case 'ref': return el('select', { class: 'input', attrs: { 'aria-label': f.l } }, el('option', { value: v, text: v ? v : '— เลือก —' }));
      default: return el('input', Object.assign({ type: 'text', value: v, maxLength: f.max || 255 }, common));
    }
  }

  function loadRefOptions(f, select, current) {
    if (!S.config.schemas[f.ref]) {
      select.disabled = !current;
      select.title = 'ไม่มีสิทธิ์ดูหมวด ' + f.ref;
      return;
    }
    authed('getLookupOptions', f.ref, '').then(function (r) {
      clear(select);
      select.appendChild(el('option', { value: '', text: '— เลือก —' }));
      var found = false;
      r.items.forEach(function (it) { if (it.id === current) found = true; select.appendChild(el('option', { value: it.id, text: it.label, selected: it.id === current })); });
      if (current && !found) select.appendChild(el('option', { value: current, text: current, selected: true }));
      if (r.truncated) select.appendChild(el('option', { disabled: true, text: '… แสดง 200 รายการแรก' }));
    }).catch(function () { /* คงค่าเดิมไว้ */ });
  }

  function checkDup(cat, inputs, schema, excludeId, warn) {
    var data = {};
    (schema.uniques || []).forEach(function (g) { g.forEach(function (k) { if (inputs[k] && inputs[k].value.trim()) data[k] = inputs[k].value.trim(); }); });
    if (!Object.keys(data).length) { warn.textContent = ''; return; }
    authed('checkDuplicate', cat, data, excludeId).then(function (r) {
      warn.textContent = r.duplicates.length ? '⚠ พบข้อมูลซ้ำ: ' + r.duplicates.join(', ') : '';
    }).catch(function () { warn.textContent = ''; });
  }

  function showErrors(box, title, list) {
    clear(box).appendChild(el('div', { class: 'errors', style: { marginBottom: '14px' }, attrs: { role: 'alert' } },
      el('strong', { text: title }), list && list.length ? el('ul', null, list.map(function (x) { return el('li', { text: x }); })) : null));
  }

  /* ============================== วางจากชีต (นำเข้าหลายแถว) ============================== */

  /** แยกข้อความตาราง (คั่นด้วย Tab / จุลภาค / อัฒภาค — รองรับเซลล์ที่มีขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด) */
  function parseTSV(text, delim) {
    var t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n'), rows = [], row = [], cell = '', q = false;
    if (!delim) {
      var first = t.split('\n')[0] || '';
      delim = first.indexOf('\t') !== -1 ? '\t' : ((first.match(/,/g) || []).length >= (first.match(/;/g) || []).length && first.indexOf(',') !== -1 ? ',' : (first.indexOf(';') !== -1 ? ';' : '\t'));
    }
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (q) {
        if (ch === '"') { if (t.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  /* ----- อ่านไฟล์ CSV / Excel (.xlsx) ในเบราว์เซอร์ — ไม่อัปโหลดไฟล์ ไม่สร้างไฟล์ใหม่ ----- */

  function readTableFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (file.size > 15 * 1024 * 1024) return Promise.reject({ message: 'ไฟล์ใหญ่เกิน 15 MB กรุณาแบ่งไฟล์' });
    if (ext === 'xlsx') return readXlsx(file);
    if (['csv', 'tsv', 'txt'].indexOf(ext) !== -1) {
      return file.arrayBuffer().then(function (buf) {
        var text = new TextDecoder('utf-8').decode(buf);
        if (text.indexOf('�') !== -1) { try { text = new TextDecoder('windows-874').decode(buf); } catch (e) { /* ใช้ UTF-8 */ } } // CSV ภาษาไทยจาก Excel รุ่นเก่า
        return { sheets: [{ name: file.name, rows: parseTSV(text, ext === 'tsv' ? '\t' : null) }] };
      });
    }
    if (ext === 'xls') return Promise.reject({ message: 'ไฟล์ .xls รุ่นเก่ายังไม่รองรับ — เปิดใน Excel แล้วบันทึกเป็น .xlsx หรือ .csv ก่อน' });
    return Promise.reject({ message: 'รองรับไฟล์ .xlsx, .csv, .tsv, .txt' });
  }

  function readXlsx(file) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject({ message: 'เบราว์เซอร์นี้อ่านไฟล์ .xlsx ไม่ได้ — บันทึกเป็น .csv หรือคัดลอกข้อมูลมาวางแทน' });
    return file.arrayBuffer().then(function (buf) {
      var dv = new DataView(buf), u8 = new Uint8Array(buf), entries = {};
      var eocd = -1;
      for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
      if (eocd < 0) throw { message: 'ไฟล์ .xlsx เสียหายหรือไม่ใช่ไฟล์ Excel' };
      var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
      var dec = new TextDecoder('utf-8');
      for (var k = 0; k < n; k++) {
        if (dv.getUint32(off, true) !== 0x02014b50) break;
        var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
        var nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
        var name = dec.decode(u8.subarray(off + 46, off + 46 + nl));
        var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        entries[name] = { method: method, data: u8.subarray(start, start + csize) };
        off += 46 + nl + xl + cl;
      }
      function text(name) {
        var e = entries[name];
        if (!e) return Promise.resolve(null);
        if (e.method === 0) return Promise.resolve(dec.decode(e.data));
        var stream = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).text();
      }
      var xml = function (t) { return t ? new DOMParser().parseFromString(t, 'application/xml') : null; };
      var byTag = function (node, tag) { return node ? Array.prototype.slice.call(node.getElementsByTagNameNS('*', tag)) : []; };
      return Promise.all([text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'), text('xl/sharedStrings.xml'), text('xl/styles.xml')]).then(function (r) {
        var wb = xml(r[0]), rels = xml(r[1]), ss = xml(r[2]), st = xml(r[3]);
        if (!wb) throw { message: 'ไม่พบข้อมูลชีตในไฟล์ .xlsx' };
        var target = {};
        byTag(rels, 'Relationship').forEach(function (x) { target[x.getAttribute('Id')] = x.getAttribute('Target'); });
        var shared = byTag(ss, 'si').map(function (si) { return byTag(si, 't').map(function (t) { return t.textContent; }).join(''); });
        // ลำดับสไตล์ที่เป็นรูปแบบวันที่ → แปลงเลขวันที่ของ Excel เป็น ปปปป-ดด-วว
        var custom = {};
        byTag(st, 'numFmt').forEach(function (f) { custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
        var cellXfs = byTag(st, 'cellXfs')[0];
        var dateStyle = cellXfs ? byTag(cellXfs, 'xf').map(function (xf) {
          var id = Number(xf.getAttribute('numFmtId'));
          return (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (custom[id] && /[dmy]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,%]+$/.test(custom[id]));
        }) : [];
        var sheets = byTag(wb, 'sheet').map(function (sh) {
          var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
          var t = String(target[rid] || '').replace(/^\/?xl\//, '').replace(/^\//, '');
          return { name: sh.getAttribute('name'), path: 'xl/' + t };
        });
        return Promise.all(sheets.map(function (sh) { return text(sh.path); })).then(function (xs) {
          return { sheets: sheets.map(function (sh, si) {
            var doc = xml(xs[si]), rows = [];
            byTag(doc, 'row').forEach(function (row) {
              var rn = Number(row.getAttribute('r')) - 1, cells = [];
              byTag(row, 'c').forEach(function (c, ci) {
                var ref = c.getAttribute('r') || '', col = 0, m = /^([A-Z]+)/.exec(ref);
                if (m) { for (var j = 0; j < m[1].length; j++) col = col * 26 + (m[1].charCodeAt(j) - 64); col--; } else col = ci;
                var t = c.getAttribute('t'), v = byTag(c, 'v')[0], val = '';
                if (t === 's') val = shared[Number(v ? v.textContent : 0)] || '';
                else if (t === 'inlineStr') val = byTag(c, 't').map(function (x) { return x.textContent; }).join('');
                else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
                else if (v) {
                  val = v.textContent;
                  var sIdx = Number(c.getAttribute('s') || -1);
                  if (t !== 'str' && dateStyle[sIdx] && /^\d+(\.\d+)?$/.test(val)) {
                    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(val)) * 86400000);
                    val = d.toISOString().slice(0, 10);
                  }
                }
                cells[col] = val;
              });
              for (var x = 0; x < cells.length; x++) if (cells[x] === undefined) cells[x] = '';
              rows[isNaN(rn) ? rows.length : rn] = cells;
            });
            return { name: sh.name, rows: rows.filter(function (r) { return r && r.some(function (c) { return String(c).trim() !== ''; }); }) };
          }) };
        });
      });
    });
  }

  function openImport(cat) {
    var schema = S.config.schemas[cat];
    var m = openModal({ title: 'นำเข้าข้อมูลจากชีต / ไฟล์ — ' + schema.label, sticky: true, body: el('div', { class: 'page-loading' }, el('div', { class: 'loader' })) });
    authed('getImportTemplate', cat).then(function (tpl) { drawImport(m, cat, tpl); })
      .catch(function (e) { m.setBody(el('div', { class: 'empty', text: e.message || 'โหลดไม่สำเร็จ' })); });
  }

  var IMPORT_ACTION = {
    create: ['b-ok', 'ใหม่'], update: ['b-soon', 'ซ้ำ → อัปเดต'], same: ['b-cancel', 'เหมือนเดิม'],
    skip: ['b-cancel', 'ข้าม'], error: ['b-bad', 'ไม่ผ่าน']
  };
  var MAP_HOW = { exact: 'ตรงชื่อ', alias: 'จับคู่อัตโนมัติ', similar: 'คล้ายกัน', manual: 'เลือกเอง', none: 'ไม่รู้จัก', ignored: 'ไม่นำเข้า', denied: 'ไม่มีสิทธิ์', duplicate: 'ซ้ำคอลัมน์อื่น' };

  function drawImport(m, cat, tpl) {
    var schema = S.config.schemas[cat];
    var canUpdate = can(cat, 'update');
    var headerLine = tpl.headers.join('\t');
    var tplInput = el('input', { class: 'input mono', readOnly: true, value: headerLine, attrs: { 'aria-label': 'หัวตารางสำหรับคัดลอก' } });
    var copyBtn = el('button', { class: 'btn btn-sm', text: 'คัดลอกหัวตาราง' });
    copyBtn.addEventListener('click', function () {
      var done = function () { toast('คัดลอกหัวตารางแล้ว นำไปวางในแถวแรกของชีต', 'ok'); };
      tplInput.focus(); tplInput.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(headerLine + '\n').then(done, function () { try { document.execCommand('copy'); done(); } catch (e) { toast('กด Ctrl+C เพื่อคัดลอก', 'warn'); } });
      else { try { document.execCommand('copy'); done(); } catch (e) { toast('กด Ctrl+C เพื่อคัดลอก', 'warn'); } }
    });
    var fileInput = el('input', { type: 'file', class: 'sr-only', attrs: { accept: '.xlsx,.csv,.tsv,.txt', 'aria-label': 'เลือกไฟล์ Excel หรือ CSV' } });
    var fileBtn = el('button', { class: 'btn btn-primary', type: 'button', on: { click: function () { fileInput.click(); } } }, svg(ICON.upload, 16), 'เลือกไฟล์ Excel / CSV');
    var sheetSel = el('select', { class: 'input hidden', attrs: { 'aria-label': 'เลือกชีตในไฟล์' }, style: { width: 'auto' } });
    var fileInfo = el('span', { class: 'muted small' });
    var area = el('textarea', { class: 'input mono', rows: 6, placeholder: 'หรือคัดลอกเซลล์จาก Google Sheets / Excel (รวมแถวหัวตาราง) แล้วคลิกที่นี่กด Ctrl+V', attrs: { 'aria-label': 'วางข้อมูลจากชีต', spellcheck: 'false' } });
    var hasHeader = el('input', { type: 'checkbox', checked: true });
    var info = el('div', { class: 'muted small' });
    var out = el('div');
    var checkBtn = el('button', { class: 'btn btn-primary', text: 'ตรวจสอบข้อมูล' });
    var importBtn = el('button', { class: 'btn btn-gold hidden', text: 'นำเข้า' });
    var source = null, book = null, mapping = null, last = null, chosen = {};
    // v1.9 คำแนะนำจากการวิเคราะห์คอลัมน์ (กฎในระบบ / AI) + ช่องใหม่ที่ผู้ใช้ยืนยัน
    var analysis = null, newDefs = {}, aiBtn = null;
    var canFields = !!S.config.canManageFields && cat !== 'meetings';
    function newFieldList() {
      return Object.keys(newDefs).map(function (k) { var d = newDefs[k]; return { index: Number(k), label: d.label, type: d.type, options: d.options || [], pii: !!d.pii }; });
    }
    function cleanMap(arr) { return (arr || []).map(function (v) { return v && String(v).indexOf('x_tmp') === 0 ? '' : v; }); }

    function rowsNow() { return source ? source.rows : parseTSV(area.value); }
    function payload() {
      var rows = rowsNow();
      if (!rows.length) return null;
      return hasHeader.checked ? { headers: rows[0].map(String), rows: rows.slice(1) } : { headers: tpl.headers, rows: rows };
    }
    function reset() { last = null; mapping = null; chosen = {}; analysis = null; newDefs = {}; importBtn.classList.add('hidden'); clear(out); }
    function refreshInfo() {
      reset();
      var rows = rowsNow();
      if (!rows.length) { info.textContent = ''; return; }
      var n = rows.length - (hasHeader.checked ? 1 : 0);
      info.textContent = 'พบ ' + n + ' แถว · ' + rows[0].length + ' คอลัมน์' + (hasHeader.checked ? ' · ใช้แถวแรกเป็นหัวตาราง' : ' · ไม่มีหัวตาราง ใช้ลำดับคอลัมน์ตามหัวตารางมาตรฐาน');
      if (n > tpl.maxRows) info.textContent += ' — เกิน ' + tpl.maxRows + ' แถว กรุณาแบ่งไฟล์';
    }
    function useSheet(i) {
      var sh = book.sheets[i];
      source = { rows: sh.rows.map(function (r) { return r.map(function (c) { return c === null || c === undefined ? '' : String(c); }); }) };
      fileInfo.textContent = (book.fileName || '') + (book.sheets.length > 1 ? ' · ชีต "' + sh.name + '"' : '');
      refreshInfo();
    }
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      fileInfo.textContent = 'กำลังอ่านไฟล์…';
      readTableFile(f).then(function (bk) {
        bk.fileName = f.name; book = bk;
        var withData = bk.sheets.filter(function (s) { return s.rows.length; });
        if (!withData.length) throw { message: 'ไม่พบข้อมูลในไฟล์' };
        bk.sheets = withData;
        clear(sheetSel); sheetSel.classList.toggle('hidden', bk.sheets.length < 2);
        bk.sheets.forEach(function (s, i) { sheetSel.appendChild(el('option', { value: String(i), text: s.name + ' (' + s.rows.length + ' แถว)' })); });
        area.value = ''; useSheet(0);
      }).catch(function (e) { fileInfo.textContent = ''; source = null; showError(e); })
        .then(function () { fileInput.value = ''; });
    });
    sheetSel.addEventListener('change', function () { useSheet(Number(sheetSel.value)); });
    area.addEventListener('input', function () { if (area.value) { source = null; book = null; fileInfo.textContent = ''; sheetSel.classList.add('hidden'); } refreshInfo(); });
    hasHeader.addEventListener('change', refreshInfo);

    function drawResult(r, committed) {
      clear(out);
      var badge = function (cls, txt) { return el('span', { class: 'badge ' + cls, text: txt }); };
      out.appendChild(el('div', { class: 'row', style: { margin: '12px 0 8px' } }, committed ? [
        badge('b-ok', 'เพิ่มแล้ว ' + (r.imported || 0)), badge('b-soon', 'อัปเดตแล้ว ' + (r.updated || 0)), badge('b-cancel', 'ข้าม/ไม่ผ่าน ' + (r.skippedTotal || 0))
      ] : [
        badge('b-ok', 'ใหม่ ' + r.creates), r.updates ? badge('b-soon', 'ซ้ำ → อัปเดตได้ ' + r.updates) : null,
        r.same ? badge('b-cancel', 'เหมือนเดิม ' + r.same) : null, r.skipped ? badge('b-cancel', 'ข้าม ' + r.skipped) : null,
        r.invalid ? badge('b-bad', 'ไม่ผ่าน ' + r.invalid) : null
      ], el('span', { class: 'muted small', text: 'จากทั้งหมด ' + r.total + ' แถว' })));
      if (r.missingRequired && r.missingRequired.length && !committed) out.appendChild(el('div', { class: 'errors', style: { margin: '6px 0' }, text: 'ยังไม่พบคอลัมน์ที่จำเป็น: ' + r.missingRequired.join(', ') + ' — เลือกคอลัมน์ให้ตรงในตารางด้านล่าง หรือเพิ่มคอลัมน์ในไฟล์' }));
      (r.warnings || []).forEach(function (w) { out.appendChild(el('div', { class: 'muted small', text: '• ' + w })); });

      if (committed && r.newFields && r.newFields.length) {
        out.appendChild(el('div', { class: 'notice gold', style: { margin: '6px 0' }, text: 'สร้างช่องข้อมูลใหม่แล้ว ' + r.newFields.length + ' ช่อง: ' + r.newFields.map(function (n) { return n.label; }).join(', ') + ' (สำรองข้อมูลก่อนเพิ่มคอลัมน์แล้ว)' }));
      }
      if (!committed && r.columns) {
        var mapBody = el('tbody');
        var curMap = function () { return cleanMap(r.columns.map(function (x) { return x.field === null && (x.how === 'none' || x.how === 'ignored' || x.how === 'denied' || x.how === 'duplicate') ? '' : x.field; })); };
        var applySug = function (c, sg) {
          mapping = curMap();
          if (sg.action === 'map') { delete newDefs[c.index]; mapping[c.index] = sg.field; }
          else if (sg.action === 'new') { newDefs[c.index] = { label: sg.label || c.header, type: sg.type || 'text', options: sg.options || [], pii: !!sg.pii }; mapping[c.index] = ''; }
          else { delete newDefs[c.index]; mapping[c.index] = ''; }
        };
        var sugText = function (sg) {
          if (!sg) return '';
          var who = sg.source === 'ai' ? '✨ AI: ' : 'ระบบ: ';
          if (sg.action === 'map') return who + 'จับคู่กับ "' + (sg.fieldLabel || sg.field) + '"';
          if (sg.action === 'new') return who + 'สร้างช่องใหม่ "' + sg.label + '" (' + ((analysis && analysis.typeLabel[sg.type]) || sg.type) + ')';
          return who + 'ไม่นำเข้า';
        };
        var sameAsNow = function (c, sg) {
          if (!sg) return true;
          if (sg.action === 'new') return !!newDefs[c.index];
          if (sg.action === 'map') return !newDefs[c.index] && c.field === sg.field;
          return !newDefs[c.index] && !c.field;
        };
        var pending = [];
        r.columns.forEach(function (c) {
          var isNew = !!newDefs[c.index];
          var sel = el('select', { class: 'input', attrs: { 'aria-label': 'จับคู่คอลัมน์ ' + c.header, 'data-col': String(c.index) } },
            el('option', { value: '', text: '— ไม่นำเข้า —' }),
            canFields ? el('option', { value: '__new', text: '➕ สร้างเป็นช่องใหม่', selected: isNew }) : null,
            r.fields.filter(function (f) { return String(f.k).indexOf('x_tmp') !== 0; }).map(function (f) { return el('option', { value: f.k, text: f.l + (f.req ? ' *' : ''), selected: !isNew && f.k === c.field }); }));
          sel.addEventListener('change', function () {
            mapping = curMap();
            if (sel.value === '__new') {
              var a = analysis && analysis.byIndex[c.index], s0 = a && (a.aiSuggestion || a.suggestion), sg = s0 && s0.action === 'new' ? s0 : null;
              var inf = a && a.inferred;
              newDefs[c.index] = { label: (sg && sg.label) || String(c.header || '').replace(/\s*\*\s*$/, '').trim().slice(0, 60) || ('ช่องใหม่ ' + (c.index + 1)), type: (sg && sg.type) || (inf && inf.type) || 'text', options: (sg && sg.options) || (inf && inf.options) || [], pii: !!((sg && sg.pii) || (inf && inf.pii)) };
              mapping[c.index] = '';
            } else { delete newDefs[c.index]; mapping[c.index] = sel.value; }
            runCheck(); // ตรวจใหม่ทันทีตามการจับคู่ที่เลือก
          });
          var a = analysis && analysis.byIndex[c.index];
          var sg = a && (a.aiSuggestion || a.suggestion);
          var sugCell = el('td', { class: 'small', attrs: { 'data-label': 'คำแนะนำ' } });
          if (sg) {
            sugCell.appendChild(el('div', { text: sugText(sg) }));
            if (sg.reason) sugCell.appendChild(el('div', { class: 'muted', text: sg.reason }));
            if (a.samples && a.samples.length) sugCell.appendChild(el('div', { class: 'muted', text: 'ตัวอย่าง: ' + a.samples.join(' · ') }));
            if (!sameAsNow(c, sg) && !(sg.action === 'new' && !canFields)) {
              pending.push([c, sg]);
              sugCell.appendChild(el('button', { class: 'btn btn-sm', attrs: { 'data-act': 'use-sug' }, text: 'ใช้คำแนะนำนี้', on: { click: function () { applySug(c, sg); runCheck(); } } }));
            }
          }
          var howCls = c.how === 'exact' || c.how === 'manual' ? 'b-ok' : (c.how === 'alias' || c.how === 'similar' ? 'b-soon' : 'b-cancel');
          mapBody.appendChild(el('tr', { style: { cursor: 'default' } },
            el('td', { attrs: { 'data-label': 'คอลัมน์ในไฟล์' }, text: c.header || '(ว่าง)' }),
            el('td', { attrs: { 'data-label': 'บันทึกลงช่อง' } }, sel),
            el('td', { attrs: { 'data-label': 'วิธีจับคู่' } }, el('span', { class: 'badge ' + (isNew ? 'b-progress' : howCls), text: isNew ? 'ช่องใหม่' : (MAP_HOW[c.how] || c.how) + (c.how === 'similar' ? ' ' + Math.round(c.score * 100) + '%' : '') })),
            sugCell));
          if (isNew) mapBody.appendChild(newFieldRow(c));
        });
        var tools = el('div', { class: 'row', style: { margin: '6px 0' } },
          pending.length ? el('button', { class: 'btn btn-sm', attrs: { 'data-act': 'use-all' }, text: 'ใช้คำแนะนำทั้งหมด (' + pending.length + ')', on: { click: function () { pending.forEach(function (x) { applySug(x[0], x[1]); }); runCheck(); } } }) : null,
          S.config.aiAvailable ? (aiBtn = el('button', { class: 'btn btn-sm', attrs: { 'data-act': 'ai-cols', title: 'ส่งเฉพาะชื่อคอลัมน์และตัวอย่างที่ปิดบังแล้ว (ไม่ส่งคอลัมน์ข้อมูลส่วนบุคคล) · ใช้โควตา AI วิเคราะห์เอกสาร' }, text: analysis && analysis.ai && analysis.ai.used ? '✨ AI วิเคราะห์แล้ว' : '✨ ให้ AI ช่วยวิเคราะห์คอลัมน์', on: { click: function () { runAnalyze(true).then(function () { drawResult(last.r, false); syncBtn(); }); } } })) : null,
          el('span', { class: 'muted small', text: 'คำแนะนำเป็นเพียงข้อเสนอ ระบบจะเปลี่ยนตามที่คุณกดเลือกเท่านั้น' }));
        var newCount = Object.keys(newDefs).length;
        out.appendChild(el('details', { class: 'map-box', open: r.columns.some(function (c) { return c.how !== 'exact'; }) || pending.length > 0 || newCount > 0 },
          el('summary', { text: 'การจับคู่คอลัมน์ (' + r.columns.filter(function (c) { return c.field; }).length + '/' + r.columns.length + ' คอลัมน์' + (newCount ? ' · ช่องใหม่ ' + newCount : '') + ') — แก้ได้ถ้าไม่ถูกต้อง' }),
          tools,
          el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
            el('thead', null, el('tr', null, ['คอลัมน์ในไฟล์', 'บันทึกลงช่อง', 'วิธีจับคู่', 'คำแนะนำ'].map(function (h) { return el('th', { text: h }); }))), mapBody))));
        if (!canFields && analysis && analysis.columns.some(function (x) { return x.suggestion && x.suggestion.action === 'skip' && /ไม่มีช่องเดิม/.test(x.suggestion.reason || ''); })) {
          out.appendChild(el('div', { class: 'muted small', text: 'คอลัมน์ที่ไม่มีช่องเดิมจะไม่ถูกนำเข้า — ถ้าต้องการเก็บ ให้ผู้ดูแลระบบหลักหรือผู้มีสิทธิ์ "จัดการช่องข้อมูล" สร้างช่องใหม่ก่อน' }));
        }
      }

      var upRows = r.results.filter(function (x) { return x.action === 'update'; });
      var master = null;
      if (!committed && upRows.length && canUpdate) {
        master = el('input', { type: 'checkbox', checked: upRows.every(function (x) { return chosen[x.row]; }) });
        master.addEventListener('change', function () { upRows.forEach(function (x) { chosen[x.row] = master.checked; }); drawRows(); syncBtn(); });
        out.appendChild(el('label', { class: 'check upd-all' }, master, 'อัปเดตรายการที่ซ้ำด้วยข้อมูลล่าสุดจากไฟล์ (' + upRows.length + ' รายการ) — ไม่ติ๊ก = ข้าม ไม่สร้างรายการซ้ำ'));
      }
      var focus = el('input', { type: 'checkbox', checked: !committed && (r.invalid > 0 || upRows.length > 0) });
      var tableBox = el('div', { class: 'table-wrap scroll-y', style: { maxHeight: '360px' } });
      function detail(x) {
        var parts = [];
        if (x.errors && x.errors.length) parts.push(el('div', { class: 'err-t', text: x.errors.join(' · ') }));
        if (x.changes && x.changes.length) parts.push(el('div', null, el('strong', { text: 'จะเปลี่ยน ' + (x.target ? x.target.code : '') + ': ' }),
          x.changes.map(function (c) { return el('span', { class: 'chg' }, c.f + ': ', el('s', { text: c.from || '(ว่าง)' }), ' → ', el('b', { text: c.to })); })));
        if (x.note) parts.push(el('div', { class: 'muted', text: x.note }));
        if (x.fixes && x.fixes.length) parts.push(el('div', { class: 'fix-t', text: 'ปรับอัตโนมัติ: ' + x.fixes.map(function (f) { return f.f + ' "' + f.from + '" → "' + f.to + '"'; }).join(' · ') }));
        if (committed && x.done && x.id) parts.push(el('div', { class: 'muted', text: 'บันทึกแล้ว' + (x.code ? ' · ' + x.code : '') }));
        return parts.length ? parts : '–';
      }
      function drawRows() {
        var list = r.results.filter(function (x) { return !focus.checked || x.action === 'error' || x.action === 'update'; }).slice(0, 400);
        clear(tableBox).appendChild(el('table', { class: 'data imp-rows' },
          el('thead', null, el('tr', null, ['แถว', 'ผล', 'รายการ', 'รายละเอียด'].concat(!committed && upRows.length && canUpdate ? ['อัปเดต'] : []).map(function (h) { return el('th', { text: h }); }))),
          el('tbody', null, list.map(function (x) {
            var act = committed && x.action === 'update' && !x.done ? 'skip' : x.action;
            var a = IMPORT_ACTION[act] || IMPORT_ACTION.error;
            var cb = null;
            if (!committed && x.action === 'update' && canUpdate) {
              cb = el('input', { type: 'checkbox', checked: !!chosen[x.row], attrs: { 'aria-label': 'อัปเดตแถว ' + x.row } });
              cb.addEventListener('change', function () { chosen[x.row] = cb.checked; if (master) master.checked = upRows.every(function (y) { return chosen[y.row]; }); syncBtn(); });
            }
            return el('tr', { style: { cursor: 'default' } },
              el('td', { class: 'nowrap', attrs: { 'data-label': 'แถว' }, text: String(x.row) }),
              el('td', { attrs: { 'data-label': 'ผล' } }, el('span', { class: 'badge ' + a[0], text: committed && x.done ? (x.action === 'update' ? 'อัปเดตแล้ว' : 'เพิ่มแล้ว') : a[1] })),
              el('td', { attrs: { 'data-label': 'รายการ' }, text: x.title }),
              el('td', { attrs: { 'data-label': 'รายละเอียด' }, class: 'small' }, detail(x)),
              !committed && upRows.length && canUpdate ? el('td', { attrs: { 'data-label': 'อัปเดต' } }, cb) : null);
          }))));
      }
      focus.addEventListener('change', drawRows);
      out.appendChild(el('label', { class: 'check small' }, focus, 'แสดงเฉพาะแถวที่ต้องตรวจ (ไม่ผ่าน / ซ้ำ)'));
      out.appendChild(tableBox);
      drawRows();
      if (r.invalid && !committed) out.appendChild(el('p', { class: 'muted small', text: 'แถวที่ "ไม่ผ่าน" จะไม่ถูกบันทึก — แก้ในไฟล์แล้วนำเข้าใหม่ได้ (แถวที่บันทึกแล้วจะขึ้นเป็น "เหมือนเดิม" ไม่ซ้ำ)' }));
      if (r.ignoredColumns && r.ignoredColumns.length) out.appendChild(el('div', { class: 'notice gold', style: { margin: '8px 0' }, text: 'คอลัมน์ที่ไม่นำเข้า: ' + r.ignoredColumns.join(', ') }));
    }
    /** แถวตั้งค่าช่องใหม่ (ชื่อ ชนิด ตัวเลือก ข้อมูลส่วนบุคคล) — แก้แล้วตรวจใหม่ทันที */
    function newFieldRow(c) {
      var d = newDefs[c.index];
      var types = (analysis && analysis.types) || [{ key: 'text', label: 'ข้อความ' }];
      var lab = el('input', { class: 'input', maxLength: 60, value: d.label, attrs: { 'aria-label': 'ชื่อช่องใหม่', 'data-nf': 'label' } });
      var typ = el('select', { class: 'input', attrs: { 'aria-label': 'ชนิดข้อมูลช่องใหม่', 'data-nf': 'type' } }, types.map(function (t) { return el('option', { value: t.key, text: t.label, selected: t.key === d.type }); }));
      var opt = el('input', { class: 'input' + (d.type === 'select' ? '' : ' hidden'), value: (d.options || []).join(' | '), placeholder: 'ตัวเลือก คั่นด้วย |', attrs: { 'aria-label': 'ตัวเลือก' } });
      var pii = el('input', { type: 'checkbox', checked: !!d.pii });
      var upd = function () { d.label = lab.value.trim(); d.type = typ.value; d.options = opt.value.split('|').map(function (x) { return x.trim(); }).filter(Boolean); d.pii = pii.checked; runCheck(); };
      lab.addEventListener('change', upd); opt.addEventListener('change', upd); pii.addEventListener('change', upd);
      typ.addEventListener('change', function () { opt.classList.toggle('hidden', typ.value !== 'select'); upd(); });
      return el('tr', { class: 'nf-row', style: { cursor: 'default' } }, el('td', { attrs: { colspan: '4' } },
        el('div', { class: 'nf-box' }, el('span', { class: 'small', text: 'ช่องใหม่จากคอลัมน์ "' + c.header + '":' }),
          el('div', { class: 'row' }, el('div', { style: { flex: '2', minWidth: '140px' } }, lab), el('div', { style: { flex: '1', minWidth: '120px' } }, typ), el('div', { style: { flex: '2', minWidth: '140px' } }, opt),
            el('label', { class: 'check small' }, pii, 'ข้อมูลส่วนบุคคล')))));
    }
    /** วิเคราะห์คอลัมน์ (กฎในระบบเสมอ · AI เมื่อผู้ใช้กดเอง) — ไม่เปลี่ยนอะไรจนกว่าผู้ใช้กดใช้คำแนะนำ */
    function runAnalyze(useAI) {
      var p = payload();
      if (!p) return Promise.resolve();
      var job = authed('analyzeImportColumns', cat, { headers: p.headers, rows: p.rows.slice(0, 30), useAI: !!useAI }, newRid()).then(function (a) {
        var byIndex = {}, typeLabel = {};
        a.columns.forEach(function (x) { byIndex[x.index] = x; });
        (a.types || []).forEach(function (t) { typeLabel[t.key] = t.label; });
        analysis = { columns: a.columns, byIndex: byIndex, types: a.types, typeLabel: typeLabel, ai: a.ai };
        if (useAI) {
          if (a.ai && a.ai.used) toast('AI วิเคราะห์แล้ว — ตรวจคำแนะนำแล้วกด "ใช้คำแนะนำนี้" เฉพาะข้อที่เห็นด้วย', 'ok');
          else toast((a.ai && a.ai.error) || 'AI วิเคราะห์ไม่สำเร็จ — ใช้คำแนะนำจากกฎในระบบแทน', 'warn');
        }
      }).catch(function (e) { if (useAI) showError(e); });
      return useAI && aiBtn ? busy(aiBtn, function () { return job; }) : job;
    }
    function selectedUpdates() { return last ? last.r.results.filter(function (x) { return x.action === 'update' && chosen[x.row]; }).map(function (x) { return x.row; }) : []; }
    function syncBtn() {
      if (!last) return;
      var u = selectedUpdates().length, c = last.r.creates;
      importBtn.textContent = 'นำเข้า (ใหม่ ' + c + (canUpdate && last.r.updates ? ' · อัปเดต ' + u : '') + ')';
      importBtn.classList.toggle('hidden', !(c + u));
    }
    function runCheck() {
      var p = payload();
      if (!p || !p.rows.length) { toast('ยังไม่มีข้อมูล กรุณาเลือกไฟล์หรือวางข้อมูลจากชีต (รวมหัวตาราง)', 'warn'); return Promise.resolve(); }
      if (p.rows.length > tpl.maxRows) { toast('นำเข้าได้ครั้งละไม่เกิน ' + tpl.maxRows + ' แถว', 'warn'); return Promise.resolve(); }
      return busy(checkBtn, function () {
        var nf = newFieldList();
        var pre = analysis ? Promise.resolve() : runAnalyze(false);
        return pre.then(function () { return authed('importRecords', cat, { headers: p.headers, rows: p.rows, mapping: mapping, newFields: nf, dryRun: true }, newRid()); }).then(function (r) {
          last = { p: p, r: r, rid: newRid(), mapping: mapping, newFields: nf };
          Object.keys(chosen).forEach(function (k) { if (!r.results.some(function (x) { return String(x.row) === k && x.action === 'update'; })) delete chosen[k]; });
          drawResult(r, false);
          syncBtn();
        }).catch(function (e) { clear(out); showErrors(out, e.message || 'ตรวจสอบไม่สำเร็จ', e.details || []); });
      });
    }
    checkBtn.addEventListener('click', function () { mapping = null; newDefs = {}; runCheck(); });

    importBtn.addEventListener('click', function () {
      if (!last) return;
      var ups = selectedUpdates(), r = last.r;
      var skip = r.total - r.creates - ups.length;
      var msg = 'หมวด "' + schema.label + '"\n• เพิ่มใหม่ ' + r.creates + ' รายการ' +
        (ups.length ? '\n• อัปเดต ' + ups.length + ' รายการเดิม ด้วยข้อมูลล่าสุดจากไฟล์ (เปลี่ยนเฉพาะช่องที่มีค่าในไฟล์)' : '') +
        (skip ? '\n• ข้าม ' + skip + ' แถว (ไม่ผ่าน / เหมือนเดิม / ซ้ำที่ไม่ได้เลือก)' : '') +
        (last.newFields.length ? '\n• สร้างช่องข้อมูลใหม่ ' + last.newFields.length + ' ช่อง: ' + last.newFields.map(function (n) { return n.label; }).join(', ') + '\n  (ระบบสำรองข้อมูลทั้งไฟล์ก่อน แล้วเพิ่มเป็นคอลัมน์ใหม่ท้ายชีต ไม่แก้/ลบคอลัมน์เดิม)' : '') +
        '\n\nระบบไม่สร้างรายการซ้ำ และบันทึกประวัติทุกรายการ';
      confirmBox({ title: 'ยืนยันการนำเข้า', okText: ups.length ? 'ยืนยัน เพิ่มและอัปเดต' : 'ยืนยันนำเข้า', message: msg }).then(function (c) {
        if (!c.ok) return;
        busy(importBtn, function () {
          var nfDone = last.newFields.length;
          return authed('importRecords', cat, { headers: last.p.headers, rows: last.p.rows, mapping: last.mapping, newFields: last.newFields, updateRows: ups, dryRun: false }, last.rid).then(function (res) {
            if (nfDone && !res.newFields) res.newFields = last.newFields;
            newDefs = {}; analysis = null;
            if (nfDone) reloadConfig().catch(function () { /* ignore */ });
            drawResult(res, true);
            importBtn.classList.add('hidden');
            toast('เพิ่ม ' + (res.imported || 0) + ' · อัปเดต ' + (res.updated || 0) + ' รายการ' + (res.skippedTotal ? ' · ข้าม ' + res.skippedTotal + ' แถว' : ''), res.skippedTotal ? 'warn' : 'ok');
            (res.linked || []).slice(0, 5).forEach(function (n) { toast(n, 'ok'); });
            area.value = ''; info.textContent = ''; source = null; book = null; fileInfo.textContent = ''; sheetSel.classList.add('hidden'); last = null;
            S.cache = {};
            refreshCurrent();
          }).catch(showError);
        });
      });
    });

    m.setBody(el('div', { class: 'stack' },
      el('div', { class: 'notice' },
        el('strong', { text: 'วิธีใช้' }),
        el('ol', { style: { margin: '6px 0 0', paddingLeft: '20px' } },
          el('li', { text: 'เลือกไฟล์ Excel (.xlsx) / CSV หรือคัดลอกเซลล์จากชีต (รวมแถวหัวตาราง) มาวาง' }),
          el('li', { text: 'กด "ตรวจสอบข้อมูล" — ระบบจับคู่คอลัมน์และปรับค่าที่สะกดต่างให้ตรงระบบอัตโนมัติ ตรวจได้ในตาราง' }),
          el('li', { text: 'ดูช่อง "คำแนะนำ" — คอลัมน์ที่ไม่มีช่องเดิม เลือก "➕ สร้างเป็นช่องใหม่" ได้ (เฉพาะผู้มีสิทธิ์จัดการช่องข้อมูล) · กด ✨ ให้ AI ช่วยวิเคราะห์ได้ ระบบไม่เปลี่ยนอะไรจนกว่าคุณกดเลือกเอง' }),
          el('li', { text: 'แถวที่ซ้ำกับรายการเดิม ระบบไม่สร้างใหม่ — ติ๊ก "อัปเดต" ถ้าต้องการแทนด้วยข้อมูลล่าสุดจากไฟล์' }),
          el('li', { text: 'กด "นำเข้า" แล้วตรวจสรุปก่อนยืนยัน' }))),
      el('div', { class: 'row' }, fileBtn, fileInput, sheetSel, fileInfo),
      el('div', { class: 'field' }, area, info),
      el('label', { class: 'check small' }, hasHeader, 'แถวแรกเป็นหัวตาราง'),
      el('details', null, el('summary', { class: 'small', style: { cursor: 'pointer' }, text: 'หัวตารางมาตรฐานและค่าที่ใช้ได้' }),
        el('div', { class: 'stack', style: { marginTop: '8px' } },
          el('div', { class: 'row' }, el('div', { style: { flex: '1', minWidth: '0' } }, tplInput), copyBtn),
          tpl.notes.length ? el('div', { class: 'small' }, tpl.notes.map(function (n) { return el('div', { style: { marginBottom: '4px' } }, el('strong', { text: n.label + ': ' }), n.options.join(' · ')); })) : null,
          el('div', { class: 'muted small', text: 'วันที่ใส่ได้หลายแบบ เช่น 15/11/2569, 15 พ.ย. 69, 2026-11-15 · ตัวเลขใส่คอมม่า/บาทได้ · ช่องอ้างอิงใส่รหัส เช่น AST2610-0001 · ครั้งละไม่เกิน ' + tpl.maxRows + ' แถว' }))),
      out));
    m.setFoot([el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); } } }), el('div', { class: 'spacer' }), checkBtn, importBtn]);
  }

  /* ============================== วิธีใช้งาน (เนื้อหาตามสิทธิ์ จากเซิร์ฟเวอร์) ============================== */

  function renderHelp(main) {
    authed('getHelpGuide').then(function (g) {
      clear(main);
      main.appendChild(pageHead('วิธีใช้งาน', 'คู่มือนี้แสดงเฉพาะสิ่งที่บัญชีของคุณทำได้ · อ่านทีละขั้นตอนตามลำดับ'));
      var you = el('div', { class: 'card card-pad help-you' },
        el('h3', { text: 'สิทธิ์ของคุณ' + (g.you.role ? ' · ' + g.you.role : '') }),
        g.you.categories.length ? el('div', { class: 'help-perms' }, g.you.categories.map(function (c) {
          return el('div', { class: 'hp-row' }, el('span', { class: 'hp-cat', text: c.label }), el('span', { class: 'hp-can' }, c.can.map(function (a) { return el('span', { class: 'chip', text: a }); })));
        })) : el('div', { class: 'notice gold', text: 'ยังไม่ได้รับสิทธิ์หมวดข้อมูลใด กรุณาติดต่อผู้ดูแลระบบ' }),
        g.you.extras.length ? el('div', { class: 'muted small', style: { marginTop: '8px' }, text: 'ใช้ได้เพิ่มเติม: ' + g.you.extras.join(' · ') }) : null);
      main.appendChild(you);
      var toc = el('div', { class: 'help-toc' });
      var list = el('div', { class: 'help-list' });
      g.sections.forEach(function (sec, i) {
        var box = el('details', { class: 'card help-sec', id: 'help-' + sec.id, open: i < 2 },
          el('summary', null, el('span', { class: 'hs-ico' }, svg(ICON[sec.icon] || ICON.help, 18)), el('span', { class: 'hs-t', text: (i + 1) + '. ' + sec.title })),
          el('div', { class: 'hs-body' },
            sec.intro ? el('div', { class: 'notice', style: { marginBottom: '10px' }, text: sec.intro }) : null,
            el('ol', { class: 'hs-steps' }, sec.steps.map(function (st) { return el('li', { text: st }); })),
            sec.tips && sec.tips.length ? el('div', { class: 'hs-tips' }, el('strong', { text: 'ข้อควรรู้' }), el('ul', null, sec.tips.map(function (t) { return el('li', { text: t }); }))) : null));
        list.appendChild(box);
        toc.appendChild(el('button', { class: 'chip chip-btn', text: sec.title, on: { click: function () { box.open = true; box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }));
      });
      main.appendChild(el('div', { class: 'section' }, toc));
      main.appendChild(list);
    }).catch(function (e) { errorState(main, e, function () { navigate('help'); }); });
  }

  /* ============================== ผู้ใช้งาน ============================== */

  function renderUsers(main) {
    authed('listUsers').then(function (d) {
      clear(main);
      main.appendChild(pageHead('ผู้ใช้งานและสิทธิ์', 'ผู้ใช้เข้าสู่ระบบด้วยรหัส OTP ทางอีเมล ไม่มีรหัสผ่าน · การเปลี่ยนสิทธิ์มีผลทันที',
        el('button', { class: 'btn btn-primary', on: { click: function () { userForm(d, null); } } }, svg(ICON.plus, 18), 'เพิ่มผู้ใช้')));
      var catLabel = {}; d.categories.forEach(function (c) { catLabel[c.key] = c.label; });
      main.appendChild(el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', null, el('tr', null, ['ชื่อ', 'อีเมล', 'บทบาท', 'หมวดที่เข้าถึง', 'สถานะ', 'เข้าสู่ระบบล่าสุด'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, d.users.map(function (u) {
          return el('tr', { on: { click: function () { userForm(d, u); } } },
            el('td', { attrs: { 'data-label': 'ชื่อ' }, text: u.displayName }),
            el('td', { attrs: { 'data-label': 'อีเมล' }, text: u.email }),
            el('td', { attrs: { 'data-label': 'บทบาท' } }, el('span', { class: 'badge ' + (u.role === 'Admin' ? 'b-sold' : 'b-progress'), text: u.role }), u.superAdmin ? el('span', { class: 'badge b-ok', style: { marginLeft: '4px' }, text: 'ผู้ดูแลระบบหลัก' }) : null),
            el('td', { attrs: { 'data-label': 'หมวด' }, text: u.categories.indexOf('*') !== -1 ? 'ทุกหมวด' : u.categories.map(function (c) { return catLabel[c] || c; }).join(', ') || '–' }),
            el('td', { attrs: { 'data-label': 'สถานะ' } }, el('span', { class: 'badge ' + (u.active ? 'b-ok' : 'b-cancel'), text: u.active ? 'ใช้งาน' : 'ปิดใช้งาน' })),
            el('td', { attrs: { 'data-label': 'ล่าสุด' }, text: fmtTs(u.lastLoginAt) }));
        }))))));
    }).catch(function (e) { errorState(main, e, function () { navigate('users'); }); });
  }

  function userForm(d, u) {
    var isNew = !u, isSelf = u && u.id === S.profile.id;
    var email = el('input', { class: 'input', type: 'email', value: u ? u.email : '', disabled: !isNew });
    var name = el('input', { class: 'input', value: u ? u.displayName : '', maxLength: 120 });
    var role = el('select', { class: 'input', disabled: isSelf }, d.roles.map(function (r) { return el('option', { value: r.role, text: r.label + ' (' + r.role + ')', selected: u ? u.role === r.role : r.role === 'Viewer' }); }));
    var active = el('input', { type: 'checkbox', checked: u ? u.active : true, disabled: isSelf });
    var note = el('input', { class: 'input', value: u ? u.note || '' : '', maxLength: 500 });
    var catBox = el('div'), extraBox = el('div'), deniedBox = el('div'), roleDesc = el('div', { class: 'notice' });
    var state = { cats: u ? u.categories.slice() : [], extra: u ? u.extraPermissions.slice() : [], denied: u ? u.deniedPermissions.slice() : [] };
    function chk(list, key, label, disabled) {
      var c = el('input', { type: 'checkbox', checked: list.indexOf(key) !== -1, disabled: disabled });
      c.addEventListener('change', function () { var i = list.indexOf(key); if (c.checked && i === -1) list.push(key); if (!c.checked && i !== -1) list.splice(i, 1); drawPerm(); });
      return el('label', { class: 'check' }, c, label);
    }
    function drawPerm() {
      var r = d.roles.filter(function (x) { return x.role === role.value; })[0];
      roleDesc.textContent = r.desc;
      state.extra = state.extra.filter(function (p) { return r.grantable.indexOf(p) !== -1; });
      state.denied = state.denied.filter(function (p) { return r.actions.indexOf(p) !== -1 || r.global.indexOf(p) !== -1; });
      var allowAll = role.value === 'Admin' || role.value === 'Executive';
      if (!allowAll) state.cats = state.cats.filter(function (c) { return c !== '*'; });
      var all = state.cats.indexOf('*') !== -1;
      clear(catBox).appendChild(el('div', { class: 'check-grid' },
        allowAll ? chk(state.cats, '*', 'ทุกหมวด', isSelf) : null,
        d.categories.map(function (c) { return chk(state.cats, c.key, c.label, isSelf || all); })));
      clear(extraBox).appendChild(r.grantable.length ? el('div', { class: 'check-grid' }, r.grantable.map(function (p) { return chk(state.extra, p, d.permissionLabels[p] || p, isSelf); }))
        : el('div', { class: 'muted small', text: 'บทบาทนี้มีสิทธิ์ครบแล้ว' }));
      clear(deniedBox).appendChild(el('div', { class: 'check-grid' }, r.actions.concat(r.global).map(function (p) { return chk(state.denied, p, d.permissionLabels[p] || p, isSelf); })));
    }
    role.addEventListener('change', drawPerm);
    var errBox = el('div');
    var save = el('button', { class: 'btn btn-primary', text: 'บันทึก' });
    var foot = [];
    // v1.15 ลบผู้ใช้ (เซิร์ฟเวอร์กันบัญชีตนเอง · ผู้ดูแลระบบหลัก · Admin คนสุดท้าย)
    if (!isNew && !isSelf && !u.superAdmin) foot.push(el('button', { class: 'btn btn-danger solid', text: 'ลบผู้ใช้', on: { click: function () {
      confirmBox({ title: 'ลบผู้ใช้ — ' + u.displayName, danger: true, okText: 'ลบผู้ใช้', requireText: u.email,
        message: 'ผู้ใช้จะถูกลบออกจากระบบและออกจากระบบทันที เข้าใช้งานไม่ได้อีก\nประวัติการใช้งานและรายการที่ผู้ใช้เคยบันทึกยังอยู่ครบ\nถ้าแค่ต้องการระงับชั่วคราว ให้เอาติ๊ก "เปิดใช้งานบัญชี" ออกแทน' })
        .then(function (x) { if (x.ok) return authed('deleteUser', u.id, x.text, newRid()).then(function () { toast('ลบผู้ใช้แล้ว', 'ok'); m.close(); navigate('users'); }).catch(showError); });
    } } }));
    if (!isNew && !isSelf) foot.push(el('button', { class: 'btn btn-danger', text: 'บังคับออกจากระบบทุกอุปกรณ์', on: { click: function (ev) {
      var b = ev.currentTarget; busy(b, function () { return authed('revokeUserSessions', u.id, newRid()).then(function () { toast('ผู้ใช้ถูกออกจากระบบแล้ว', 'ok'); }).catch(showError); });
    } } }));
    foot.push(el('div', { class: 'spacer' }), el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save);
    var m = openModal({
      title: isNew ? 'เพิ่มผู้ใช้' : 'แก้ไขผู้ใช้ — ' + u.displayName, sticky: true,
      body: el('div', { class: 'stack' }, errBox,
        isSelf ? el('div', { class: 'notice gold', text: 'นี่คือบัญชีของคุณ — แก้ไขได้เฉพาะชื่อที่แสดง (ป้องกันการยกระดับหรือล็อกสิทธิ์ตนเอง)' }) : null,
        el('div', { class: 'muted small', text: 'การตั้งค่าระบบและการเพิ่ม/ลด/ลบสิทธิ์ผู้ใช้ ทำได้เฉพาะผู้ดูแลระบบหลักคนเดียว — ผู้ใช้บทบาท Admin คนอื่นจะไม่เห็นเมนูนี้' }),
        el('div', { class: 'form-grid' },
          el('div', { class: 'field' }, el('label', { text: 'อีเมล (ใช้เข้าสู่ระบบ)' }), email, !isNew ? el('div', { class: 'hint', text: 'เปลี่ยนอีเมลไม่ได้ — ให้สร้างผู้ใช้ใหม่' }) : null),
          el('div', { class: 'field' }, el('label', { text: 'ชื่อที่แสดง' }), name),
          el('div', { class: 'field' }, el('label', { text: 'บทบาท' }), role),
          el('div', { class: 'field' }, el('label', { text: 'หมายเหตุ' }), note),
          el('div', { class: 'span-2' }, roleDesc),
          el('div', { class: 'field span-2' }, el('label', { text: 'หมวดที่เข้าถึงได้' }), catBox),
          el('div', { class: 'field span-2' }, el('label', { text: 'สิทธิ์เพิ่มเติม (มอบเพิ่มจากบทบาท)' }), extraBox),
          el('div', { class: 'field span-2' }, el('label', { text: 'ระงับสิทธิ์ (ตัดออกจากบทบาท)' }), deniedBox),
          el('label', { class: 'check span-2' }, active, 'เปิดใช้งานบัญชี'))),
      foot: foot
    });
    drawPerm();
    save.addEventListener('click', function () {
      var data = { displayName: name.value.trim(), role: role.value, categories: state.cats, extraPermissions: state.extra, deniedPermissions: state.denied, active: active.checked, note: note.value.trim() };
      if (isNew) data.email = email.value.trim(); else data.id = u.id;
      busy(save, function () {
        return authed('saveUser', data, newRid()).then(function () { toast('บันทึกผู้ใช้แล้ว', 'ok'); m.close(); navigate('users'); })
          .catch(function (e) { showErrors(errBox, e.message, e.details || []); });
      });
    });
  }

  /* ============================== ตั้งค่าระบบ ============================== */

  var SETTING_GROUPS = [
    ['ทั่วไป', ['APP_DISPLAY_NAME', 'ORG_NAME', 'DATA_ENV', 'PAGE_SIZE', 'DUE_SOON_DAYS']],
    ['ความปลอดภัยการเข้าสู่ระบบ', ['SESSION_HOURS', 'OTP_TTL_MIN', 'OTP_MAX_ATTEMPTS', 'LOGIN_LOCK_MIN']],
    ['ไฟล์แนบ', ['MAX_UPLOAD_MB', 'ALLOWED_FILE_EXT', 'IMAGE_COMPRESS', 'IMAGE_MAX_PX', 'IMAGE_QUALITY']],
    ['แจ้งเตือน LINE', ['LINE_ENABLED', 'LINE_FLEX', 'LINE_CHANGE_NOTIFY', 'WEB_APP_URL', 'LINE_MONTHLY_BUDGET', 'LINE_NEAR_LIMIT_PCT', 'LINE_NONURGENT_TYPES', 'ERROR_ALERTS']],
    ['แจ้งนัดประชุม / แจ้งเตือนเช้าวันประชุม', ['MEETING_REMINDER_ENABLED', 'MEETING_REMINDER_MAX_TRIES', 'MEETING_REMINDER_MISSED', 'MEETING_DM_WINDOW_ONLY', 'MEETING_DM_EXECUTIVES', 'LINE_BOT_BASIC_ID']],
    ['AI (Gemini)', ['AI_ENABLED', 'AI_MAX_PER_USER_DAY', 'AI_MAX_CALLS_PER_DAY', 'AI_MAX_PER_USER_MONTH', 'AI_MAX_CALLS_PER_MONTH', 'AI_TYPE_LIMITS', 'GEMINI_MODEL']],
    ['ไฟล์สัญญาเช่า', ['CONTRACT_FILE_EXT', 'CONTRACT_FOLDER_ID', 'CONTRACT_TENANT_SUBFOLDER']],
    ['ช่องค้นหา/เลือกรายการอ้างอิงในฟอร์ม', ['REF_LOOKUP_FOR_EDITORS', 'REF_LOOKUP_SHOW_NAME', 'REF_QUICK_ADD_FOR_EDITORS']],
    ['การเก็บรักษาข้อมูลและ PDPA', ['BACKUP_FREQUENCY_DAYS', 'BACKUP_RETENTION_DAYS', 'PURGE_MIN_DAYS', 'LEGAL_HOLD_CATEGORIES', 'PDPA_PURPOSES', 'RETENTION_POLICY']]
  ];

  function renderSettings(main) {
    Promise.all([authed('getSettings'), authed('getSystemStatus'), canG('backup') ? authed('listBackups') : Promise.resolve(null)])
      .then(function (res) {
        var set = res[0], sys = res[1], bk = res[2];
        clear(main);
        main.appendChild(pageHead('ตั้งค่าระบบ', 'ค่าลับ (API Key/Token) ตั้งใน Apps Script → Project Settings → Script Properties เท่านั้น'));
        main.appendChild(statusCard(sys));
        main.appendChild(actionsCard(sys));
        if (S.config.canManageFields) main.appendChild(columnsCard());
        if (canG('manageSettings')) main.appendChild(lineGroupsCard());
        if (bk) main.appendChild(backupCard(bk));
        main.appendChild(settingsForm(set));
      }).catch(function (e) { errorState(main, e, function () { navigate('settings'); }); });
  }

  /* ---------- v1.14 โครงสร้างคอลัมน์ Google Sheets (ผู้มีสิทธิ์จัดการช่องข้อมูล · เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำทุกคำสั่ง) ---------- */
  var COL_KIND = {
    system: ['ข้อมูลระบบ', 'b-lock'], field: ['ช่องของระบบ', 'b-progress'], custom: ['ช่องเพิ่มเติม', 'b-scheduled'],
    unknown: ['ใหม่ในชีต (ยังไม่ใช้)', 'b-soon'], hiddenCustom: ['ช่องเพิ่มเติมที่ซ่อนไว้', 'b-cancel'], empty: ['ไม่มีหัวคอลัมน์', 'b-cancel']
  };
  var COL_SRC = { SHEET: 'แก้ในชีตโดยตรง', REFRESH: 'กดรีเฟรช', MAP: 'ยืนยันชื่อใหม่', RENAME: 'เปลี่ยนชื่อจากหน้าเว็บ', DELETE: 'ลบจากหน้าเว็บ', RESTORE: 'คืนคอลัมน์', ADOPT: 'เพิ่มเป็นช่องข้อมูล' };
  function columnsCard() {
    var cats = Object.keys(S.config.schemas).filter(function (c) { return c !== 'meetings' || canG('manageSettings'); });
    var sel = el('select', { class: 'input', style: { width: 'auto', minWidth: '200px' } }, cats.map(function (c) { return el('option', { value: c, text: S.config.schemas[c].label }); }));
    var box = el('div', { class: 'section' });
    var load = function (refresh) {
      var cat = sel.value;
      return authed(refresh ? 'refreshColumnStructure' : 'getColumnStructure', cat).then(function (r) {
        renderColumnReport(box, r, cat, function () { return load(false); });
        if (refresh) { toast('รีเฟรชโครงสร้างคอลัมน์แล้ว — หน้าเว็บทุกเครื่องจะโหลดฟอร์ม/ตารางใหม่ภายใน 1 นาที', 'ok'); return reloadConfig(); }
      }).catch(function (e) { clear(box).appendChild(el('div', { class: 'errors', text: e.message || 'โหลดไม่สำเร็จ' })); });
    };
    sel.addEventListener('change', function () { clear(box); });
    return el('div', { class: 'card card-pad section' }, el('h3', { text: 'โครงสร้างคอลัมน์ Google Sheets' }),
      el('div', { class: 'notice', text: 'ฟอร์มเพิ่ม/แก้ไข ตาราง และหน้ารายละเอียด สร้างจากหัวคอลัมน์จริงในชีตของแต่ละหมวด · ระบบตรวจหัวคอลัมน์ทุกชีตอัตโนมัติประมาณนาทีละครั้ง (เพิ่ม/ลบ/เปลี่ยนชื่อในชีตโดยตรงก็ตรวจพบ) · ระบบไม่เดาว่าคอลัมน์ที่เปลี่ยนชื่อคือคอลัมน์เดิม ต้องให้ผู้ดูแลยืนยันก่อนทุกครั้ง' }),
      el('div', { class: 'row section' }, sel,
        actionBtn('ตรวจโครงสร้างล่าสุด', function () { return load(false); }, 'btn-primary'),
        actionBtn('รีเฟรชโครงสร้างคอลัมน์', function () { return load(true); })),
      box);
  }

  /** v1.15 ปุ่ม "จัดการคอลัมน์" ในหน้าหมวด: เพิ่ม/ลบ/เปลี่ยนชื่อคอลัมน์ แล้วโหลดตารางใหม่เมื่อปิด */
  function openColumnManager(cat) {
    var box = el('div', null, el('div', { class: 'muted', text: 'กำลังอ่านหัวคอลัมน์จากชีต…' }));
    var changed = false;
    var load = function () {
      return authed('getColumnStructure', cat).then(function (r) { renderColumnReport(box, r, cat, function () { changed = true; return load(); }); })
        .catch(function (e) { clear(box).appendChild(el('div', { class: 'errors', text: e.message || 'โหลดไม่สำเร็จ' })); });
    };
    var m = openModal({ title: 'จัดการคอลัมน์ — ' + S.config.schemas[cat].label, body: box,
      foot: [el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); } } })],
      onClose: function () { if (changed) { S.cache = {}; navigate('cat:' + cat); } } });
    load();
  }

  function addColumnDlg(cat, types, after) {
    var name = el('input', { class: 'input', maxLength: 60 });
    var type = el('select', { class: 'input' }, types.map(function (t) { return el('option', { value: t.key, text: t.label }); }));
    var opts = el('textarea', { class: 'input', rows: 3, placeholder: 'ตัวเลือก 1 บรรทัดต่อ 1 ค่า' });
    var optBox = el('div', { class: 'field hidden' }, el('label', { text: 'ตัวเลือก' }), opts);
    var pii = el('input', { type: 'checkbox' });
    type.addEventListener('change', function () { optBox.classList.toggle('hidden', type.value !== 'select'); });
    var save = el('button', { class: 'btn btn-primary', text: 'เพิ่มคอลัมน์' });
    var m = openModal({ title: 'เพิ่มคอลัมน์ — ' + S.config.schemas[cat].label, size: 'sm', sticky: true,
      body: el('div', { class: 'stack' }, el('div', { class: 'field' }, el('label', { text: 'ชื่อคอลัมน์' }), name),
        el('div', { class: 'field' }, el('label', { text: 'ชนิดข้อมูล' }), type), optBox,
        el('label', { class: 'check' }, pii, 'เป็นข้อมูลส่วนบุคคล'),
        el('div', { class: 'notice', text: 'คอลัมน์ใหม่จะอยู่ท้ายชีต และขึ้นในฟอร์มเพิ่ม/แก้ไขของหมวดนี้ทันที · เปลี่ยนชนิดข้อมูลภายหลังไม่ได้' })),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save] });
    var rid = newRid();
    save.addEventListener('click', function () {
      var data = { category: cat, label: name.value, type: type.value, pii: pii.checked, options: type.value === 'select' ? opts.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [] };
      busy(save, function () { return authed('saveFieldDef', data, rid).then(function () { m.close(); return after({ message: 'เพิ่มคอลัมน์ "' + name.value + '" แล้ว' }); }).catch(showError); });
    });
  }

  function renderColumnReport(box, r, cat, reload) {
    var after = function (res) { toast(res.message || 'ดำเนินการแล้ว', 'ok'); S.cache = {}; return reloadConfig().catch(function () {}).then(reload); };
    var addBtn = r.canAdopt ? el('div', { class: 'row section' }, el('button', { class: 'btn btn-primary', text: '+ เพิ่มคอลัมน์', on: { click: function () { addColumnDlg(cat, r.types, after); } } })) : null;
    var head = el('div', { class: 'row small muted' },
      el('span', { class: 'chip' }, 'ชีต ' + r.sheet), el('span', { class: 'chip' }, r.dataRows + ' แถวข้อมูล'),
      el('span', { class: 'chip' }, 'หัวคอลัมน์: ' + (r.headerMode === 'th' ? 'ภาษาไทย' : 'รหัสระบบ')),
      el('span', { class: 'chip' }, 'เปลี่ยนโครงสร้างล่าสุด: ' + (r.lastChange ? fmtTs(r.lastChange.at) + ' (' + (COL_SRC[r.lastChange.source] || r.lastChange.source) + ')' : 'ยังไม่มีบันทึก')),
      el('span', { class: 'chip' }, 'ตรวจเมื่อ ' + fmtTs(r.checkedAt)));
    var issues = r.issues.length ? el('div', { class: 'errors section' }, el('strong', { text: 'พบปัญหาโครงสร้าง' }), el('ul', null, r.issues.map(function (x) { return el('li', { text: x }); }))) : el('div', { class: 'notice section', text: 'โครงสร้างปกติ — ไม่พบหัวคอลัมน์ซ้ำหรือคอลัมน์จำเป็นที่หายไป' });

    var rows = r.columns.map(function (c) {
      var kind = COL_KIND[c.kind] || [c.kind, 'b-cancel'];
      var acts = [];
      if (c.kind === 'field' || c.kind === 'custom') {
        acts.push(el('button', { class: 'btn btn-sm', text: 'เปลี่ยนชื่อ', on: { click: function () { renameColumnDlg(cat, c, after); } } }));
        if (r.canDelete && !c.critical) acts.push(el('button', { class: 'btn btn-sm btn-danger', text: 'ลบคอลัมน์', on: { click: function () { deleteColumnDlg(cat, c, after); } } }));
      }
      if (c.kind === 'unknown' && r.canAdopt && !c.duplicate) acts.push(el('button', { class: 'btn btn-sm btn-primary', text: 'ใช้เป็นช่องข้อมูล', on: { click: function () { adoptColumnDlg(cat, c, r.types, after); } } }));
      if (c.kind === 'unknown' && r.canDelete) acts.push(el('button', { class: 'btn btn-sm btn-danger', text: 'ลบคอลัมน์', on: { click: function () { deleteColumnDlg(cat, c, after); } } }));
      return el('tr', { style: { cursor: 'default' } },
        el('td', { class: 'mono', attrs: { 'data-label': 'คอลัมน์' }, text: c.letter }),
        el('td', { attrs: { 'data-label': 'หัวคอลัมน์ในชีต' } }, c.header || '–', c.duplicate ? el('span', { class: 'badge b-bad x-badge', text: 'ซ้ำ' }) : null),
        el('td', { attrs: { 'data-label': 'บนหน้าเว็บ' } }, el('span', { class: 'badge ' + kind[1], text: kind[0] }), c.critical ? el('span', { class: 'badge b-sens x-badge', text: 'จำเป็นต่อระบบ' }) : null,
          c.label && c.label !== c.header ? el('div', { class: 'small muted', text: 'แสดงเป็น "' + c.label + '"' }) : null),
        el('td', { class: 'num', attrs: { 'data-label': 'มีข้อมูล' }, text: fmtNum(c.filled) + (c.formulas ? ' (สูตร ' + c.formulas + ')' : '') }),
        el('td', { class: 'small', attrs: { 'data-label': 'ใช้ใน' }, text: (c.usage || []).join(' · ') || '–' }),
        el('td', { attrs: { 'data-label': 'จัดการ' } }, el('div', { class: 'row', style: { gap: '6px' } }, acts.length ? acts : el('span', { class: 'muted small', text: '–' }))));
    });
    var table = el('div', { class: 'table-wrap section' }, el('table', { class: 'data' },
      el('thead', null, el('tr', null, ['คอลัมน์', 'หัวคอลัมน์ในชีต', 'บนหน้าเว็บ', 'มีข้อมูล', 'ใช้ใน', 'จัดการ'].map(function (h) { return el('th', { text: h }); }))),
      el('tbody', null, rows)));

    // v1.14.1 คอลัมน์ระบบหาย (เช่น จัดชีตใหม่ตามตารางของผู้ใช้) → ปุ่มซ่อมครั้งเดียว: เพิ่มคอลัมน์ระบบต่อท้าย + เติมค่าเฉพาะช่องว่าง
    var sysGone = r.missing.filter(function (m) { return m.system && m.critical; });
    var repair = sysGone.length ? el('div', { class: 'notice gold section' },
      el('div', { text: 'ไม่พบคอลัมน์ระบบในชีต: ' + sysGone.map(function (m) { return m.label; }).join(', ') + ' — หมวดนี้จึงบันทึกไม่ได้ กด "ซ่อมคอลัมน์ระบบ" เพื่อเพิ่มคอลัมน์เหล่านี้ต่อท้ายชีต และเติมรหัส/สถานะให้รายการเดิม (เติมเฉพาะช่องที่ว่าง ไม่แก้ข้อมูลที่กรอกไว้ ไม่ย้ายคอลัมน์ของคุณ)' }),
      el('div', { class: 'row', style: { marginTop: '8px' } }, el('button', { class: 'btn btn-gold', text: 'ซ่อมคอลัมน์ระบบ', on: { click: function (ev) {
        var b = ev.currentTarget;
        confirmBox({ title: 'ซ่อมคอลัมน์ระบบ — ' + r.label, okText: 'ซ่อม', message: 'ระบบจะ:\n• เพิ่มคอลัมน์ต่อท้ายชีต ' + r.sheet + ': ' + sysGone.map(function (m) { return m.label; }).join(', ') +
          '\n• เติมรหัสรายการ / รหัสอัตโนมัติ / สถานะเริ่มต้น ให้แถวเดิมที่ยังว่าง\n\nข้อมูลที่กรอกไว้และลำดับคอลัมน์ของคุณไม่ถูกแก้ · แนะนำ: กด "สำรองข้อมูลตอนนี้" ก่อน' })
          .then(function (c) { if (c.ok) return busy(b, function () { return authed('repairSystemColumns', cat, newRid()).then(after).catch(showError); }); });
      } } }))) : null;
    var missing = r.missing.length ? el('div', { class: 'section' }, el('h3', { text: 'ช่องของระบบที่ไม่พบในชีต (' + r.missing.length + ')' }),
      el('div', { class: 'list-rows' }, r.missing.map(function (m) {
        var pick = m.candidates.length ? el('select', { class: 'input', style: { width: 'auto', minWidth: '180px' } },
          el('option', { value: '', text: '— เลือกคอลัมน์ที่เป็นช่องนี้ (ชื่อใหม่) —' }),
          m.candidates.map(function (x) { return el('option', { value: String(x.col), text: x.letter + ' "' + x.header + '"' + (x.samePosition ? ' (ตำแหน่งเดิม)' : '') }); })) : null;
        var acts = [];
        if (pick && m.wasSeen) acts.push(pick, el('button', { class: 'btn btn-sm btn-primary', text: 'ยืนยันว่าเป็นคอลัมน์เดิม', on: { click: function () {
          var x = m.candidates.filter(function (y) { return String(y.col) === pick.value; })[0];
          if (!x) { toast('เลือกคอลัมน์ก่อน', 'warn'); return; }
          confirmBox({ title: 'ยืนยันการจับคู่คอลัมน์', message: 'คอลัมน์ ' + x.letter + ' "' + x.header + '" คือช่อง "' + m.label + '" ที่ถูกเปลี่ยนชื่อในชีต ใช่หรือไม่?\n\nหลังยืนยัน ข้อมูลในคอลัมน์นี้จะแสดงเป็นช่อง "' + m.label + '" (ชื่อบนหน้าเว็บเปลี่ยนเป็น "' + x.header + '") และการบันทึกจะเขียนลงคอลัมน์นี้\nถ้าไม่แน่ใจ ให้ตรวจข้อมูลในคอลัมน์ก่อน', okText: 'ยืนยัน' })
            .then(function (c) { if (c.ok) return authed('mapColumnHeader', cat, m.key, x.col, x.header, newRid()).then(after).catch(showError); });
        } } }));
        if (m.wasSeen) acts.push(el('button', { class: 'btn btn-sm', text: 'คืนคอลัมน์ (ว่าง)', on: { click: function () {
          confirmBox({ title: 'คืนคอลัมน์', message: 'เพิ่มคอลัมน์ "' + m.label + '" ต่อท้ายชีต ' + r.sheet + '\n\nคอลัมน์ใหม่จะว่างเปล่า — ระบบไม่สร้างข้อมูลเดิมขึ้นเอง ถ้าต้องการข้อมูลเดิม ให้คัดลอกจากไฟล์สำรองหรือประวัติเวอร์ชันของ Google Sheets\nถ้าคอลัมน์เดิมแค่ถูกเปลี่ยนชื่อ ให้ใช้ "ยืนยันว่าเป็นคอลัมน์เดิม" แทน', okText: 'เพิ่มคอลัมน์' })
            .then(function (c) { if (c.ok) return authed('restoreColumn', cat, m.key, newRid()).then(after).catch(showError); });
        } } }));
        return el('div', { class: 'lrow', style: { cursor: 'default', flexWrap: 'wrap' } },
          el('div', { class: 'main-t' }, el('div', { class: 't1' }, m.label, m.critical ? el('span', { class: 'badge b-sens x-badge', text: 'จำเป็นต่อระบบ' }) : null),
            el('div', { class: 't2', text: m.wasSeen ? 'ถูกลบหรือเปลี่ยนชื่อในชีต (เดิมอยู่คอลัมน์ ' + m.lastLetter + ') · ' + (m.critical ? 'หมวดนี้หยุดบันทึกจนกว่าจะแก้' : 'ซ่อนจากฟอร์ม/ตารางแล้ว ไม่บันทึกลงคอลัมน์ที่ไม่มี') + ' · ใช้ใน: ' + m.usage.join(' · ')
              : 'ยังไม่มีในชีต (ช่องใหม่ของรุ่นระบบ) — ระบบเติมคอลัมน์ให้เมื่อบันทึกครั้งแรก หรือกด "อัปเดตโครงสร้างชีต"' })),
          el('div', { class: 'row', style: { gap: '6px' } }, acts));
      }))) : null;
    clear(box);
    append(box, [head, issues, repair, addBtn, table, missing]);
  }

  function renameColumnDlg(cat, c, after) {
    var inp = el('input', { class: 'input', maxLength: 60, value: c.label || c.header });
    var save = el('button', { class: 'btn btn-primary', text: 'บันทึกชื่อใหม่' });
    var m = openModal({ title: 'เปลี่ยนชื่อคอลัมน์ ' + c.letter, size: 'sm', sticky: true,
      body: el('div', { class: 'stack' }, el('div', { class: 'field' }, el('label', { text: 'ชื่อใหม่' }), inp),
        el('div', { class: 'notice', text: 'ข้อมูลเดิมในคอลัมน์ไม่ย้ายและไม่หาย · ระบบจับคู่ด้วยรหัสช่อง ฟอร์ม ตาราง รายงาน และการแจ้งเตือนที่ใช้ช่องนี้จึงทำงานต่อได้ · ใช้ใน: ' + (c.usage || []).join(' · ') })),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save] });
    var rid = newRid();
    save.addEventListener('click', function () {
      busy(save, function () { return authed('renameColumn', cat, c.key, inp.value, rid).then(function (res) { m.close(); return after(res); }).catch(showError); });
    });
  }

  function deleteColumnDlg(cat, c, after) {
    confirmBox({ title: 'ลบคอลัมน์ ' + c.letter + ' "' + c.header + '"', danger: true, okText: 'ลบคอลัมน์',
      message: 'ชีตที่ได้รับผลกระทบ: ' + S.config.schemas[cat].label + '\nข้อมูลในคอลัมน์: ' + fmtNum(c.filled) + ' ช่อง' + (c.formulas ? ' (มีสูตร ' + c.formulas + ' ช่อง)' : '') +
        '\nใช้ใน: ' + (c.usage || []).join(' · ') +
        '\n\n⚠️ ข้อมูลในคอลัมน์นี้จะถูกลบออกจากชีต กู้คืนได้จากไฟล์สำรองหรือประวัติเวอร์ชันของ Google Sheets เท่านั้น · สูตรในชีตอื่นที่อ้างอิงคอลัมน์นี้อาจเสีย\nแนะนำ: กด "สำรองข้อมูลตอนนี้" ก่อนลบ',
      requireText: c.header })
      .then(function (x) { if (x.ok) return authed('deleteColumn', cat, c.key || '', x.text, newRid(), c.col).then(after).catch(showError); });
  }

  function adoptColumnDlg(cat, c, types, after) {
    var type = el('select', { class: 'input' }, types.map(function (t) { return el('option', { value: t.key, text: t.label }); }));
    var opts = el('textarea', { class: 'input', rows: 3, placeholder: 'ตัวเลือก 1 บรรทัดต่อ 1 ค่า' });
    var optBox = el('div', { class: 'field hidden' }, el('label', { text: 'ตัวเลือก' }), opts);
    var pii = el('input', { type: 'checkbox' });
    type.addEventListener('change', function () { optBox.classList.toggle('hidden', type.value !== 'select'); });
    var save = el('button', { class: 'btn btn-primary', text: 'ใช้เป็นช่องข้อมูล' });
    var m = openModal({ title: 'ใช้คอลัมน์ ' + c.letter + ' "' + c.header + '" เป็นช่องข้อมูล', size: 'sm', sticky: true,
      body: el('div', { class: 'stack' },
        el('div', { class: 'field' }, el('label', { text: 'ชนิดข้อมูล' }), type, el('div', { class: 'hint', text: 'ไม่แน่ใจให้เลือก "ข้อความ" · ระบบตรวจข้อมูลเดิมในคอลัมน์ก่อน ถ้าไม่ตรงชนิดจะไม่สร้าง (กันข้อมูลเดิมหาย) · คอลัมน์ที่มีสูตรรับเป็นช่องกรอกไม่ได้' })),
        optBox, el('label', { class: 'check' }, pii, 'เป็นข้อมูลส่วนบุคคล (แสดงเฉพาะผู้มีสิทธิ์ดูข้อมูลส่วนบุคคล)'),
        el('div', { class: 'notice', text: 'มีข้อมูลเดิม ' + fmtNum(c.filled) + ' ช่อง — คงอยู่ตามเดิม · ช่องนี้จะแสดงในฟอร์มเพิ่ม/แก้ไขและเลือกแสดงในตารางได้ เฉพาะหมวด ' + S.config.schemas[cat].label })),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), save] });
    var rid = newRid();
    save.addEventListener('click', function () {
      var def = { type: type.value, pii: pii.checked, options: type.value === 'select' ? opts.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [] };
      busy(save, function () { return authed('adoptColumn', cat, c.col, c.header, def, rid).then(function (res) { m.close(); return after(res); }).catch(showError); });
    });
  }

  function okBadge(ok, yes, no) { return el('span', { class: 'badge ' + (ok ? 'b-ok' : 'b-bad'), text: ok ? (yes || 'ตั้งค่าแล้ว') : (no || 'ยังไม่ได้ตั้งค่า') }); }

  function statusCard(sys) {
    var rows = [
      ['Script Properties', Object.keys(sys.secretStatus).map(function (k) { return el('span', { class: 'chip' }, k + ' ', okBadge(sys.secretStatus[k], '✓', '✗')); })],
      ['Trigger ตามเวลา', sys.triggers.length ? sys.triggers.join(', ') : el('span', { class: 'badge b-bad', text: 'ยังไม่ได้สร้าง' })],
      ['โฟลเดอร์ Drive', okBadge(sys.foldersReady, 'พร้อม', 'ยังไม่มี — สร้างเมื่อแนบไฟล์ครั้งแรก')],
      ['โควตาอีเมลคงเหลือวันนี้', String(sys.mailQuotaRemaining)],
      ['สำรองข้อมูลล่าสุด', sys.lastBackupAt ? fmtTs(sys.lastBackupAt) : el('span', { class: 'badge b-bad', text: 'ยังไม่เคยสำรอง' })],
      ['LINE', [okBadge(sys.line.enabled, 'เปิด', 'ปิด'), ' Token ', okBadge(sys.line.tokenSet, '✓', '✗'), ' กลุ่ม ', okBadge(sys.line.groupSet, sys.line.group || '✓', '✗'),
        sys.line.usage && sys.line.usage.used !== null ? ' · ใช้แล้ว ' + sys.line.usage.used + (sys.line.usage.quota ? '/' + sys.line.usage.quota : '') + ' ข้อความ (งบระบบ ' + sys.line.budget + ')' : '']],
      ['แจ้งการอัปเดตทาง LINE', [el('span', { class: 'chip' }, 'รูปแบบ: ' + (sys.line.flex ? 'การ์ดสี' : 'ข้อความ')),
        el('span', { class: 'chip' }, 'แจ้ง: ' + ({ OFF: 'ปิด', IMPORTANT: 'เฉพาะเรื่องสำคัญ', ALL: 'ทุกการเปลี่ยนแปลง' }[sys.line.changeMode] || sys.line.changeMode)),
        el('span', { class: 'chip' }, 'รอส่ง ' + (sys.line.queue || 0) + ' รายการ'),
        ' ปุ่มเปิดระบบ ', okBadge(sys.line.linkReady, 'พร้อม', 'ยังไม่มีลิงก์')]],
      ['Gemini AI', [okBadge(sys.ai.enabled, 'เปิด', 'ปิด'), ' API Key ', okBadge(sys.ai.keySet, '✓', '✗'), ' · ' + sys.ai.model + ' · ใช้วันนี้ ' + sys.ai.usedToday + '/' + sys.ai.limit + ' (รวม) · คนละ ' + (sys.ai.perUser || '-') + ' ครั้ง/วัน']],
      ['สภาพแวดล้อม', el('span', { class: 'env-badge' + (sys.env === 'PRODUCTION' ? ' prod' : ''), text: sys.env })]
    ];
    var card = el('div', { class: 'card card-pad' }, el('h3', { text: 'สถานะระบบ' }),
      el('div', { class: 'kv' }, rows.map(function (r) { return el('div', { class: 'item' }, el('div', { class: 'k', text: r[0] }), el('div', { class: 'v' }, r[1])); })));
    if (sys.line.pendingGroups && sys.line.pendingGroups.length) {
      card.appendChild(el('div', { class: 'section' }, el('div', { class: 'notice gold', text: 'พบกลุ่ม LINE ที่เชิญบอทเข้าไป กด "ใช้กลุ่มนี้" — ระบบจะตรวจกับ LINE ว่าบอทอยู่ในกลุ่มจริงก่อนบันทึก' }),
        sys.line.pendingGroups.map(function (g) {
          return el('div', { class: 'file-row' }, el('span', { class: 'name mono', text: g.id }), el('span', { class: 'muted small', text: fmtTs(g.at) }),
            el('button', { class: 'btn btn-sm btn-primary', text: 'ใช้กลุ่มนี้', on: { click: function (ev) {
              var b = ev.currentTarget;
              busy(b, function () { return authed('setLineGroup', g.id, newRid()).then(function (r) { toast('ตั้งค่ากลุ่ม "' + (r.groupName || g.id) + '" แล้ว', 'ok'); navigate('settings'); }).catch(showError); });
            } } }));
        })));
    }
    return card;
  }

  /** v1.10 ผลตรวจโมเดล AI (models.get ของ Google — ไม่ใช้โควตาสร้างข้อความ) */
  function showAIModels(r) {
    var line = function (title, x) {
      return el('div', { class: 'row' }, el('span', { class: 'badge ' + (x.ok ? 'b-ok' : 'b-bad'), text: x.ok ? 'ใช้ได้' : 'ใช้ไม่ได้' }),
        el('strong', { text: title + ': ' }), el('span', { class: 'mono', text: x.model || '–' }), el('span', { class: 'muted small', text: (x.displayName ? ' · ' + x.displayName : '') + ' · ' + x.detail }));
    };
    var m = openModal({ title: 'ตรวจโมเดล AI (Gemini ' + r.apiVersion + ')', body: el('div', { class: 'stack' },
      line('โมเดลหลัก (GEMINI_MODEL)', r.primary), line('โมเดลสำรอง (GEMINI_MODEL_FALLBACK)', r.fallback),
      el('div', { class: 'notice', text: 'เปลี่ยนรุ่น: คัดลอกชื่อจากรายการด้านล่าง → ตั้งค่าระบบ → ช่อง GEMINI_MODEL → บันทึก → กด "ตรวจโมเดล AI" อีกครั้ง · ถ้าโมเดลหลักเรียกไม่ได้ ระบบใช้โมเดลสำรองให้อัตโนมัติและแจ้งในตรวจสุขภาพระบบ' }),
      r.available.length ? el('details', null, el('summary', { text: 'โมเดลที่ API Key นี้ใช้สร้างข้อความได้ (' + r.available.length + ' รายการ จาก Google)' }),
        el('div', { class: 'small mono', style: { maxHeight: '260px', overflow: 'auto' } }, r.available.map(function (a) { return el('div', { text: a.model + (a.displayName ? '  — ' + a.displayName : '') }); }))) :
        el('div', { class: 'muted small', text: 'ดึงรายชื่อโมเดลไม่ได้ในขณะนี้' })),
      foot: [el('button', { class: 'btn', text: 'ปิด', on: { click: function () { m.close(); } } })] });
  }
  function actionBtn(label, fn, cls) {
    var b = el('button', { class: 'btn ' + (cls || ''), text: label });
    b.addEventListener('click', function () { busy(b, fn); });
    return b;
  }
  function actionsCard(sys) {
    var lineMsg = function (r) { toast(r.message || r.status, r.status === 'SENT' ? 'ok' : 'warn'); };
    return el('div', { class: 'card card-pad section' }, el('h3', { text: 'การดำเนินการ' }),
      el('div', { class: 'row' },
        actionBtn('อัปเดตโครงสร้างชีต', function () { return authed('setupSystem').then(function (r) { toast('ตรวจโครงสร้างแล้ว' + (r.created.length ? ' · สร้างชีต ' + r.created.join(', ') : ''), 'ok'); (r.notes || []).filter(function (n) { return /หัวคอลัมน์/.test(n); }).forEach(function (n) { toast(n, /ไม่สำเร็จ|ยังไม่/.test(n) ? 'warn' : 'ok'); }); }).catch(showError); }),
        actionBtn('ตรวจโมเดล AI', function () { return authed('testAIModels').then(showAIModels).catch(showError); }),
        actionBtn('ตรวจ/สร้าง Trigger', function () { return authed('createScheduledTriggers').then(function (r) { toast((r.unchanged ? 'Trigger ครบอยู่แล้ว ไม่สร้างซ้ำ: ' : 'สร้าง Trigger แล้ว: ') + r.schedule, 'ok'); navigate('settings'); }).catch(showError); }),
        actionBtn('สร้าง/ตรวจโฟลเดอร์ Drive', function () { return authed('createRequiredFolders').then(function (r) { toast('โฟลเดอร์พร้อม' + (r.warnings.length ? ' · ' + r.warnings.join(' / ') : ''), r.warnings.length ? 'warn' : 'ok'); }).catch(showError); }),
        actionBtn('ตรวจสุขภาพระบบ', function () { return authed('healthCheck').then(showHealth).catch(showError); }, 'btn-primary')),
      canG('sendLine') ? el('div', { class: 'row section' },
        actionBtn('ทดสอบส่ง LINE', function () { return authed('testLine', newRid()).then(lineMsg).catch(showError); }),
        actionBtn('ส่งรายงานสัปดาห์', function () { return authed('sendWeeklyReport').then(lineMsg).catch(showError); }),
        actionBtn('ส่งรายงานเดือน', function () { return authed('sendMonthlyReport').then(lineMsg).catch(showError); }),
        actionBtn('ส่งข้อความถึงกลุ่ม', function () { lineCompose(); return Promise.resolve(); })) : null,
      canG('backup') ? el('div', { class: 'row section' },
        actionBtn('สำรองข้อมูลตอนนี้', function () {
          return authed('backupData', newRid()).then(function (r) { toast(r.status === 'SUCCESS' ? 'สำรองข้อมูลสำเร็จ: ' + r.name : 'สำรองไม่สำเร็จ: ' + r.message, r.status === 'SUCCESS' ? 'ok' : 'err'); navigate('settings'); }).catch(showError);
        }, 'btn-gold')) : null);
  }

  function showHealth(h) {
    var cls = { ok: 'b-ok', warn: 'b-soon', fail: 'b-bad' }, txt = { ok: 'ปกติ', warn: 'ควรตรวจ', fail: 'ต้องแก้' };
    var groups = {};
    h.items.forEach(function (i) { (groups[i.group] = groups[i.group] || []).push(i); });
    openModal({ title: 'ผลตรวจสุขภาพระบบ', body: el('div', { class: 'stack' },
      el('div', { class: 'row' }, el('span', { class: 'badge b-ok', text: 'ปกติ ' + h.ok }), el('span', { class: 'badge b-soon', text: 'ควรตรวจ ' + h.warn }),
        el('span', { class: 'badge b-bad', text: 'ต้องแก้ ' + h.fail }), el('span', { class: 'muted small', text: 'ตรวจเมื่อ ' + fmtTs(h.checkedAt) })),
      Object.keys(groups).map(function (g) {
        return el('div', null, el('h3', { text: g }), el('div', { class: 'list-rows' }, groups[g].map(function (i) {
          return el('div', { class: 'lrow', style: { cursor: 'default' } },
            el('div', { class: 'main-t' }, el('div', { class: 't1', text: i.name }), el('div', { class: 't2', text: i.detail })),
            el('span', { class: 'badge ' + cls[i.status], text: txt[i.status] }));
        })));
      })) });
  }

  function lineCompose() {
    var txt = el('textarea', { class: 'input', maxLength: 1000, rows: 4 });
    var send = el('button', { class: 'btn btn-primary', text: 'ส่ง' });
    var m = openModal({ title: 'ส่งข้อความถึงกลุ่ม LINE', size: 'sm',
      body: el('div', { class: 'stack' }, el('div', { class: 'notice gold', text: 'ห้ามใส่ข้อมูลส่วนบุคคล เลขบัตร ที่อยู่ หรือจำนวนเงินของบุคคล ข้อความจะระบุชื่อผู้ส่ง' }), txt),
      foot: [el('button', { class: 'btn', text: 'ยกเลิก', on: { click: function () { m.close(); } } }), send] });
    var rid = newRid();
    send.addEventListener('click', function () {
      busy(send, function () { return authed('sendLineNotification', txt.value, rid).then(function (r) { toast(r.message, r.status === 'SENT' ? 'ok' : 'warn'); if (r.status === 'SENT') m.close(); }).catch(showError); });
    });
  }

  function backupCard(bk) {
    var card = el('div', { class: 'card section' }, el('div', { class: 'card-pad', style: { paddingBottom: 0 } },
      el('h3', { text: 'ประวัติการสำรองข้อมูล' }), el('div', { class: 'muted small', text: 'เก็บไฟล์สำรอง ' + bk.retentionDays + ' วัน · Audit Log ไม่ใช่การสำรองข้อมูล' })));
    if (!bk.rows.length) { card.appendChild(el('div', { class: 'empty', text: 'ยังไม่มีการสำรองข้อมูล' })); return card; }
    card.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', null, el('tr', null, ['เวลา', 'ผู้สั่ง', 'สถานะ', 'รายละเอียด', ''].map(function (h) { return el('th', { text: h }); }))),
      el('tbody', null, bk.rows.map(function (r) {
        var ok = /SUCCESS|PASS/.test(r.status);
        return el('tr', { style: { cursor: 'default' } },
          el('td', { attrs: { 'data-label': 'เวลา' }, text: fmtTs(r.timestamp) }),
          el('td', { attrs: { 'data-label': 'ผู้สั่ง' }, text: r.triggeredBy }),
          el('td', { attrs: { 'data-label': 'สถานะ' } }, el('span', { class: 'badge ' + (ok ? 'b-ok' : 'b-bad'), text: r.status })),
          el('td', { attrs: { 'data-label': 'รายละเอียด' } }, r.message, r.backupName ? el('div', { class: 'mono small muted', text: r.backupName }) : null),
          el('td', { attrs: { 'data-label': '' } }, r.status === 'SUCCESS' && r.backupFileId && canG('restore') ? actionBtn('ทดสอบกู้คืน', function () {
            return authed('testRestoreBackup', r.backupFileId, newRid()).then(function (t) {
              openModal({ title: 'ผลทดสอบกู้คืน — ' + t.backupName, body: el('div', { class: 'stack' },
                el('div', { class: t.ok ? 'notice' : 'errors', text: (t.ok ? 'ผ่าน: ' : 'ไม่ผ่าน: ') + t.note }),
                el('table', { class: 'data' }, el('thead', null, el('tr', null, ['ชีต', 'มีในไฟล์สำรอง', 'คอลัมน์ครบ', 'แถว (สำรอง/ปัจจุบัน)'].map(function (h) { return el('th', { text: h }); }))),
                  el('tbody', null, t.sheets.map(function (s) {
                    return el('tr', { style: { cursor: 'default' } }, el('td', { attrs: { 'data-label': 'ชีต' }, text: s.name }),
                      el('td', { attrs: { 'data-label': 'มี' } }, okBadge(s.present, '✓', '✗')), el('td', { attrs: { 'data-label': 'คอลัมน์' } }, okBadge(s.headersOk, '✓', 'ขาด')),
                      el('td', { attrs: { 'data-label': 'แถว' }, text: s.backupRows + ' / ' + s.currentRows }));
                  })))) });
            }).catch(showError);
          }, 'btn-sm') : null));
      })))));
    return card;
  }

  function settingsForm(set) {
    var items = {}; set.items.forEach(function (i) { items[i.key] = i; });
    var inputs = {};
    function input(i) {
      var n;
      if (i.type === 'bool') n = el('select', { class: 'input' }, el('option', { value: 'true', text: 'เปิด', selected: i.value === 'true' }), el('option', { value: 'false', text: 'ปิด', selected: i.value !== 'true' }));
      else if (i.type === 'list1') n = el('select', { class: 'input' }, (i.opts || []).map(function (o) { return el('option', { value: o, text: o, selected: o === i.value }); }));
      else if (i.type === 'int') n = el('input', { class: 'input', type: 'number', value: i.value, attrs: { min: i.min, max: i.max, step: 1 } });
      else if (i.type === 'list' || i.type === 'ailimits') n = el('textarea', { class: 'input', rows: 4, value: String(i.value).split('|').join('\n') });
      else if (i.type === 'folder') n = el('input', { class: 'input mono', value: i.value, maxLength: 80, placeholder: 'เว้นว่าง = ใช้โฟลเดอร์ระบบเดิม · หรือวาง Folder ID' });
      else if (i.type === 'textarea') n = el('textarea', { class: 'input', rows: 4, value: i.value, maxLength: 5000 });
      else n = el('input', { class: 'input', value: i.value, maxLength: 200 });
      n.setAttribute('aria-label', i.description);
      inputs[i.key] = n;
      return el('div', { class: 'field' + (i.type === 'list' || i.type === 'textarea' || i.type === 'ailimits' ? ' span-2' : '') },
        el('label', { text: i.description }), n, el('div', { class: 'hint mono', text: i.key + (i.type === 'list' || i.type === 'ailimits' ? ' · หนึ่งรายการต่อบรรทัด' : '') + (i.type === 'ailimits' ? ' · ตัวอย่าง ASK=20/400' : '') + (i.min !== null && i.type === 'int' ? ' · ' + i.min + '–' + i.max : '') }));
    }
    var used = {};
    var groups = SETTING_GROUPS.map(function (g) {
      return el('div', { class: 'section' }, el('h3', { text: g[0] }), el('div', { class: 'form-grid' }, g[1].filter(function (k) { return items[k]; }).map(function (k) { used[k] = true; return input(items[k]); })));
    });
    var opts = set.items.filter(function (i) { return !used[i.key]; });
    groups.push(el('div', { class: 'section' }, el('h3', { text: 'หมวดหมู่ย่อย (ตัวเลือกในฟอร์ม)' }),
      el('div', { class: 'muted small', style: { marginBottom: '8px' }, text: 'แก้ไขตัวเลือกได้โดยไม่ต้องแก้โค้ด — รายการเดิมที่ใช้ค่าที่ถูกลบออกยังคงแสดงค่าเดิม' }),
      el('div', { class: 'form-grid' }, opts.map(input))));
    var save = el('button', { class: 'btn btn-primary', text: 'บันทึกการตั้งค่า' });
    save.addEventListener('click', function () {
      var changes = {};
      Object.keys(inputs).forEach(function (k) {
        var i = items[k], v = inputs[k].value;
        if (i.type === 'list' || i.type === 'ailimits') v = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join('|');
        if (i.type === 'folder') v = String(v).trim().replace(/^https?:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//, '').replace(/[?#].*$/, '');
        if (String(v) !== String(i.value)) changes[k] = v;
      });
      if (!Object.keys(changes).length) { toast('ไม่มีการเปลี่ยนแปลง', 'warn'); return; }
      var gate = changes.AI_ENABLED === 'true' ? confirmBox({ title: 'เปิดใช้ AI', okText: 'ยืนยันเปิดใช้',
        message: 'ระบบจะส่งตัวเลขสรุป รหัสรายการ คำถามที่ผู้ใช้พิมพ์ และชื่อช่องข้อมูล ไปยัง Google Gemini (ไม่ส่งข้อมูลรายการจริงตอนถาม AI)\nบริการระดับฟรีอาจนำข้อมูลไปใช้พัฒนาผลิตภัณฑ์และอาจมีผู้ตรวจอ่าน\nต้องได้รับอนุมัติตามนโยบายข้อมูลขององค์กรก่อนใช้กับข้อมูลจริง' }) : Promise.resolve({ ok: true });
      gate.then(function (g) {
        if (!g.ok) return;
        busy(save, function () {
          return authed('updateSettings', changes, newRid()).then(function () { toast('บันทึกการตั้งค่าแล้ว', 'ok'); return reloadConfig(); })
            .then(function () { navigate('settings'); })
            .catch(function (e) { showError(e); });
        });
      });
    });
    return el('div', { class: 'card card-pad section' }, el('h3', { text: 'ค่าตั้ง' }), groups, el('div', { class: 'row section' }, el('div', { class: 'spacer' }), save));
  }

  /* ============================== ประวัติการใช้งาน ============================== */

  function renderAudit(main) {
    var q = { page: 1, action: '', category: '', user: '', from: '', to: '', search: '' };
    clear(main);
    main.appendChild(pageHead('ประวัติการใช้งาน (Audit Log)', 'แสดงไม่เกิน 5,000 รายการล่าสุด · ไม่มีการบันทึกรหัสผ่าน Token หรือ API Key'));
    var action = el('select', { class: 'input' }, el('option', { value: '', text: 'ทุกการดำเนินการ' }));
    var category = el('select', { class: 'input' }, el('option', { value: '', text: 'ทุกหมวด' }),
      Object.keys(S.config.schemas).map(function (k) { return el('option', { value: k, text: S.config.schemas[k].label }); }),
      ['auth', 'system'].map(function (k) { return el('option', { value: k, text: k === 'auth' ? 'เข้าสู่ระบบ' : 'ระบบ' }); }));
    var user = el('input', { class: 'input', placeholder: 'อีเมลผู้ใช้' });
    var from = el('input', { class: 'input', type: 'date', attrs: { 'aria-label': 'ตั้งแต่วันที่' } });
    var to = el('input', { class: 'input', type: 'date', attrs: { 'aria-label': 'ถึงวันที่' } });
    var search = el('input', { class: 'input search', type: 'search', placeholder: 'ค้นหารหัสรายการ / Request ID' });
    var box = el('div');
    var btn = el('button', { class: 'btn btn-primary btn-sm', text: 'ค้นหา', on: { click: function () { q.page = 1; load(); } } });
    main.appendChild(el('div', { class: 'card' }, el('div', { class: 'toolbar' }, search, action, category, user, from, to, btn), box));
    function load() {
      q.action = action.value; q.category = category.value; q.user = user.value.trim(); q.from = from.value; q.to = to.value; q.search = search.value.trim();
      clear(box).appendChild(el('div', { class: 'card-pad' }, el('div', { class: 'skeleton' })));
      authed('getAuditLogs', q).then(function (r) {
        if (action.options.length === 1) r.actions.forEach(function (a) { action.appendChild(el('option', { value: a, text: actionLabel(a) + ' (' + a + ')' })); });
        clear(box);
        if (!r.rows.length) { box.appendChild(el('div', { class: 'empty', text: 'ไม่พบรายการ' })); return; }
        box.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
          el('thead', null, el('tr', null, ['เวลา', 'ผู้ใช้', 'การดำเนินการ', 'หมวด', 'รหัสรายการ', 'ผล', 'รายละเอียด'].map(function (h) { return el('th', { text: h }); }))),
          el('tbody', null, r.rows.map(function (x) {
            return el('tr', { style: { cursor: 'default' } },
              el('td', { class: 'nowrap', attrs: { 'data-label': 'เวลา' }, text: fmtTs(x.timestamp) }),
              el('td', { attrs: { 'data-label': 'ผู้ใช้' }, text: x.userEmail }),
              el('td', { attrs: { 'data-label': 'การดำเนินการ' } }, el('span', { class: 'badge ' + (x.action === 'FORBIDDEN' ? 'b-bad' : 'b-progress'), text: actionLabel(x.action) })),
              el('td', { attrs: { 'data-label': 'หมวด' }, text: (S.config.schemas[x.category] && S.config.schemas[x.category].label) || x.category }),
              el('td', { class: 'mono', attrs: { 'data-label': 'รหัส' }, text: x.recordId }),
              el('td', { attrs: { 'data-label': 'ผล' }, text: x.result }),
              el('td', { attrs: { 'data-label': 'รายละเอียด' } }, el('div', { class: 'small pre', text: x.details }), el('div', { class: 'mono small muted', text: x.requestId })));
          })))));
        box.appendChild(el('div', { class: 'pager' }, el('span', { class: 'muted small', text: 'พบ ' + fmtNum(r.total) + ' รายการ' }), el('div', { class: 'spacer' }),
          el('button', { class: 'btn btn-sm', text: '‹ ก่อนหน้า', disabled: r.page <= 1, on: { click: function () { q.page = r.page - 1; load(); } } }),
          el('span', { class: 'small', text: 'หน้า ' + r.page + ' / ' + r.pages }),
          el('button', { class: 'btn btn-sm', text: 'ถัดไป ›', disabled: r.page >= r.pages, on: { click: function () { q.page = r.page + 1; load(); } } })));
      }).catch(function (e) { clear(box).appendChild(el('div', { class: 'empty', text: e.message })); });
    }
    load();
  }

  var lastPageError = 0;
  function pageError() {
    if (Date.now() - lastPageError < 5000) return; // ไม่แจ้งซ้ำรัว ๆ
    lastPageError = Date.now();
    toast('เกิดข้อผิดพลาดในหน้าเว็บ หากหน้าจอไม่ตอบสนอง กรุณารีเฟรช (F5)', 'err');
  }
  window.addEventListener('error', function (ev) { if (ev && ev.target && ev.target !== window) return; pageError(); });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    if (r && r.code && r.message) { if (r.code !== 'SESSION_EXPIRED' && r.code !== 'AUTH_REQUIRED') showError(r); }
    else pageError();
    if (ev && ev.preventDefault) ev.preventDefault();
  });
  window.addEventListener('online', function () { if (S.token) pollTick(true); });
  window.addEventListener('offline', function () { setLive('off'); });
  boot();
})();
