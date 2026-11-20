// Собирает папку www — веб-часть Кинозала для Android-приложения (тот же код, что в программе для Windows и на сайте).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const files = ['index.html', 'messenger.js', 'rawprev.js', 'viewers.js', 'messenger.css', 'theme.js', 'theme.css', 'mobile.css', 'craft.css', 'web.js', 'android.js', 'manifest.webmanifest', 'package.json'];
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['vendor', 'icons']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
console.log('www собрана:', fs.readdirSync(out).join(', '));
