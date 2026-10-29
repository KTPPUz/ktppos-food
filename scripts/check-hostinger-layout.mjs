import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve('.artifacts/hostinger'),app=path.join(root,'laravel'),web=path.join(root,'public_html');
for(const file of ['vendor/autoload.php','artisan','.env.example'])assert.ok(fs.existsSync(path.join(app,file)),file);
for(const file of ['index.php','index.html','.htaccess','.user.ini'])assert.ok(fs.existsSync(path.join(web,file)),file);
const index=fs.readFileSync(path.join(web,'index.php'),'utf8');
assert.ok(index.includes("__DIR__.'/../laravel/vendor/autoload.php'"));
assert.ok(index.includes('$app->usePublicPath(__DIR__)'));
const forbidden=file=>file==='.env'||file.startsWith('.env.')&&file!=='.env.example'||/\.(sql|sqlite(?:-shm|-wal)?|log|pem|key)$/.test(file);
function inspect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),`Unexpected symlink: ${file}`);
 if(entry.isDirectory()){if(entry.name!=='vendor')inspect(file);}else assert.ok(!forbidden(entry.name),`Private file in package: ${file}`);
}}
inspect(root);
assert.ok(!fs.existsSync(path.join(app,'bootstrap/cache/config.php')),'Machine config cache must not ship');
assert.ok(!fs.existsSync(path.join(app,'vendor/phpunit')),'Development dependencies must not ship');
assert.deepEqual((fs.existsSync(path.join(app,'storage/app/menu-images'))?fs.readdirSync(path.join(app,'storage/app/menu-images')):[]).filter(name=>name!=='.gitignore'),[],'Uploaded images must be migrated separately');
const installed=JSON.parse(fs.readFileSync(path.join(app,'vendor/composer/installed.json'),'utf8'));assert.equal(installed.dev,false);
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g))assert.ok(fs.existsSync(path.join(web,match[1])),`Missing asset: ${match[1]}`);
const release=JSON.parse(fs.readFileSync(path.join(root,'RELEASE.json'),'utf8'));
for(const [file,hash] of Object.entries(release.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
assert.ok(Object.keys(release.files).some(file=>file.endsWith('.ttf')),'Receipt fonts missing');
console.log('Hostinger package checks passed: public entry point, assets/fonts, production vendor and no private data.');
