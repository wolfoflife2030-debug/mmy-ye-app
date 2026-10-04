// يُشغَّل بعد "npx cap add android": يضيف دعم البصمة (BiometricPrompt) للمشروع المولَّد. آمن للتكرار.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const android = path.join(root, 'android');
if (!fs.existsSync(android)) { console.error('مجلد android غير موجود — شغّل: npx cap add android'); process.exit(1); }

const appId = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
const javaDir = path.join(android, 'app', 'src', 'main', 'java', ...appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ['BiometricGatePlugin.java', 'MainActivity.java']) {
  const src = fs.readFileSync(path.join(root, 'native', 'android', f), 'utf8').replace(/__PACKAGE__/g, appId);
  fs.writeFileSync(path.join(javaDir, f), src);
}

// build.gradle: مكتبة البصمة
const gradle = path.join(android, 'app', 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
if (!g.includes('androidx.biometric:biometric')) {
  if (!/^dependencies\s*\{/m.test(g)) throw new Error('تعذّر العثور على dependencies في app/build.gradle');
  g = g.replace(/^dependencies\s*\{/m, 'dependencies {\n    implementation "androidx.biometric:biometric:1.1.0"');
  fs.writeFileSync(gradle, g);
}

// AndroidManifest: صلاحية البصمة
const mf = path.join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('android.permission.USE_BIOMETRIC')) {
  m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />\n</manifest>');
  fs.writeFileSync(mf, m);
}
console.log('تم تجهيز دعم البصمة لأندرويد ✔  (' + appId + ')');
