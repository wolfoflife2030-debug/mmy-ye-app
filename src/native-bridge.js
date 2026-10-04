/* طبقة التوافق مع التطبيق الأصلي (أندرويد / ويندوز) — تُحمَّل بعد سكربتات النظام ولا تعدّل ملفه.
   - البصمة: BiometricPrompt على أندرويد، Windows Hello على ويندوز (بدل WebAuthn غير المدعوم داخل WebView/Electron).
   - أندرويد: حفظ الملفات المصدَّرة عبر قائمة المشاركة/الحفظ. */
(function () {
  'use strict';
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const isElectron = /Electron\//.test(navigator.userAgent) && !!window.nativeBio;
  if (!isAndroid && !isElectron) return;   // متصفح عادي: يبقى سلوك النظام الأصلي كما هو

  const plug = (name) => (cap.Plugins && cap.Plugins[name]) || cap.registerPlugin(name);
  const appName = () => { try { return getProgramName(); } catch (_) { return 'MMY.YE'; } };

  /* ---------- 1) مزوّد البصمة الموحّد ---------- */
  if (isAndroid) {
    const P = plug('BiometricGate');
    window.NativeBio = {
      kind: 'android',
      available: async () => { try { return !!(await P.isAvailable()).available; } catch (_) { return false; } },
      verify: async (reason) => {
        try { await P.authenticate({ title: appName(), subtitle: reason || '', cancel: 'إلغاء' }); return { ok: true }; }
        catch (e) {
          const code = String((e && e.code) || '');
          return { ok: false, cancelled: ['5', '10', '13'].includes(code), error: (e && e.message) || '' };
        }
      }
    };
  } else {
    window.NativeBio = {
      kind: 'windows',
      available: () => window.nativeBio.available().catch(() => false),
      verify: (reason) => window.nativeBio.verify(reason || appName()).catch((e) => ({ ok: false, error: String(e) }))
    };
  }

  /* ---------- 2) استبدال دوال البصمة في الصفحة ---------- */
  const NB = window.NativeBio;
  let hwReady = false, autoTried = false;
  const isLockActive = () => !!document.getElementById('lock')?.classList.contains('active');
  const kindMsg = {
    android: { none: 'لا توجد بصمة مفعّلة على هذا الجهاز. أضف بصمة من إعدادات أندرويد ← الأمان ثم أعد المحاولة.', name: 'بصمة الإصبع' },
    windows: { none: 'Windows Hello غير مفعّل. فعّله من إعدادات ويندوز ← الحسابات ← خيارات تسجيل الدخول.', name: 'Windows Hello' }
  }[NB.kind];

  const savedNative = () => { try { const r = biometricStored(); return r && r.native ? r : null; } catch (_) { return null; } };

  window.biometricSupported = function () { return hwReady; };

  window.updateBiometricUI = async function () {
    const btn = document.getElementById('lock-biometric-btn'), status = document.getElementById('biometric-status'),
      reg = document.getElementById('register-biometric-btn'), rem = document.getElementById('remove-biometric-btn'),
      note = document.getElementById('lock-note');
    const rec = savedNative();
    if (btn) btn.disabled = !hwReady || !rec;
    if (reg) reg.disabled = !hwReady;
    if (rem) rem.disabled = !rec;
    if (status) {
      status.className = 'biometric-status';
      if (!hwReady) { status.classList.add('warn'); status.textContent = kindMsg.none; }
      else if (rec) { status.classList.add('ok'); status.textContent = 'تم تسجيل ' + kindMsg.name + ' لهذا الجهاز. يمكنك استخدامها من شاشة الدخول.'; }
      else status.textContent = 'الجهاز جاهز: اضغط «تسجيل هذا الجهاز» ثم أكّد ب' + kindMsg.name + '.';
    }
    if (note) note.textContent = rec && hwReady ? 'ادخل بـ' + kindMsg.name + ' أو أدخل كلمة المرور.' : 'سجّل ' + kindMsg.name + ' من إعدادات البرنامج للدخول السريع.';
  };

  window.registerBiometric = async function () {
    if (!hwReady) { toast(kindMsg.none, 'danger'); return; }
    const r = await NB.verify('تأكيد تسجيل ' + kindMsg.name + ' لهذا الجهاز');
    if (!r.ok) { toast(r.cancelled ? 'تم إلغاء التحقق' : 'تعذر التحقق: ' + (r.error || r.result || ''), 'danger'); return; }
    MPStorage.set(biometricKey(), JSON.stringify({ native: true, kind: NB.kind, createdAt: Date.now() }));
    await updateBiometricUI();
    toast('تم تسجيل ' + kindMsg.name + ' لهذا الجهاز');
  };

  window.loginWithBiometric = async function () {
    const rec = savedNative();
    if (!rec) { toast('سجّل ' + kindMsg.name + ' أولاً من إعدادات البرنامج (بعد الدخول بكلمة المرور)', 'danger'); return; }
    if (!hwReady) { toast(kindMsg.none, 'danger'); return; }
    const r = await NB.verify('الدخول إلى ' + appName());
    if (!r.ok) { if (!r.cancelled) toast('فشل التحقق: ' + (r.error || r.result || ''), 'danger'); return; }
    unlockApp(); await loadRemoteDB(); renderAll();
    toast('تم تسجيل الدخول بنجاح');
  };

  // الفحص الأولي لدعم الجهاز ثم تحديث الواجهة (+ مطالبة تلقائية واحدة عند فتح شاشة الدخول)
  const boot = async () => {
    try { hwReady = !!(await NB.available()); } catch (_) { hwReady = false; }
    try { await updateBiometricUI(); } catch (_) {}
    if (!autoTried && hwReady && savedNative() && isLockActive()) { autoTried = true; setTimeout(() => { if (isLockActive()) loginWithBiometric(); }, 450); }
  };
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);

  /* ---------- 3) أندرويد: حفظ الملفات المصدَّرة ---------- */
  if (isAndroid) {
    const blobs = new Map();
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) { const u = origCreate(obj); if (obj instanceof Blob) blobs.set(u, obj); return u; };

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const href = this.href, name = this.download;
      if (name && href && href.startsWith('blob:') && blobs.has(href)) {
        const reader = new FileReader();
        reader.onload = async function () {
          try {
            const base64 = String(reader.result).split(',')[1] || '';
            const res = await plug('Filesystem').writeFile({ path: name, data: base64, directory: 'CACHE' });
            await plug('Share').share({ title: name, url: res.uri, dialogTitle: 'حفظ الملف' });
          } catch (err) {
            if (typeof window.toast === 'function') window.toast('تعذّر حفظ الملف: ' + ((err && err.message) || err), 'danger');
          }
        };
        reader.readAsDataURL(blobs.get(href));
        return;
      }
      return origClick.apply(this, arguments);
    };
    try { plug('StatusBar').setBackgroundColor({ color: '#FFFFFF' }); plug('StatusBar').setStyle({ style: 'LIGHT' }); } catch (_) {}
  }
})();
